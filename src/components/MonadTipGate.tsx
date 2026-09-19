"use client";

import { useState } from "react";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  MONAD_REVEAL_PASS,
  MONAD_TIP_AMOUNT,
  monadExplorerTx,
} from "@/lib/monad/config";
import { monadAddEthereumParams } from "@/lib/monad/chain";
import { encodeRevealCalldata, tipValueWei } from "@/lib/monad/tip";
import {
  isWalletTipUnlocked,
  markWalletTipUnlocked,
} from "@/lib/monad/unlock";
import {
  getMetaMaskProvider,
  type EthereumProvider,
} from "@/lib/multichain/provider";
import { MonadMark } from "./MonadMark";
import { shortenAddress } from "@/lib/format";

async function ensureMonad(provider: EthereumProvider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  const want = `0x${MONAD_CHAIN_ID.toString(16)}`;
  if (chainId?.toLowerCase() === want) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: want }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [monadAddEthereumParams()],
      });
      return;
    }
    throw err;
  }
}

type Props = {
  /** Primary EVM address that must tip (payer). */
  payerAddress: string | null;
  unlocked: boolean;
  onUnlocked: (txHash: string) => void;
};

export function MonadTipGate({ payerAddress, unlocked, onUnlocked }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualHash, setManualHash] = useState("");
  const [lastTx, setLastTx] = useState<string | null>(null);

  const verifyHash = async (txHash: string, from?: string) => {
    const res = await fetch("/api/monad/tip/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash,
        from: from || payerAddress || undefined,
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      txHash?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Tip verification failed");
    }
    const hash = data.txHash || txHash;
    if (payerAddress) markWalletTipUnlocked(payerAddress, hash);
    setLastTx(hash);
    onUnlocked(hash);
  };

  const onTip = async () => {
    setError(null);
    if (!payerAddress) {
      setError("Connect an EVM wallet to tip in MON.");
      return;
    }
    if (isWalletTipUnlocked(payerAddress)) {
      onUnlocked(manualHash || "cached");
      return;
    }

    try {
      const statusRes = await fetch(
        `/api/monad/tip/verify?address=${encodeURIComponent(payerAddress)}`,
      );
      const status = (await statusRes.json()) as { unlocked?: boolean };
      if (status.unlocked) {
        markWalletTipUnlocked(payerAddress, "onchain");
        onUnlocked("onchain");
        return;
      }
    } catch {
      /* fall through to wallet tip */
    }

    setPending(true);
    try {
      const provider = await getMetaMaskProvider();
      if (!provider) {
        throw new Error(
          "Unlock MetaMask to send the MON tip. Phantom is only used for Solana and will not be asked to sign.",
        );
      }
      await ensureMonad(provider);
      const mmAccounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const from =
        mmAccounts.find(
          (addr) => addr.toLowerCase() === payerAddress.toLowerCase(),
        ) || mmAccounts[0];
      if (!from) {
        throw new Error("No MetaMask account available for the MON tip.");
      }
      const valueHex = `0x${tipValueWei().toString(16)}`;
      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: MONAD_REVEAL_PASS,
            value: valueHex,
            data: encodeRevealCalldata(),
            chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
          },
        ],
      })) as string;

      setLastTx(txHash);
      // Monad ~400ms blocks / ~800ms finality
      await new Promise((r) => setTimeout(r, 1500));
      await verifyHash(txHash, from);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/insufficient|funds|balance/i.test(msg)) {
        setError(
          `Need at least ${MONAD_TIP_AMOUNT} MON on Monad (${MONAD_CHAIN_ID}) plus gas.`,
        );
      } else if (/reject|denied|4001/i.test(msg)) {
        setError("Tip cancelled in wallet.");
      } else {
        setError(msg || "Tip failed");
      }
    } finally {
      setPending(false);
    }
  };

  const onManualVerify = async () => {
    setError(null);
    if (!manualHash.trim()) {
      setError("Paste a Monad tip transaction hash.");
      return;
    }
    setPending(true);
    try {
      await verifyHash(manualHash.trim(), payerAddress || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed");
    } finally {
      setPending(false);
    }
  };

  if (unlocked) {
    return (
      <div
        className="tip-banner tip-unlocked"
        id="tip-gate"
        role="status"
      >
        <MonadMark size={28} />
        <p>
          <strong>Tokens unlocked</strong> with a {MONAD_TIP_AMOUNT} MON tip on
          Monad.
          {lastTx && lastTx.startsWith("0x") ? (
            <>
              {" "}
              <a
                href={monadExplorerTx(lastTx)}
                target="_blank"
                rel="noreferrer"
              >
                View tip
              </a>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div
      className="tip-gate"
      id="tip-gate"
      role="region"
      aria-label="Monad tip unlock"
    >
      <div className="tip-copy">
        <p className="tip-eyebrow">
          <MonadMark size={20} />
          Monad · reveal fee
        </p>
        <h2 className="tip-title">
          Tip {MONAD_TIP_AMOUNT} MON to unlock tokens &amp; chains
        </h2>
        <p className="tip-body">
          Your total portfolio value stays visible. Token names and which
          networks they sit on unlock after you call{" "}
          <code>RevealPass.reveal()</code> with {MONAD_TIP_AMOUNT} MON in{" "}
          <strong>MetaMask</strong> on Monad (chain ID {MONAD_CHAIN_ID}
          ). Phantom stays on Solana and is never used for this tip. Tips go to{" "}
          <code title={MONAD_REVEAL_PASS}>
            {shortenAddress(MONAD_REVEAL_PASS)}
          </code>
          .
        </p>
      </div>

      <div className="tip-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !payerAddress}
          onClick={() => void onTip()}
        >
          {pending ? "Confirming tip…" : `Tip ${MONAD_TIP_AMOUNT} MON & unlock`}
        </button>
        <a
          className="linkish"
          href={`${MONAD_EXPLORER_URL}/address/${MONAD_REVEAL_PASS}`}
          target="_blank"
          rel="noreferrer"
        >
          RevealPass contract
        </a>
      </div>

      <div className="tip-manual">
        <p className="extra-chain-copy">
          Already tipped? Paste the transaction hash to verify.
        </p>
        <div className="tip-manual-row">
          <input
            type="text"
            spellCheck={false}
            placeholder="0x…"
            value={manualHash}
            onChange={(e) => setManualHash(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() => void onManualVerify()}
          >
            Verify tip
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {!payerAddress ? (
        <p className="extra-chain-copy">
          Connect MetaMask first — the MON tip is always paid from MetaMask.
        </p>
      ) : null}
    </div>
  );
}

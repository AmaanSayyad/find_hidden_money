"use client";

import { useEffect, useState } from "react";
import { useMultichainWallet } from "@/context/MultichainWallet";
import { shortenAddress } from "@/lib/format";

type Props = {
  compact?: boolean;
};

export function ConnectButton({ compact = false }: Props) {
  const {
    accounts,
    walletKind,
    roster,
    solanaRoster,
    enabledEvm,
    enabledSolana,
    isConnected,
    isPending,
    error,
    connect,
    disconnect,
  } = useMultichainWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return compact ? (
      <button type="button" className="btn-ghost" disabled>
        Connect wallet
      </button>
    ) : (
      <button type="button" className="btn-primary" disabled>
        Connect wallet
      </button>
    );
  }

  if (isConnected) {
    const solCount = enabledSolana.length || solanaRoster.length;
    const evmCount = enabledEvm.length || roster.length;
    const label =
      solCount > 0 && evmCount > 0
        ? `${solCount} SOL · ${evmCount} EVM`
        : evmCount > 1
          ? `${evmCount} wallets`
          : enabledEvm[0]
            ? shortenAddress(enabledEvm[0])
            : accounts.evm[0]
              ? shortenAddress(accounts.evm[0])
              : solCount === 1
                ? shortenAddress(enabledSolana[0] || solanaRoster[0]!.address)
                : solCount > 1
                  ? `${solCount} Solana wallets`
                  : accounts.solana[0]
                    ? shortenAddress(accounts.solana[0])
                    : `${roster.length || 1} wallet`;

    const kindLabel =
      walletKind === "phantom"
        ? "Phantom"
        : walletKind === "metamask"
          ? "MetaMask"
          : "Connected";

    return (
      <div className="connect-row">
        <span
          className="address-chip"
          title={
            [
              ...enabledSolana,
              ...enabledEvm,
              ...accounts.all.map((a) => a.caip10),
            ].join("\n") || undefined
          }
        >
          {kindLabel} · {label}
        </span>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? undefined : "connect-stack"}>
      <button
        type="button"
        className={compact ? "btn-ghost" : "btn-primary"}
        disabled={isPending}
        onClick={() => void connect().catch(() => undefined)}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {compact ? null : (
        <p className="muted-hint">
          MetaMask, Phantom, Rainbow, Coinbase, Trust, OKX and 500+ more via
          Reown — EVM, Solana, Bitcoin, and Tron.
        </p>
      )}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function WalletMark({ kind }: { kind: "metamask" | "phantom" }) {
  const src =
    kind === "metamask" ? "/wallets/metamask.svg" : "/wallets/phantom.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="wallet-mark" src={src} alt="" width={20} height={20} />
  );
}

import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  parseEther,
  toFunctionSelector,
  type Hash,
} from "viem";
import {
  MONAD_REVEAL_PASS,
  MONAD_TIP_AMOUNT,
  MONAD_TIP_AMOUNT_WEI,
  MONAD_TIP_RECIPIENT,
  monadRpcUrl,
} from "./config";
import { monadTestnet } from "./chain";
import { revealPassAbi } from "./reveal-pass";

const REVEAL_SELECTOR = toFunctionSelector("reveal()");

export type TipVerifyResult =
  | {
      ok: true;
      txHash: Hash;
      from: string;
      to: string;
      valueWei: string;
      valueMon: string;
      blockNumber: string;
      contract: typeof MONAD_REVEAL_PASS;
      treasury: typeof MONAD_TIP_RECIPIENT;
    }
  | { ok: false; error: string };

export function getMonadPublicClient() {
  return createPublicClient({
    chain: monadTestnet,
    transport: http(monadRpcUrl()),
  });
}

export async function isAddressRevealed(address: string): Promise<boolean> {
  const client = getMonadPublicClient();
  return client.readContract({
    address: MONAD_REVEAL_PASS,
    abi: revealPassAbi,
    functionName: "isRevealed",
    args: [address as `0x${string}`],
  });
}

export function encodeRevealCalldata(): `0x${string}` {
  return encodeFunctionData({
    abi: revealPassAbi,
    functionName: "reveal",
  });
}

/**
 * Verify a RevealPass.reveal() tip: success, contract, value ≥ tip amount.
 */
export async function verifyMonadTipTx(
  txHash: string,
  expectedFrom?: string,
): Promise<TipVerifyResult> {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: "Invalid transaction hash" };
  }

  const client = getMonadPublicClient();
  const hash = txHash as Hash;

  let receipt;
  let tx;
  try {
    [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash }),
      client.getTransaction({ hash }),
    ]);
  } catch {
    return {
      ok: false,
      error:
        "Transaction not found on Monad Testnet yet — wait a few seconds and retry.",
    };
  }

  if (!receipt || receipt.status !== "success") {
    return {
      ok: false,
      error: "Transaction failed or still pending on Monad Testnet",
    };
  }

  const to = (tx.to || "").toLowerCase();
  if (to !== MONAD_REVEAL_PASS.toLowerCase()) {
    return {
      ok: false,
      error: `Tip must call RevealPass at ${MONAD_REVEAL_PASS}`,
    };
  }

  const input = (tx.input || "0x").toLowerCase();
  if (!input.startsWith(REVEAL_SELECTOR.toLowerCase())) {
    return {
      ok: false,
      error: "Transaction is not a RevealPass.reveal() call",
    };
  }

  const value = tx.value ?? BigInt(0);
  if (value < MONAD_TIP_AMOUNT_WEI) {
    return {
      ok: false,
      error: `Tip too small — need at least ${MONAD_TIP_AMOUNT} MON (got ${formatEther(value)} MON)`,
    };
  }

  const from = tx.from.toLowerCase();
  if (expectedFrom && from !== expectedFrom.toLowerCase()) {
    return {
      ok: false,
      error: "Tip payer does not match the connected wallet",
    };
  }

  return {
    ok: true,
    txHash: hash,
    from,
    to,
    valueWei: value.toString(),
    valueMon: formatEther(value),
    blockNumber: receipt.blockNumber.toString(),
    contract: MONAD_REVEAL_PASS,
    treasury: MONAD_TIP_RECIPIENT,
  };
}

export function tipValueWei(): bigint {
  return parseEther(MONAD_TIP_AMOUNT);
}

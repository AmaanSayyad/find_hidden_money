import { nodeRequest } from "@/lib/balances/http";
import type { PortfolioResult, TokenBalance } from "@/lib/balances/types";
import {
  MONAD_CHAIN_ID,
  MONAD_NATIVE,
  monadRpcUrl,
} from "@/lib/monad/config";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const { status, text } = await nodeRequest(monadRpcUrl(), {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeoutMs: 12_000,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Monad Testnet RPC HTTP ${status}`);
  }
  const data = JSON.parse(text) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result as T;
}

async function fetchMonUsdPrice(): Promise<number | null> {
  try {
    const { status, text } = await nodeRequest(
      "https://api.coingecko.com/api/v3/simple/price?ids=monad&vs_currencies=usd",
      { method: "GET", timeoutMs: 8_000 },
    );
    if (status >= 200 && status < 300) {
      const data = JSON.parse(text) as { monad?: { usd?: number } };
      const price = data.monad?.usd;
      if (typeof price === "number" && Number.isFinite(price)) return price;
    }
  } catch {
    /* ignore — testnet MON often has no reliable USD quote */
  }
  return null;
}

/**
 * Native MON on Monad Testnet (10143). Always scanned for the tip economy.
 */
export async function fetchMonadTestnetPortfolio(
  address: string,
): Promise<PortfolioResult> {
  const warnings: string[] = [];
  const tokens: TokenBalance[] = [];
  const lower = address.toLowerCase();

  const [monPrice, rawNative] = await Promise.all([
    fetchMonUsdPrice(),
    rpc<string>("eth_getBalance", [lower, "latest"]).catch(() => null),
  ]);

  if (rawNative) {
    const raw = BigInt(rawNative);
    if (raw > BigInt(0)) {
      const balance = Number(raw) / 10 ** MONAD_NATIVE.decimals;
      tokens.push({
        chainId: MONAD_CHAIN_ID,
        chainName: "Monad Testnet",
        chainSlug: "monad_testnet",
        symbol: MONAD_NATIVE.symbol,
        name: "MON",
        balance,
        balanceRaw: raw.toString(),
        decimals: MONAD_NATIVE.decimals,
        priceUsd: monPrice,
        valueUsd: monPrice != null ? balance * monPrice : null,
        tokenAddress: null,
        thumbnail: null,
        tokenType: "native",
      });
    }
  } else {
    warnings.push("Monad Testnet: native balance RPC failed.");
  }

  tokens.sort(
    (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
  );
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  if (tokens.length > 0) {
    warnings.push(
      `Monad Testnet: ${tokens.length} native MON balance(s) via testnet-rpc.monad.xyz.`,
    );
  } else {
    warnings.push("Monad Testnet: no native MON balance.");
  }

  return {
    address: lower,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: tokens.length > 0 ? 1 : 0,
    tokens,
    provider: "monad-testnet-rpc",
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

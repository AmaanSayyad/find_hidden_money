import { NATIVE_SCAN_CHAINS } from "./chains";
import { nodeRequest } from "./http";
import { mapPool } from "./pool";
import { fetchUsdPrices } from "./prices";
import type { PortfolioResult, TokenBalance } from "./types";

const PRICE_IDS: Record<string, string> = {
  ETH: "ethereum",
  BNB: "binancecoin",
  POL: "matic-network",
  AVAX: "avalanche-2",
  FTM: "fantom",
  frxETH: "frax-ether",
  FRXETH: "frax-ether",
  CELO: "celo",
  GLMR: "moonbeam",
  CRO: "crypto-com-chain",
  METIS: "metis-token",
  KAVA: "kava",
  SEI: "sei-network",
  MNT: "mantle",
  xDAI: "xdai",
};

const RPC_FALLBACKS: Record<number, string[]> = {
  1: ["https://1rpc.io/eth"],
  56: ["https://bsc-dataseed.binance.org", "https://1rpc.io/bnb"],
  137: ["https://1rpc.io/matic", "https://polygon-rpc.com"],
  42161: ["https://1rpc.io/arb", "https://arb1.arbitrum.io/rpc"],
  10: ["https://1rpc.io/op", "https://mainnet.optimism.io"],
  8453: ["https://1rpc.io/base", "https://mainnet.base.org"],
  43114: ["https://api.avax.network/ext/bc/C/rpc"],
  42220: ["https://forno.celo.org"],
};

async function ethGetBalance(
  rpcs: string[],
  address: string,
): Promise<bigint | null> {
  for (const rpc of [...new Set(rpcs.filter(Boolean))]) {
    try {
      const { status, text } = await nodeRequest(rpc, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [address, "latest"],
        }),
        timeoutMs: 3_500,
      });
      if (status < 200 || status >= 300) continue;
      const data = JSON.parse(text) as {
        result?: string;
        error?: { message?: string };
      };
      if (data.error || typeof data.result !== "string") continue;
      return BigInt(data.result);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Native gas balances on major public EVM RPCs.
 * Used when Ankr is missing or rate-limited. Does not enumerate ERC-20s.
 */
export async function fetchNativeFallbackPortfolio(
  address: string,
  opts: { lite?: boolean } = {},
): Promise<PortfolioResult> {
  const chains = opts.lite
    ? NATIVE_SCAN_CHAINS.slice(0, 8)
    : NATIVE_SCAN_CHAINS;

  const settled = await mapPool(
    chains,
    8,
    async (chain): Promise<TokenBalance | null> => {
      const raw = await ethGetBalance(
        [chain.rpc, ...(RPC_FALLBACKS[chain.chainId] ?? [])],
        address,
      );
      if (raw == null || raw === BigInt(0)) return null;

      const balance = Number(raw) / 10 ** chain.decimals;
      if (balance <= 0) return null;

      return {
        chainId: chain.chainId,
        chainName: chain.name,
        chainSlug: chain.slug,
        symbol: chain.symbol,
        name: `${chain.symbol} (native)`,
        balance,
        balanceRaw: raw.toString(),
        decimals: chain.decimals,
        priceUsd: null,
        valueUsd: null,
        tokenAddress: null,
        thumbnail: null,
        tokenType: "native",
      };
    },
  );

  let tokens = settled.filter((t): t is TokenBalance => t != null);
  const ids = [
    ...new Set(
      tokens
        .map((t) => PRICE_IDS[t.symbol])
        .filter((id): id is string => !!id),
    ),
  ];
  const byId = await fetchUsdPrices(ids);
  const prices = new Map<string, number>();
  for (const [sym, id] of Object.entries(PRICE_IDS)) {
    const usd = byId.get(id);
    if (typeof usd === "number") prices.set(sym, usd);
  }
  tokens = tokens.map((t) => {
    const priceUsd = prices.get(t.symbol) ?? null;
    return {
      ...t,
      priceUsd,
      valueUsd: priceUsd != null ? t.balance * priceUsd : null,
    };
  });

  const chainsHit = new Set(tokens.map((t) => t.chainSlug));
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: chainsHit.size,
    tokens,
    provider: "native-rpc-fallback",
    scannedAt: new Date().toISOString(),
    warnings:
      tokens.length === 0
        ? ["Native RPC: no major-chain gas balances (balances are zero or RPCs timed out)."]
        : [`Native RPC: ${tokens.length} gas balance(s) on major mainnets.`],
  };
}

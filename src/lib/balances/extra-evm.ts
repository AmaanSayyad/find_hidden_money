import { nodeRequest } from "./http";
import type { PortfolioResult, TokenBalance } from "./types";

/**
 * Mainnets that appear in MetaMask but are missing / weak on Ankr Advanced API.
 * Same 0x as other EVM chains — we only need a public RPC + price id.
 */
const EXTRA_MAINNETS = [
  {
    chainId: 999,
    slug: "hyperevm",
    name: "HyperEVM",
    symbol: "HYPE",
    decimals: 18,
    rpc: "https://rpc.hyperliquid.xyz/evm",
    coingeckoId: "hyperliquid",
  },
  {
    chainId: 143,
    slug: "monad",
    name: "Monad",
    symbol: "MON",
    decimals: 18,
    rpc: "https://rpc.monad.xyz",
    coingeckoId: "monad",
  },
  {
    chainId: 1329,
    slug: "sei",
    name: "Sei EVM",
    symbol: "SEI",
    decimals: 18,
    rpc: "https://evm-rpc.sei-apis.com",
    coingeckoId: "sei-network",
  },
  {
    chainId: 5000,
    slug: "mantle",
    name: "Mantle",
    symbol: "MNT",
    decimals: 18,
    rpc: "https://rpc.mantle.xyz",
    coingeckoId: "mantle",
  },
  {
    chainId: 34443,
    slug: "mode",
    name: "Mode",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://mainnet.mode.network",
    coingeckoId: "ethereum",
  },
  {
    chainId: 42220,
    slug: "celo",
    name: "Celo",
    symbol: "CELO",
    decimals: 18,
    rpc: "https://forno.celo.org",
    coingeckoId: "celo",
  },
  {
    chainId: 324,
    slug: "zksync",
    name: "zkSync Era",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://mainnet.era.zksync.io",
    coingeckoId: "ethereum",
  },
  {
    chainId: 81457,
    slug: "blast",
    name: "Blast",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://rpc.blast.io",
    coingeckoId: "ethereum",
  },
  {
    chainId: 130,
    slug: "unichain",
    name: "Unichain",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://mainnet.unichain.org",
    coingeckoId: "ethereum",
  },
  {
    chainId: 59144,
    slug: "linea",
    name: "Linea",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://rpc.linea.build",
    coingeckoId: "ethereum",
  },
  {
    chainId: 14,
    slug: "flare",
    name: "Flare",
    symbol: "FLR",
    decimals: 18,
    rpc: "https://flare-api.flare.network/ext/C/rpc",
    coingeckoId: "flare-networks",
  },
  {
    chainId: 30,
    slug: "rootstock",
    name: "Rootstock",
    symbol: "RBTC",
    decimals: 18,
    rpc: "https://public-node.rsk.co",
    coingeckoId: "rootstock",
  },
] as const;

type PriceCache = { at: number; prices: Map<string, number> };
let priceCache: PriceCache | null = null;

async function fetchPrices(ids: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(ids)];
  if (
    priceCache &&
    Date.now() - priceCache.at < 60_000 &&
    unique.every((id) => priceCache!.prices.has(id))
  ) {
    return priceCache.prices;
  }
  const out = new Map<string, number>(priceCache?.prices ?? []);
  if (unique.length === 0) return out;
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${unique.join(",")}&vs_currencies=usd`;
    const { status, text } = await nodeRequest(url, { timeoutMs: 10_000 });
    if (status >= 200 && status < 300) {
      const data = JSON.parse(text) as Record<string, { usd?: number }>;
      for (const id of unique) {
        const usd = data[id]?.usd;
        if (typeof usd === "number") out.set(id, usd);
      }
    }
  } catch {
    /* ignore */
  }
  priceCache = { at: Date.now(), prices: out };
  return out;
}

async function ethGetBalance(
  rpc: string,
  address: string,
): Promise<bigint | null> {
  try {
    const { status, text } = await nodeRequest(rpc, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
      timeoutMs: 3_000,
    });
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(text) as { result?: string };
    if (typeof data.result !== "string") return null;
    return BigInt(data.result);
  } catch {
    return null;
  }
}

/**
 * Native balances on MetaMask-popular EVM mainnets that Ankr often misses.
 * Does not replace Ankr ERC-20 discovery on indexed chains.
 */
export async function fetchExtraEvmNatives(
  address: string,
): Promise<PortfolioResult> {
  const prices = await fetchPrices(EXTRA_MAINNETS.map((c) => c.coingeckoId));

  const settled = await Promise.all(
    EXTRA_MAINNETS.map(async (chain): Promise<TokenBalance | null> => {
      const raw = await ethGetBalance(chain.rpc, address);
      if (raw == null || raw === BigInt(0)) return null;
      const balance = Number(raw) / 10 ** chain.decimals;
      if (!(balance > 0)) return null;
      const priceUsd = prices.get(chain.coingeckoId) ?? null;
      return {
        chainId: chain.chainId,
        chainName: chain.name,
        chainSlug: chain.slug,
        symbol: chain.symbol,
        name: `${chain.symbol} (native)`,
        balance,
        balanceRaw: raw.toString(),
        decimals: chain.decimals,
        priceUsd,
        valueUsd: priceUsd != null ? balance * priceUsd : null,
        tokenAddress: null,
        thumbnail: null,
        tokenType: "native",
      };
    }),
  );

  const tokens = settled
    .filter((t): t is TokenBalance => t != null)
    .sort(
      (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
    );
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const chains = new Set(tokens.map((t) => t.chainSlug));

  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: chains.size,
    tokens,
    provider: "extra-evm-rpc",
    scannedAt: new Date().toISOString(),
    warnings:
      tokens.length > 0
        ? [
            `Extra MetaMask mainnets: ${tokens.length} native balance(s) on ${chains.size} chain(s) (HyperEVM/Monad/Sei/Mantle/… — Ankr gaps).`,
          ]
        : ["Extra MetaMask mainnets: no native balances on gap chains."],
  };
}

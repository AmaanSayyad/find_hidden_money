import { nodeRequest } from "./http";
import type { TokenBalance } from "./types";

const SYMBOL_IDS: Record<string, string> = {
  ETH: "ethereum",
  WETH: "weth",
  BNB: "binancecoin",
  WBNB: "binancecoin",
  LINK: "chainlink",
  SOL: "solana",
  CELO: "celo",
  USDC: "usd-coin",
  USDT: "tether",
  POL: "matic-network",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  FTM: "fantom",
  FRXETH: "frax-ether",
  GLMR: "moonbeam",
  CRO: "crypto-com-chain",
  METIS: "metis-token",
  KAVA: "kava",
  SEI: "sei-network",
  MNT: "mantle",
  XDAI: "xdai",
  DAI: "dai",
};

const cache = new Map<string, { usd: number; at: number }>();
const CACHE_MS = 5 * 60 * 1000;

export async function fetchUsdPrices(
  ids: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, number>();
  const missing: string[] = [];
  const now = Date.now();
  for (const id of unique) {
    const hit = cache.get(id);
    if (hit && now - hit.at < CACHE_MS) out.set(id, hit.usd);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const fromCg = await fromCoinGecko(missing);
  for (const [id, usd] of fromCg) {
    cache.set(id, { usd, at: now });
    out.set(id, usd);
  }
  const still = missing.filter((id) => !out.has(id));
  if (still.length > 0) {
    const fromLlama = await fromDefillama(still);
    for (const [id, usd] of fromLlama) {
      cache.set(id, { usd, at: now });
      out.set(id, usd);
    }
  }
  return out;
}

async function fromCoinGecko(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`;
    const { status, text } = await nodeRequest(url, { timeoutMs: 10_000 });
    if (status < 200 || status >= 300) return out;
    const data = JSON.parse(text) as Record<string, { usd?: number }>;
    for (const id of ids) {
      const usd = data[id]?.usd;
      if (typeof usd === "number") out.set(id, usd);
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function fromDefillama(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const coins = ids.map((id) => `coingecko:${id}`).join(",");
    const { status, text } = await nodeRequest(
      `https://coins.llama.fi/prices/current/${coins}`,
      { timeoutMs: 10_000 },
    );
    if (status < 200 || status >= 300) return out;
    const data = JSON.parse(text) as {
      coins?: Record<string, { price?: number }>;
    };
    for (const id of ids) {
      const usd = data.coins?.[`coingecko:${id}`]?.price;
      if (typeof usd === "number") out.set(id, usd);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function priceUnpricedTokens(
  tokens: TokenBalance[],
): Promise<TokenBalance[]> {
  const needed = [
    ...new Set(
      tokens
        .filter((t) => t.priceUsd == null && t.tokenType === "native")
        .map((t) => SYMBOL_IDS[t.symbol.toUpperCase()])
        .filter((id): id is string => !!id),
    ),
  ];
  if (needed.length === 0) return tokens;
  const prices = await fetchUsdPrices(needed);
  return tokens.map((t) => {
    if (t.priceUsd != null || t.tokenType !== "native") return t;
    const id = SYMBOL_IDS[t.symbol.toUpperCase()];
    const priceUsd = id ? (prices.get(id) ?? null) : null;
    if (priceUsd == null) return t;
    return { ...t, priceUsd, valueUsd: t.balance * priceUsd };
  });
}

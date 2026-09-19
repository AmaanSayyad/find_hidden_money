import { NextResponse } from "next/server";

export const revalidate = 3600;

type GeckoMarket = {
  image?: string;
  symbol?: string;
};

type LlamaChain = {
  gecko_id?: string | null;
  name?: string;
};

async function geckoPage(page: number): Promise<string[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as GeckoMarket[];
  if (!Array.isArray(data)) return [];
  return data
    .map((c) => c.image?.replace("/large/", "/small/") || "")
    .filter((src) => /^https?:\/\//i.test(src));
}

async function llamaChainLogos(): Promise<string[]> {
  const res = await fetch("https://api.llama.fi/v2/chains", {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as LlamaChain[];
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const chain of data) {
    const id = (chain.gecko_id || chain.name || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    if (!id) continue;
    out.push(`https://icons.llamao.fi/icons/chains/rsz_${id}.jpg`);
  }
  return out;
}

/**
 * Aggregated public token + chain logos (CoinGecko + DefiLlama).
 * Used by the coverage logo cloud — up to ~2,000 CoinGecko tickers plus chain marks.
 */
export async function GET() {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const batch of [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
  ]) {
    const geckoSettled = await Promise.allSettled(batch.map((p) => geckoPage(p)));
    for (const result of geckoSettled) {
      if (result.status !== "fulfilled") continue;
      for (const src of result.value) {
        if (seen.has(src)) continue;
        seen.add(src);
        tokens.push(src);
      }
    }
  }

  let chains: string[] = [];
  try {
    chains = await llamaChainLogos();
  } catch {
    chains = [];
  }

  return NextResponse.json({
    tokens,
    chains,
    sources: ["coingecko", "defillama", "coinmarketcap-via-coingecko"],
    tokenCount: tokens.length,
    chainCount: chains.length,
  });
}

import { nodeRequest } from "./http";
import type { TokenBalance } from "./types";

function resolveSolanaRpc(): string {
  return (
    process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com"
  );
}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const { status, text } = await nodeRequest(resolveSolanaRpc(), {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeoutMs: 25_000,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Solana RPC HTTP ${status}: ${text.slice(0, 160)}`);
  }
  const data = JSON.parse(text) as { result?: T; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result as T;
}

type TokenAccount = {
  pubkey: string;
  account: {
    data: {
      parsed?: {
        info?: {
          mint: string;
          tokenAmount?: {
            amount: string;
            decimals: number;
            uiAmount: number | null;
            uiAmountString?: string;
          };
        };
      };
    };
  };
};

type MintMeta = {
  symbol: string;
  name: string;
  thumbnail: string | null;
  priceUsd: number | null;
};

/** Official / well-known mints when Jupiter & DexScreener lag (e.g. Palm USD). */
const KNOWN_SOL_MINTS: Record<string, MintMeta> = {
  // Palm USD (PUSD) — https://www.palmusd.com/pages/developers.html
  CZzgUBvxaMLwMhVSLgqJn3npmxoTo6nzMNQPAnwtHF3s: {
    symbol: "PUSD",
    name: "Palm USD",
    thumbnail: "https://www.palmusd.com/favicon.ico",
    priceUsd: 1,
  },
};

async function fetchDexScreenerMeta(
  mints: string[],
): Promise<Map<string, MintMeta>> {
  const map = new Map<string, MintMeta>();
  if (mints.length === 0) return map;

  // DexScreener accepts comma-separated mints (batch in chunks of 30).
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const { status, text } = await nodeRequest(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { method: "GET", timeoutMs: 12_000 },
      );
      if (status < 200 || status >= 300) continue;
      const data = JSON.parse(text) as {
        pairs?: Array<{
          baseToken?: { address?: string; symbol?: string; name?: string };
          quoteToken?: { address?: string; symbol?: string; name?: string };
          priceUsd?: string;
          info?: { imageUrl?: string };
          liquidity?: { usd?: number };
        }>;
      };

      // Pick the highest-liquidity pair per mint.
      const best = new Map<
        string,
        { liq: number; meta: MintMeta }
      >();
      for (const pair of data.pairs ?? []) {
        for (const side of [pair.baseToken, pair.quoteToken]) {
          if (!side?.address || !chunk.includes(side.address)) continue;
          const liq = pair.liquidity?.usd ?? 0;
          const prev = best.get(side.address);
          if (prev && prev.liq >= liq) continue;
          const price = Number.parseFloat(pair.priceUsd ?? "");
          best.set(side.address, {
            liq,
            meta: {
              symbol: side.symbol || "SPL",
              name: side.name || side.symbol || "Solana Token",
              thumbnail: pair.info?.imageUrl || null,
              priceUsd: Number.isFinite(price) ? price : null,
            },
          });
        }
      }
      for (const [mint, row] of best) map.set(mint, row.meta);
    } catch {
      /* next chunk */
    }
  }
  return map;
}

async function fetchJupiterMeta(
  mints: string[],
): Promise<Map<string, MintMeta>> {
  const map = new Map<string, MintMeta>();
  await Promise.all(
    mints.slice(0, 40).map(async (mint) => {
      try {
        const { status, text } = await nodeRequest(
          `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`,
          { method: "GET", timeoutMs: 8_000 },
        );
        if (status < 200 || status >= 300) return;
        const rows = JSON.parse(text) as Array<{
          id?: string;
          symbol?: string;
          name?: string;
          icon?: string;
          usdPrice?: number;
        }>;
        const hit = rows.find((r) => r.id === mint) ?? rows[0];
        if (!hit?.symbol) return;
        map.set(mint, {
          symbol: hit.symbol,
          name: hit.name || hit.symbol,
          thumbnail: hit.icon || null,
          priceUsd:
            typeof hit.usdPrice === "number" && Number.isFinite(hit.usdPrice)
              ? hit.usdPrice
              : null,
        });
      } catch {
        /* ignore */
      }
    }),
  );
  return map;
}

async function fetchMintMeta(mints: string[]): Promise<Map<string, MintMeta>> {
  const map = new Map<string, MintMeta>();
  if (mints.length === 0) return map;

  for (const mint of mints) {
    const known = KNOWN_SOL_MINTS[mint];
    if (known) map.set(mint, { ...known });
  }

  const needRemote = mints.filter((m) => !map.has(m));
  if (needRemote.length === 0) return map;

  const dex = await fetchDexScreenerMeta(needRemote);
  for (const [k, v] of dex) {
    if (!map.has(k)) map.set(k, v);
  }

  const missing = needRemote.filter((m) => !map.has(m));
  if (missing.length > 0) {
    const jup = await fetchJupiterMeta(missing);
    for (const [k, v] of jup) {
      if (!map.has(k)) map.set(k, v);
    }
  }

  // Keep known mint symbol/name even if a remote source only has a price.
  for (const mint of mints) {
    const known = KNOWN_SOL_MINTS[mint];
    if (!known) continue;
    const cur = map.get(mint);
    if (!cur) {
      map.set(mint, { ...known });
      continue;
    }
    map.set(mint, {
      symbol: known.symbol || cur.symbol,
      name: known.name || cur.name,
      thumbnail: cur.thumbnail || known.thumbnail,
      priceUsd: cur.priceUsd ?? known.priceUsd,
    });
  }
  return map;
}

async function fetchTokenAccounts(
  owner: string,
  programId: string,
): Promise<
  Array<{ mint: string; balance: number; balanceRaw: string; decimals: number }>
> {
  const result = await rpc<{ value: TokenAccount[] }>(
    "getTokenAccountsByOwner",
    [owner, { programId }, { encoding: "jsonParsed" }],
  );

  const tokens: Array<{
    mint: string;
    balance: number;
    balanceRaw: string;
    decimals: number;
  }> = [];

  for (const item of result?.value ?? []) {
    const info = item.account.data.parsed?.info;
    const amount = info?.tokenAmount;
    if (!info?.mint || !amount) continue;
    const balance =
      amount.uiAmount ??
      Number(amount.uiAmountString ?? 0) ??
      Number(amount.amount) / 10 ** amount.decimals;
    if (!(balance > 0)) continue;

    tokens.push({
      mint: info.mint,
      balance,
      balanceRaw: amount.amount,
      decimals: amount.decimals,
    });
  }
  return tokens;
}

async function fetchSolPriceUsd(): Promise<number | null> {
  try {
    const { status, text } = await nodeRequest(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { method: "GET", timeoutMs: 8_000 },
    );
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(text) as { solana?: { usd?: number } };
    const price = data.solana?.usd;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

/** Native SOL + SPL / Token-2022 balances for a Solana address. */
export async function fetchSolanaBalances(
  address: string,
): Promise<TokenBalance[]> {
  const tokens: TokenBalance[] = [];

  const [balanceResult, solPrice] = await Promise.all([
    rpc<number | { value?: number }>("getBalance", [address]),
    fetchSolPriceUsd(),
  ]);
  const lamports =
    typeof balanceResult === "number"
      ? balanceResult
      : (balanceResult?.value ?? 0);
  const sol = lamports / 1e9;
  if (sol > 0) {
    const valueUsd = solPrice != null ? sol * solPrice : null;
    tokens.push({
      chainId: null,
      chainName: "Solana",
      chainSlug: "solana",
      symbol: "SOL",
      name: "Solana",
      balance: sol,
      balanceRaw: String(lamports),
      decimals: 9,
      priceUsd: solPrice,
      valueUsd,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    });
  }

  const splErrors: string[] = [];
  const [spl, token2022] = await Promise.all([
    fetchTokenAccounts(address, TOKEN_PROGRAM).catch((err) => {
      splErrors.push(
        `SPL: ${err instanceof Error ? err.message : "failed"}`,
      );
      return [];
    }),
    fetchTokenAccounts(address, TOKEN_2022_PROGRAM).catch((err) => {
      splErrors.push(
        `Token-2022: ${err instanceof Error ? err.message : "failed"}`,
      );
      return [];
    }),
  ]);

  if (splErrors.length === 2 && spl.length === 0 && token2022.length === 0) {
    throw new Error(`Solana token accounts failed (${splErrors.join("; ")})`);
  }

  const byMint = new Map<
    string,
    { mint: string; balance: number; balanceRaw: string; decimals: number }
  >();
  for (const t of [...spl, ...token2022]) {
    const prev = byMint.get(t.mint);
    if (!prev) byMint.set(t.mint, t);
    else {
      // Sum duplicate token accounts for same mint.
      byMint.set(t.mint, {
        ...prev,
        balance: prev.balance + t.balance,
        balanceRaw: String(BigInt(prev.balanceRaw) + BigInt(t.balanceRaw)),
      });
    }
  }

  const mints = [...byMint.keys()];
  const meta = await fetchMintMeta(mints);

  for (const t of byMint.values()) {
    const label = meta.get(t.mint);
    const priceUsd = label?.priceUsd ?? null;
    tokens.push({
      chainId: null,
      chainName: "Solana",
      chainSlug: "solana",
      symbol: label?.symbol || t.mint.slice(0, 4).toUpperCase(),
      name: label?.name || `SPL ${t.mint.slice(0, 8)}…`,
      balance: t.balance,
      balanceRaw: t.balanceRaw,
      decimals: t.decimals,
      priceUsd,
      valueUsd: priceUsd != null ? t.balance * priceUsd : null,
      tokenAddress: t.mint,
      thumbnail: label?.thumbnail ?? null,
      tokenType: "other",
    });
  }

  return tokens;
}

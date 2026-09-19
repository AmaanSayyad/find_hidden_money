import { withAnkrQueue } from "./ankr-queue";
import { resolveChain } from "./chains";
import { nodeRequest } from "./http";
import type {
  AnkrAsset,
  AnkrBalanceResponse,
  PortfolioResult,
  TokenBalance,
} from "./types";

const MAX_PAGES = 40;
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 25_000;
const FAST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const FAST_MAX_PAGES = 2;
const RATE_LIMIT_RETRIES = 5;

/**
 * Ankr Advanced API allowed mainnets for ankr_getAccountBalance.
 * Invalid names (e.g. zksync, blast) cause the whole request to fail.
 * @see https://www.ankr.com/docs/advanced-api/token-methods/
 */
const PRIMARY_CHAINS = [
  "eth",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
  "base",
  "avalanche",
  "fantom",
  "linea",
  "scroll",
  "gnosis",
  "flare",
] as const;

/** Smaller set for multi-wallet sweeps — fewer invalid/slow chain failures. */
const FAST_CHAINS = [
  "eth",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
  "base",
  "avalanche",
] as const;

const fastCache = new Map<string, { at: number; result: PortfolioResult }>();
const FAST_CACHE_TTL_MS = 90_000;

function assetToToken(asset: AnkrAsset): TokenBalance | null {
  const chain = resolveChain(asset.blockchain);
  const balance = Number.parseFloat(asset.balance) || 0;
  if (!(balance > 0)) return null;

  const priceUsd = Number.parseFloat(asset.tokenPrice);
  const valueUsd = Number.parseFloat(asset.balanceUsd);
  const type = (asset.tokenType || "").toLowerCase();

  const rawAddr = (asset.contractAddress || "").toLowerCase();
  const tokenAddress =
    !rawAddr ||
    /^0x0+$/.test(rawAddr) ||
    rawAddr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      ? null
      : rawAddr;

  return {
    chainId: chain.chainId,
    chainName: chain.name,
    chainSlug: chain.slug,
    symbol: asset.tokenSymbol || "UNKNOWN",
    name: asset.tokenName || asset.tokenSymbol || "Unknown Token",
    balance,
    balanceRaw: asset.balanceRawInteger || asset.balance,
    decimals: asset.tokenDecimals ?? 18,
    priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
    valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
    tokenAddress,
    thumbnail: asset.thumbnail || null,
    tokenType:
      type.includes("native") || !tokenAddress
        ? "native"
        : type.includes("erc20")
          ? "erc20"
          : "other",
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchAnkrPage(
  endpoint: string,
  address: string,
  opts: {
    pageToken?: string;
    onlyWhitelisted: boolean;
    blockchain?: string[];
    timeoutMs?: number;
    retries?: number;
  },
): Promise<{
  assets: AnkrAsset[];
  totalBalanceUsd: string;
  nextPageToken?: string;
}> {
  const params: Record<string, unknown> = {
    walletAddress: address,
    onlyWhitelisted: opts.onlyWhitelisted,
    pageSize: PAGE_SIZE,
  };
  if (opts.pageToken) params.pageToken = opts.pageToken;
  if (opts.blockchain?.length) params.blockchain = opts.blockchain;

  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxRetries = opts.retries ?? MAX_RETRIES;
  let lastError: Error | null = null;
  let rateHits = 0;

  for (let attempt = 0; attempt <= maxRetries + RATE_LIMIT_RETRIES; attempt++) {
    try {
      const { status, text } = await withAnkrQueue(() =>
        nodeRequest(endpoint, {
          method: "POST",
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "ankr_getAccountBalance",
            params,
            id: 1,
          }),
          timeoutMs,
        }),
      );

      if (status === 429 || status === 503) {
        throw new Error(`Ankr HTTP ${status} (rate limited)`);
      }
      if (status < 200 || status >= 300) {
        throw new Error(`Ankr HTTP ${status}: ${text.slice(0, 200)}`);
      }

      let data: AnkrBalanceResponse;
      try {
        data = JSON.parse(text) as AnkrBalanceResponse;
      } catch {
        throw new Error(`Ankr returned non-JSON: ${text.slice(0, 120)}`);
      }

      if (data.error) {
        throw new Error(`Ankr RPC error: ${data.error.message || "unknown"}`);
      }
      if (!data.result) {
        throw new Error("Ankr returned empty result");
      }

      return {
        assets: data.result.assets ?? [],
        totalBalanceUsd: data.result.totalBalanceUsd ?? "0",
        nextPageToken: data.result.nextPageToken,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const rateLimited = /429|503|rate limited|too many|capacity/i.test(
        lastError.message,
      );
      if (rateLimited) {
        rateHits += 1;
        if (rateHits <= RATE_LIMIT_RETRIES) {
          await sleep(Math.min(10_000, 1500 * 2 ** (rateHits - 1)));
          continue;
        }
      }
      if (attempt < maxRetries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError ?? new Error("Ankr request failed");
}

async function fetchAllPages(
  endpoint: string,
  address: string,
  onlyWhitelisted: boolean,
  blockchain?: string[],
  opts?: { maxPages?: number; timeoutMs?: number; retries?: number },
): Promise<{ assets: AnkrAsset[]; totalBalanceUsd: string; pages: number }> {
  const allAssets: AnkrAsset[] = [];
  let totalBalanceUsd = "0";
  let pageToken: string | undefined;
  let pages = 0;
  const maxPages = opts?.maxPages ?? MAX_PAGES;

  do {
    const page = await fetchAnkrPage(endpoint, address, {
      pageToken,
      onlyWhitelisted,
      blockchain,
      timeoutMs: opts?.timeoutMs,
      retries: opts?.retries,
    });
    allAssets.push(...page.assets);
    totalBalanceUsd = page.totalBalanceUsd || totalBalanceUsd;
    pageToken = page.nextPageToken || undefined;
    pages += 1;
  } while (pageToken && pages < maxPages);

  return { assets: allAssets, totalBalanceUsd, pages };
}

function toPortfolio(
  address: string,
  assets: AnkrAsset[],
  totalBalanceUsd: string,
  pages: number,
  warnings: string[],
): PortfolioResult {
  const tokens = assets
    .map(assetToToken)
    .filter((t): t is TokenBalance => t != null)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const deduped = new Map<string, TokenBalance>();
  for (const t of tokens) {
    const key = `${t.chainSlug}:${(t.tokenAddress || "native").toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, t);
  }
  const unique = [...deduped.values()];
  const chains = new Set(unique.map((t) => t.chainSlug));
  const summedUsd = unique.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);

  return {
    address,
    totalValueUsd: Number.parseFloat(totalBalanceUsd) || summedUsd,
    tokenCount: unique.length,
    chainCount: chains.size,
    tokens: unique,
    provider: "ankr",
    scannedAt: new Date().toISOString(),
    warnings: [
      `Ankr returned ${unique.length} token balance(s) across ${chains.size} chain(s) (${pages} page${pages === 1 ? "" : "s"}).`,
      ...warnings,
    ],
  };
}

async function fetchListedThenFull(
  endpoint: string,
  address: string,
  blockchain: string[] | undefined,
  warnings: string[],
): Promise<{ assets: AnkrAsset[]; totalBalanceUsd: string; pages: number }> {
  const listed = await fetchAllPages(endpoint, address, true, blockchain);

  try {
    const all = await fetchAllPages(endpoint, address, false, blockchain);
    return {
      assets: all.assets,
      totalBalanceUsd: all.totalBalanceUsd || listed.totalBalanceUsd,
      pages: all.pages,
    };
  } catch (err) {
    warnings.push(
      `Full-token Ankr pass timed out — showing CoinGecko-listed balances only. (${err instanceof Error ? err.message : "error"})`,
    );
    return listed;
  }
}

/**
 * Resilient Ankr portfolio fetch:
 * 1) Fast path — CoinGecko-listed tokens on primary (valid) Ankr chains
 * 2) Expand — all tokens (incl. dust) on those chains when possible
 * 3) Fallback — omit blockchain filter if the scoped query fails
 */
export async function fetchAnkrPortfolio(
  address: string,
  apiKey: string,
): Promise<PortfolioResult> {
  const endpoint = `https://rpc.ankr.com/multichain/${apiKey}`;
  const warnings: string[] = [];
  const chains = [...PRIMARY_CHAINS];

  try {
    const result = await fetchListedThenFull(
      endpoint,
      address,
      chains,
      warnings,
    );
    return toPortfolio(
      address,
      result.assets,
      result.totalBalanceUsd,
      result.pages,
      warnings,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Scoped Ankr query failed (${msg}) — retrying all supported chains.`);
  }

  const fallback = await fetchListedThenFull(
    endpoint,
    address,
    undefined,
    warnings,
  );
  return toPortfolio(
    address,
    fallback.assets,
    fallback.totalBalanceUsd,
    fallback.pages,
    warnings,
  );
}

/**
 * Fast Ankr pass for multi-wallet sweeps:
 * CoinGecko-listed tokens on all primary Ankr chains.
 * If the wallet has material value, also pulls unlisted/priced tokens (USDC etc. already listed;
 * this catches more MetaMask-visible assets without a full deep scan).
 */
export async function fetchAnkrPortfolioFast(
  address: string,
  apiKey: string,
): Promise<PortfolioResult> {
  const cacheKey = address.toLowerCase();
  const hit = fastCache.get(cacheKey);
  if (hit && Date.now() - hit.at < FAST_CACHE_TTL_MS) {
    return {
      ...hit.result,
      scannedAt: new Date().toISOString(),
      warnings: [...hit.result.warnings, "Served from short-lived scan cache."],
    };
  }

  const endpoint = `https://rpc.ankr.com/multichain/${apiKey}`;
  const warnings: string[] = [
    "Roster Ankr pass (listed tokens on primary chains; unlisted enrich when wallet has value).",
  ];
  const opts = {
    maxPages: FAST_MAX_PAGES,
    timeoutMs: FAST_TIMEOUT_MS,
    retries: 2,
  } as const;

  let listedAssets: AnkrAsset[] = [];
  let listedUsd = "0";
  let pages = 0;

  try {
    const listed = await fetchAllPages(
      endpoint,
      address,
      true,
      [...PRIMARY_CHAINS],
      opts,
    );
    listedAssets = listed.assets;
    listedUsd = listed.totalBalanceUsd;
    pages = listed.pages;
  } catch (err) {
    warnings.push(
      `Scoped roster Ankr failed (${err instanceof Error ? err.message : "error"}) — retrying majors / no filter.`,
    );
    try {
      const majors = await fetchAllPages(
        endpoint,
        address,
        true,
        [...FAST_CHAINS],
        opts,
      );
      listedAssets = majors.assets;
      listedUsd = majors.totalBalanceUsd;
      pages = majors.pages;
    } catch {
      const fallback = await fetchAllPages(
        endpoint,
        address,
        true,
        undefined,
        opts,
      );
      listedAssets = fallback.assets;
      listedUsd = fallback.totalBalanceUsd;
      pages = fallback.pages;
    }
  }

  const listedValue = Number.parseFloat(listedUsd) || 0;
  let assets = listedAssets;
  let totalUsd = listedUsd;

  // Enrich wallets that already show value — catches extra MetaMask tokens.
  if (listedValue >= 0.25 || listedAssets.length > 0) {
    try {
      const all = await fetchAllPages(endpoint, address, false, [...FAST_CHAINS], {
        maxPages: 2,
        timeoutMs: FAST_TIMEOUT_MS,
        retries: 1,
      });
      if (all.assets.length >= listedAssets.length) {
        assets = all.assets;
        totalUsd = all.totalBalanceUsd || listedUsd;
        pages += all.pages;
        warnings.push("Unlisted-token enrich pass included (major chains).");
      }
    } catch (err) {
      warnings.push(
        `Unlisted enrich skipped (${err instanceof Error ? err.message : "error"}).`,
      );
    }
  }

  const result = toPortfolio(address, assets, totalUsd, pages, warnings);
  fastCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

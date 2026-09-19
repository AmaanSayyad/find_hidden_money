import { resolveChain } from "./chains";
import { nodeRequest } from "./http";
import type { PortfolioResult, TokenBalance } from "./types";

/** Moralis chain query params covering major EVM networks */
const MORALIS_CHAINS = [
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
  "zksync",
  "polygon_zkevm",
  "blast",
  "mantle",
  "gnosis",
  "moonbeam",
  "cronos",
] as const;

type MoralisToken = {
  token_address: string;
  symbol: string;
  name: string;
  logo?: string | null;
  decimals: number | string;
  balance: string;
  balance_formatted?: string;
  usd_price?: number | null;
  usd_value?: number | null;
  native_token?: boolean;
  possible_spam?: boolean;
};

type MoralisResponse = {
  result?: MoralisToken[];
  cursor?: string | null;
};

async function fetchChainTokens(
  address: string,
  chain: string,
  apiKey: string,
): Promise<TokenBalance[]> {
  const url = new URL(
    `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`,
  );
  url.searchParams.set("chain", chain);
  url.searchParams.set("exclude_spam", "true");
  url.searchParams.set("exclude_unverified_contracts", "false");
  url.searchParams.set("limit", "100");

  const { status, text } = await nodeRequest(url.toString(), {
    headers: {
      accept: "application/json",
      "X-API-Key": apiKey,
    },
    timeoutMs: 20_000,
  });

  if (status < 200 || status >= 300) {
    // Skip chains the plan doesn't include instead of failing the whole scan
    if (status === 400 || status === 401 || status === 404) {
      return [];
    }
    throw new Error(`Moralis ${chain} HTTP ${status}`);
  }

  const data = JSON.parse(text) as MoralisResponse;
  const meta = resolveChain(chain);

  return (data.result ?? [])
    .filter((t) => !t.possible_spam)
    .map((t) => {
      const decimals = Number(t.decimals) || 18;
      const balance =
        t.balance_formatted != null
          ? Number.parseFloat(t.balance_formatted)
          : Number(BigInt(t.balance || "0")) / 10 ** decimals;
      const priceUsd =
        typeof t.usd_price === "number" ? t.usd_price : null;
      const valueUsd =
        typeof t.usd_value === "number"
          ? t.usd_value
          : priceUsd != null
            ? balance * priceUsd
            : null;

      return {
        chainId: meta.chainId,
        chainName: meta.name,
        chainSlug: meta.slug,
        symbol: t.symbol || "UNKNOWN",
        name: t.name || t.symbol || "Unknown Token",
        balance,
        balanceRaw: t.balance,
        decimals,
        priceUsd,
        valueUsd,
        tokenAddress: t.native_token ? null : t.token_address,
        thumbnail: t.logo ?? null,
        tokenType: t.native_token ? "native" : "erc20",
      } satisfies TokenBalance;
    })
    .filter((t) => t.balance > 0);
}

/**
 * Moralis Wallet API — queries each supported chain in parallel and merges.
 */
export async function fetchMoralisPortfolio(
  address: string,
  apiKey: string,
): Promise<PortfolioResult> {
  const settled = await Promise.allSettled(
    MORALIS_CHAINS.map((chain) => fetchChainTokens(address, chain, apiKey)),
  );

  const warnings: string[] = [];
  const tokens: TokenBalance[] = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      tokens.push(...result.value);
    } else {
      warnings.push(
        `Moralis ${MORALIS_CHAINS[i]}: ${result.reason instanceof Error ? result.reason.message : "failed"}`,
      );
    }
  });

  tokens.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const chains = new Set(tokens.map((t) => t.chainSlug));
  const totalValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);

  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: chains.size,
    tokens,
    provider: "moralis",
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

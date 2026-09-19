import { zeroFakeTokenValues } from "./fake-assets";
import { dropTestnetHoldings } from "./testnets";
import type { PortfolioResult, TokenBalance } from "./types";

export type WalletScanStatus =
  | "pending"
  | "scanning"
  | "done"
  | "empty"
  | "error";

export type WalletSlice = {
  address: string;
  label: string;
  status: WalletScanStatus;
  totalValueUsd: number;
  tokenCount: number;
  chainCount: number;
  tokens: TokenBalance[];
  provider?: string;
  error?: string;
  scannedAt?: string;
};

export type CombinedToken = TokenBalance & {
  walletCount: number;
  wallets: string[];
};

export type MultiInsights = {
  walletCount: number;
  enabledCount: number;
  scannedCount: number;
  emptyCount: number;
  errorCount: number;
  /** Share of combined USD in the single richest wallet (0–1). */
  topWalletShare: number;
  /** Share of combined USD in the top 3 wallets (0–1). */
  top3Share: number;
};

export type MultiPortfolio = {
  wallets: WalletSlice[];
  combinedTokens: CombinedToken[];
  totalValueUsd: number;
  tokenCount: number;
  chainCount: number;
  insights: MultiInsights;
  warnings: string[];
  scannedAt: string;
};

function tokenKey(token: TokenBalance): string {
  const chain = token.chainId != null ? `id:${token.chainId}` : token.chainSlug;
  const asset = (token.tokenAddress || "native").toLowerCase();
  return `${chain}:${asset}`;
}

export function portfolioToSlice(
  address: string,
  label: string,
  result: PortfolioResult | null,
  error?: string,
): WalletSlice {
  if (error) {
    return {
      address,
      label,
      status: "error",
      totalValueUsd: 0,
      tokenCount: 0,
      chainCount: 0,
      tokens: [],
      error,
    };
  }
  if (!result) {
    return {
      address,
      label,
      status: "pending",
      totalValueUsd: 0,
      tokenCount: 0,
      chainCount: 0,
      tokens: [],
    };
  }
  const ankrFailed = result.warnings.some((w) =>
    /Ankr failed|rate limited|Ankr HTTP 429|Ankr RPC error/i.test(w),
  );
  if (ankrFailed && result.tokenCount === 0) {
    return {
      address,
      label,
      status: "error",
      totalValueUsd: 0,
      tokenCount: 0,
      chainCount: 0,
      tokens: [],
      error: result.warnings.find((w) => /Ankr|rate/i.test(w)) || "Indexer failed",
      scannedAt: result.scannedAt,
    };
  }
  const tokens = zeroFakeTokenValues(dropTestnetHoldings(result.tokens));
  const empty = tokens.length === 0;
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  return {
    address,
    label,
    status: empty ? "empty" : "done",
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: new Set(tokens.map((t) => t.chainSlug)).size,
    tokens,
    provider: result.provider,
    scannedAt: result.scannedAt,
  };
}

export function buildMultiPortfolio(
  wallets: WalletSlice[],
  extraWarnings: string[] = [],
): MultiPortfolio {
  type Acc = {
    token: CombinedToken;
  };
  const map = new Map<string, Acc>();
  const honestWallets = wallets.map((wallet) => {
    const tokens = zeroFakeTokenValues(wallet.tokens);
    return {
      ...wallet,
      tokens,
      totalValueUsd: tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0),
    };
  });

  for (const wallet of honestWallets) {
    if (wallet.status !== "done" && wallet.status !== "empty") continue;
    for (const t of wallet.tokens) {
      const key = tokenKey(t);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          token: {
            ...t,
            walletCount: 1,
            wallets: [wallet.address],
          },
        });
        continue;
      }
      const cur = existing.token;
      cur.balance += t.balance;
      cur.balanceRaw = String(cur.balance);
      cur.valueUsd =
        cur.valueUsd == null && t.valueUsd == null
          ? null
          : (cur.valueUsd ?? 0) + (t.valueUsd ?? 0);
      if (!cur.wallets.includes(wallet.address)) {
        cur.wallets.push(wallet.address);
        cur.walletCount = cur.wallets.length;
      }
      if (cur.priceUsd == null && t.priceUsd != null) cur.priceUsd = t.priceUsd;
      if (!cur.thumbnail && t.thumbnail) cur.thumbnail = t.thumbnail;
    }
  }

  const combinedTokens = [...map.values()]
    .map((x) => x.token)
    .sort(
      (a, b) =>
        (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
    );

  const doneWallets = honestWallets
    .filter((w) => w.status === "done" || w.status === "empty")
    .slice()
    .sort((a, b) => b.totalValueUsd - a.totalValueUsd);

  const totalValueUsd = doneWallets.reduce((s, w) => s + w.totalValueUsd, 0);
  const top = doneWallets[0]?.totalValueUsd ?? 0;
  const top3 = doneWallets
    .slice(0, 3)
    .reduce((s, w) => s + w.totalValueUsd, 0);

  const chains = new Set(combinedTokens.map((t) => t.chainSlug));

  return {
    wallets: honestWallets,
    combinedTokens,
    totalValueUsd,
    tokenCount: combinedTokens.length,
    chainCount: chains.size,
    insights: {
      walletCount: honestWallets.length,
      enabledCount: honestWallets.length,
      scannedCount: doneWallets.length,
      emptyCount: honestWallets.filter((w) => w.status === "empty").length,
      errorCount: honestWallets.filter((w) => w.status === "error").length,
      topWalletShare: totalValueUsd > 0 ? top / totalValueUsd : 0,
      top3Share: totalValueUsd > 0 ? top3 / totalValueUsd : 0,
    },
    warnings: extraWarnings,
    scannedAt: new Date().toISOString(),
  };
}

import { nodeRequest } from "./http";
import type { PortfolioResult, TokenBalance } from "./types";

const SUI_RPC = "https://fullnode.mainnet.sui.io:443";
const SUI_COIN_TYPE = "0x2::sui::SUI";

type SuiBalance = {
  coinType: string;
  totalBalance: string;
};

async function suiRpc<T>(method: string, params: unknown[]): Promise<T> {
  const { status, text } = await nodeRequest(SUI_RPC, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    timeoutMs: 15_000,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Sui RPC HTTP ${status}`);
  }
  const data = JSON.parse(text) as { result?: T; error?: { message?: string } };
  if (data.error) {
    throw new Error(data.error.message || "Sui RPC error");
  }
  return data.result as T;
}

async function fetchSuiUsd(): Promise<number | null> {
  try {
    const { status, text } = await nodeRequest(
      "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd",
      { timeoutMs: 8_000 },
    );
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(text) as { sui?: { usd?: number } };
    return typeof data.sui?.usd === "number" ? data.sui.usd : null;
  } catch {
    return null;
  }
}

async function coinMeta(
  coinType: string,
): Promise<{ symbol: string; name: string; decimals: number } | null> {
  if (coinType === SUI_COIN_TYPE) {
    return { symbol: "SUI", name: "Sui", decimals: 9 };
  }
  try {
    const meta = await suiRpc<{
      symbol?: string;
      name?: string;
      decimals?: number;
    } | null>("suix_getCoinMetadata", [coinType]);
    if (!meta) return null;
    return {
      symbol: meta.symbol || "COIN",
      name: meta.name || meta.symbol || "Sui Coin",
      decimals: meta.decimals ?? 9,
    };
  } catch {
    return null;
  }
}

export async function fetchSuiBalances(
  address: string,
): Promise<TokenBalance[]> {
  const [balances, suiPrice] = await Promise.all([
    suiRpc<SuiBalance[]>("suix_getAllBalances", [address]),
    fetchSuiUsd(),
  ]);

  const tokens: TokenBalance[] = [];
  for (const row of balances ?? []) {
    const raw = BigInt(row.totalBalance || "0");
    if (raw === BigInt(0)) continue;
    const meta = await coinMeta(row.coinType);
    const decimals = meta?.decimals ?? 9;
    const balance = Number(raw) / 10 ** decimals;
    if (!(balance > 0)) continue;
    const isNative = row.coinType === SUI_COIN_TYPE;
    const priceUsd = isNative ? suiPrice : null;
    tokens.push({
      chainId: null,
      chainName: "Sui",
      chainSlug: "sui",
      symbol: meta?.symbol || "COIN",
      name: meta?.name || row.coinType.slice(0, 18),
      balance,
      balanceRaw: raw.toString(),
      decimals,
      priceUsd,
      valueUsd: priceUsd != null ? balance * priceUsd : null,
      tokenAddress: isNative ? null : row.coinType,
      thumbnail: null,
      tokenType: isNative ? "native" : "other",
    });
  }

  return tokens.sort(
    (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
  );
}

export async function fetchSuiPortfolio(
  address: string,
): Promise<PortfolioResult> {
  const tokens = await fetchSuiBalances(address);
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: tokens.length > 0 ? 1 : 0,
    tokens,
    provider: "sui-rpc",
    scannedAt: new Date().toISOString(),
    warnings:
      tokens.length > 0
        ? [`Sui: ${tokens.length} asset(s).`]
        : ["Sui: no balances on this address."],
  };
}

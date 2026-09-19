import { nodeRequest } from "./http";
import type { TokenBalance } from "./types";

type TronAccountResponse = {
  data?: Array<{
    balance?: number;
    assetV2?: Array<{ key: string; value: number }>;
    trc20?: Array<Record<string, string>>;
  }>;
};

/** TRX + TRC-10/TRC-20 balances via TronGrid. */
export async function fetchTronBalances(
  address: string,
): Promise<TokenBalance[]> {
  const headers: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  }

  const { status, text } = await nodeRequest(
    `https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`,
    { timeoutMs: 15_000, headers },
  );

  if (status < 200 || status >= 300) {
    throw new Error(`TronGrid HTTP ${status}`);
  }

  const body = JSON.parse(text) as TronAccountResponse;
  const account = body.data?.[0];
  if (!account) return [];

  const tokens: TokenBalance[] = [];
  const sun = account.balance ?? 0;
  const trx = sun / 1e6;
  if (trx > 0) {
    tokens.push({
      chainId: null,
      chainName: "Tron",
      chainSlug: "tron",
      symbol: "TRX",
      name: "TRON",
      balance: trx,
      balanceRaw: String(sun),
      decimals: 6,
      priceUsd: null,
      valueUsd: null,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    });
  }

  for (const asset of account.assetV2 ?? []) {
    if (!asset.value || asset.value <= 0) continue;
    tokens.push({
      chainId: null,
      chainName: "Tron",
      chainSlug: "tron",
      symbol: `TRC10-${asset.key}`,
      name: `TRC-10 ${asset.key}`,
      balance: asset.value,
      balanceRaw: String(asset.value),
      decimals: 0,
      priceUsd: null,
      valueUsd: null,
      tokenAddress: asset.key,
      thumbnail: null,
      tokenType: "other",
    });
  }

  for (const entry of account.trc20 ?? []) {
    for (const [contract, raw] of Object.entries(entry)) {
      const amount = Number(raw);
      if (!(amount > 0)) continue;
      const decimals = 6;
      const balance = amount / 10 ** decimals;
      tokens.push({
        chainId: null,
        chainName: "Tron",
        chainSlug: "tron",
        symbol: contract.slice(0, 6),
        name: `TRC-20 ${contract.slice(0, 8)}…`,
        balance,
        balanceRaw: raw,
        decimals,
        priceUsd: null,
        valueUsd: null,
        tokenAddress: contract,
        thumbnail: null,
        tokenType: "other",
      });
    }
  }

  return tokens;
}

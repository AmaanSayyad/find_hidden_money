import { nodeRequest } from "./http";
import type { TokenBalance } from "./types";

type MempoolAddress = {
  chain_stats?: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
  mempool_stats?: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
};

/** Native BTC balance via mempool.space (confirmed + mempool). */
export async function fetchBitcoinBalances(
  address: string,
): Promise<TokenBalance[]> {
  const { status, text } = await nodeRequest(
    `https://mempool.space/api/address/${address}`,
    { timeoutMs: 15_000 },
  );

  if (status < 200 || status >= 300) {
    throw new Error(`Bitcoin API HTTP ${status}`);
  }

  const data = JSON.parse(text) as MempoolAddress;
  const chain =
    (data.chain_stats?.funded_txo_sum ?? 0) -
    (data.chain_stats?.spent_txo_sum ?? 0);
  const mempool =
    (data.mempool_stats?.funded_txo_sum ?? 0) -
    (data.mempool_stats?.spent_txo_sum ?? 0);
  const sats = chain + mempool;
  if (!(sats > 0)) return [];

  const btc = sats / 1e8;

  return [
    {
      chainId: null,
      chainName: "Bitcoin",
      chainSlug: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      balance: btc,
      balanceRaw: String(sats),
      decimals: 8,
      priceUsd: null,
      valueUsd: null,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    },
  ];
}

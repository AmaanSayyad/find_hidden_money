export type TokenBalance = {
  chainId: number | null;
  chainName: string;
  chainSlug: string;
  symbol: string;
  name: string;
  balance: number;
  balanceRaw: string;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  tokenAddress: string | null;
  thumbnail: string | null;
  tokenType: "native" | "erc20" | "other";
};

export type ScanStats = {
  chainsTargeted: number;
  chainsReachable: number;
  chainsWithBalance: number;
  chainsFailed: number;
  durationMs: number;
};

export type PortfolioResult = {
  address: string;
  totalValueUsd: number;
  tokenCount: number;
  chainCount: number;
  tokens: TokenBalance[];
  provider: string;
  scannedAt: string;
  warnings: string[];
  scan?: ScanStats;
};

export type AnkrAsset = {
  blockchain: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenType: string;
  contractAddress?: string;
  holderAddress: string;
  balance: string;
  balanceRawInteger: string;
  balanceUsd: string;
  tokenPrice: string;
  thumbnail?: string;
};

export type AnkrBalanceResponse = {
  jsonrpc: string;
  id: number;
  result?: {
    totalBalanceUsd: string;
    assets: AnkrAsset[];
    nextPageToken?: string;
  };
  error?: { code: number; message: string };
};

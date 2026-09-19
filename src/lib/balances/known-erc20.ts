import { nodeRequest } from "./http";
import { mapPool } from "./pool";
import { fetchUsdPrices } from "./prices";
import type { PortfolioResult, TokenBalance } from "./types";

/**
 * Well-known ERC-20s on public RPCs — no Ankr/Moralis key required.
 * Covers the tokens MetaMask Portfolio typically lists (LINK, WETH, stables, wrapped SOL).
 */
type KnownToken = {
  chainId: number;
  chainName: string;
  slug: string;
  rpcs: string[];
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId: string;
};

const ETH = [
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
];
const BSC = [
  "https://bsc.publicnode.com",
  "https://bsc-dataseed.binance.org",
  "https://1rpc.io/bnb",
];
const ARB = [
  "https://arbitrum-one.publicnode.com",
  "https://1rpc.io/arb",
];
const OP = [
  "https://optimism.publicnode.com",
  "https://1rpc.io/op",
];
const BASE = [
  "https://base.publicnode.com",
  "https://1rpc.io/base",
];
const POLY = [
  "https://polygon-bor.publicnode.com",
  "https://1rpc.io/matic",
];

const KNOWN: KnownToken[] = [
  {
    chainId: 1,
    chainName: "Ethereum",
    slug: "eth",
    rpcs: ETH,
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    slug: "eth",
    rpcs: ETH,
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    coingeckoId: "weth",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    slug: "eth",
    rpcs: ETH,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    slug: "eth",
    rpcs: ETH,
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether",
    decimals: 6,
    coingeckoId: "tether",
  },
  {
    chainId: 1,
    chainName: "Ethereum",
    slug: "eth",
    rpcs: ETH,
    address: "0xD31a59c85aE9D8edEFeC4118CD999330915496C8",
    symbol: "SOL",
    name: "Wrapped SOL (Wormhole)",
    decimals: 9,
    coingeckoId: "solana",
  },
  {
    chainId: 56,
    chainName: "BNB Smart Chain",
    slug: "bsc",
    rpcs: BSC,
    address: "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF",
    symbol: "SOL",
    name: "Binance-Peg SOL",
    decimals: 18,
    coingeckoId: "solana",
  },
  {
    chainId: 56,
    chainName: "BNB Smart Chain",
    slug: "bsc",
    rpcs: BSC,
    address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
  {
    chainId: 56,
    chainName: "BNB Smart Chain",
    slug: "bsc",
    rpcs: BSC,
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
    coingeckoId: "binancecoin",
  },
  {
    chainId: 56,
    chainName: "BNB Smart Chain",
    slug: "bsc",
    rpcs: BSC,
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether",
    decimals: 18,
    coingeckoId: "tether",
  },
  {
    chainId: 42161,
    chainName: "Arbitrum One",
    slug: "arbitrum",
    rpcs: ARB,
    address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
  {
    chainId: 10,
    chainName: "Optimism",
    slug: "optimism",
    rpcs: OP,
    address: "0x350a791Bfc2C21F9Ed1d0d3BF8C1131De2db7973",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
  {
    chainId: 8453,
    chainName: "Base",
    slug: "base",
    rpcs: BASE,
    address: "0x88Fb150BDc3A6370C8F1f17baA0127F28093231c",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
  {
    chainId: 137,
    chainName: "Polygon",
    slug: "polygon",
    rpcs: POLY,
    address: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    coingeckoId: "chainlink",
  },
];

const BALANCE_OF = "0x70a08231000000000000000000000000";

async function erc20Balance(
  rpcs: string[],
  token: string,
  holder: string,
): Promise<bigint | null> {
  const data = `${BALANCE_OF}${holder.slice(2).toLowerCase()}`;
  for (const rpc of [...new Set(rpcs.filter(Boolean))]) {
    try {
      const { status, text } = await nodeRequest(rpc, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: token, data }, "latest"],
        }),
        timeoutMs: 3_500,
      });
      if (status < 200 || status >= 300) continue;
      const parsed = JSON.parse(text) as {
        result?: string;
        error?: { message?: string };
      };
      if (parsed.error || typeof parsed.result !== "string" || parsed.result === "0x") {
        continue;
      }
      return BigInt(parsed.result);
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchKnownErc20Portfolio(
  address: string,
): Promise<PortfolioResult> {
  const holder = address.toLowerCase();
  const settled = await mapPool(
    KNOWN,
    6,
    async (token): Promise<TokenBalance | null> => {
      const raw = await erc20Balance(token.rpcs, token.address, holder);
      if (raw == null || raw === BigInt(0)) return null;
      const balance = Number(raw) / 10 ** token.decimals;
      if (!(balance > 0)) return null;
      return {
        chainId: token.chainId,
        chainName: token.chainName,
        chainSlug: token.slug,
        symbol: token.symbol,
        name: token.name,
        balance,
        balanceRaw: raw.toString(),
        decimals: token.decimals,
        priceUsd: null,
        valueUsd: null,
        tokenAddress: token.address.toLowerCase(),
        thumbnail: null,
        tokenType: "erc20",
      };
    },
  );

  let tokens = settled.filter((t): t is TokenBalance => t != null);
  const idBySymbol = new Map(KNOWN.map((t) => [t.symbol, t.coingeckoId]));
  const prices = await fetchUsdPrices(
    tokens
      .map((t) => idBySymbol.get(t.symbol))
      .filter((id): id is string => !!id),
  );
  tokens = tokens.map((t) => {
    const id = idBySymbol.get(t.symbol);
    const priceUsd = id ? (prices.get(id) ?? null) : null;
    return {
      ...t,
      priceUsd,
      valueUsd: priceUsd != null ? t.balance * priceUsd : null,
    };
  });

  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: new Set(tokens.map((t) => t.chainSlug)).size,
    tokens,
    provider: "known-erc20-rpc",
    scannedAt: new Date().toISOString(),
    warnings:
      tokens.length === 0
        ? []
        : [`Public RPC found ${tokens.length} well-known ERC-20 balance(s).`],
  };
}

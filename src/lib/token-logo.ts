import { getAddress, isAddress } from "viem";

type LogoToken = {
  chainId: number | null;
  chainSlug: string;
  tokenAddress: string | null;
  thumbnail: string | null;
  symbol: string;
  tokenType?: string;
};

/** Trust Wallet `blockchains/{name}` folder for common EVM nets. */
const TRUST_WALLET_CHAIN: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  bsc: "smartchain",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  avalanche: "avalanchec",
  fantom: "fantom",
  gnosis: "xdai",
  cronos: "cronos",
  celo: "celo",
  linea: "linea",
  scroll: "scroll",
  zksync: "zksync",
  blast: "blast",
  mantle: "mantle",
  moonbeam: "moonbeam",
  moonriver: "moonriver",
  aurora: "aurora",
  metis: "metis",
  fraxtal: "fraxtal",
  unichain: "unichain",
  sei: "sei",
  sonic: "sonic",
  hyperevm: "hyperevm",
  mode: "mode",
  solana: "solana",
  bitcoin: "bitcoin",
  tron: "tron",
  sui: "sui",
  monad: "monad",
  monad_testnet: "monad",
};

/** DefiLlama chain slug used in /icons/chains/rsz_{slug}.jpg */
const LLAMA_CHAIN: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  bsc: "bsc",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  avalanche: "avax",
  fantom: "fantom",
  gnosis: "xdai",
  cronos: "cronos",
  celo: "celo",
  linea: "linea",
  scroll: "scroll",
  zksync: "era",
  blast: "blast",
  mantle: "mantle",
  fraxtal: "fraxtal",
  unichain: "unichain",
  sei: "sei",
  sonic: "sonic",
  hyperevm: "hyperliquid",
  mode: "mode",
  flare: "flare",
  rootstock: "rsk",
  robinhood: "ethereum",
  solana: "solana",
  bitcoin: "bitcoin",
  tron: "tron",
  sui: "sui",
  monads: "monad",
  monad: "monad",
  monad_testnet: "monad",
  moonbeam: "moonbeam",
  aurora: "aurora",
  metis: "metis",
  taiko: "taiko",
  soneium: "soneium",
  story: "story",
  worldchain: "wc",
  berachain: "berachain",
  ink: "ink",
};

/** DexScreener `dd.dexscreener.com/ds-data/tokens/{chain}/{address}.png` */
const DEXSCREENER_CHAIN: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  bsc: "bsc",
  polygon: "polygon",
  arbitrum: "arbitrum",
  optimism: "optimism",
  base: "base",
  avalanche: "avalanche",
  fantom: "fantom",
  gnosis: "gnosis",
  linea: "linea",
  scroll: "scroll",
  zksync: "zksync",
  blast: "blast",
  mantle: "mantle",
  celo: "celo",
  fraxtal: "fraxtal",
  unichain: "unichain",
  sei: "sei",
  sonic: "sonic",
  hyperevm: "hyperevm",
  mode: "mode",
  solana: "solana",
  sui: "sui",
  monad: "monad",
  monad_testnet: "monad",
  tron: "tron",
  ink: "ink",
  soneium: "soneium",
  berachain: "berachain",
  worldchain: "worldchain",
};

const CHAIN_ID_DEXSCREENER: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
  43114: "avalanche",
  250: "fantom",
  100: "gnosis",
  59144: "linea",
  534352: "scroll",
  324: "zksync",
  81457: "blast",
  5000: "mantle",
  42220: "celo",
  252: "fraxtal",
  130: "unichain",
  1329: "sei",
  146: "sonic",
  999: "hyperevm",
  34443: "mode",
  143: "monad",
  10143: "monad",
  57073: "ink",
  1868: "soneium",
  80094: "berachain",
  480: "worldchain",
};

const CHAIN_ID_GECKO_TERMINAL: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon_pos",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
  43114: "avax",
  250: "ftm",
  100: "xdai",
  59144: "linea",
  534352: "scroll",
  324: "zksync",
  81457: "blast",
  5000: "mantle",
  42220: "celo",
  252: "fraxtal",
  130: "unichain",
  1329: "sei-evm",
  146: "sonic",
  143: "monad",
  10143: "monad",
  34443: "mode",
};

/** CoinGecko / CMC-style static images for common tickers (no API key). */
const SYMBOL_IMAGES: Record<string, string[]> = {
  btc: [
    "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png",
    "https://assets.coincap.io/assets/icons/btc@2x.png",
  ],
  eth: [
    "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
    "https://assets.coincap.io/assets/icons/eth@2x.png",
  ],
  sol: [
    "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
    "https://assets.coincap.io/assets/icons/sol@2x.png",
  ],
  sui: [
    "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png",
    "https://assets.coincap.io/assets/icons/sui@2x.png",
  ],
  bnb: ["https://coin-images.coingecko.com/coins/images/825/small/bnb-icon2_2x.png"],
  usdc: ["https://coin-images.coingecko.com/coins/images/6319/small/usdc.png"],
  usdt: ["https://coin-images.coingecko.com/coins/images/325/small/Tether.png"],
  weth: ["https://coin-images.coingecko.com/coins/images/2518/small/weth.png"],
  wbtc: ["https://coin-images.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png"],
  dai: ["https://coin-images.coingecko.com/coins/images/9956/small/Badge_Dai.png"],
  matic: ["https://coin-images.coingecko.com/coins/images/4713/small/polygon.png"],
  pol: ["https://coin-images.coingecko.com/coins/images/4713/small/polygon.png"],
  avax: ["https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png"],
  op: ["https://coin-images.coingecko.com/coins/images/25244/small/Optimism.png"],
  arb: ["https://coin-images.coingecko.com/coins/images/16547/small/arb.jpg"],
  trx: ["https://coin-images.coingecko.com/coins/images/1094/small/tron-logo.png"],
  ton: ["https://coin-images.coingecko.com/coins/images/17980/small/ton_symbol.png"],
  doge: ["https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png"],
  ada: ["https://coin-images.coingecko.com/coins/images/975/small/cardano.png"],
  link: ["https://coin-images.coingecko.com/coins/images/877/small/chainlink-new-logo.png"],
  uni: ["https://coin-images.coingecko.com/coins/images/12504/small/uniswap-logo.png"],
  aave: ["https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png"],
  pepe: ["https://coin-images.coingecko.com/coins/images/29850/small/pepe-token.jpeg"],
  shib: ["https://coin-images.coingecko.com/coins/images/11939/small/shiba.png"],
  mon: ["/monad/mark.png"],
};

function isNative(token: LogoToken): boolean {
  if (token.tokenType === "native") return true;
  if (!token.tokenAddress) return true;
  const a = token.tokenAddress.toLowerCase();
  return (
    a === "native" ||
    a === "0x0000000000000000000000000000000000000000" ||
    a === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  );
}

function checksumOrLower(address: string): string {
  if (isAddress(address)) {
    try {
      return getAddress(address);
    } catch {
      return address;
    }
  }
  return address;
}

function pushUnique(out: string[], url: string | null | undefined) {
  if (!url) return;
  const ok = /^https?:\/\//i.test(url) || url.startsWith("/");
  if (!ok) return;
  if (!out.includes(url)) out.push(url);
}

function dexScreenerChain(token: LogoToken, slug: string): string | null {
  if (token.chainId != null && CHAIN_ID_DEXSCREENER[token.chainId]) {
    return CHAIN_ID_DEXSCREENER[token.chainId];
  }
  return DEXSCREENER_CHAIN[slug] ?? null;
}

function geckoTerminalNetwork(token: LogoToken): string | null {
  if (token.chainId != null && CHAIN_ID_GECKO_TERMINAL[token.chainId]) {
    return CHAIN_ID_GECKO_TERMINAL[token.chainId];
  }
  const slug = token.chainSlug.toLowerCase().replace(/-/g, "_");
  if (slug === "solana") return "solana";
  if (slug === "sui") return "sui-network";
  if (slug === "eth" || slug === "ethereum") return "eth";
  if (slug === "monad" || slug === "monad_testnet") return "monad";
  return null;
}

/**
 * Ordered logo URL candidates. First working image wins in TokenIcon.
 * Sources: indexer thumbnail, CoinGecko, DexScreener, 1inch, Trust Wallet,
 * DefiLlama, CoinCap, LiveCoinWatch, GeckoTerminal proxy.
 */
export function tokenLogoCandidates(token: LogoToken): string[] {
  const out: string[] = [];
  const slug = token.chainSlug.toLowerCase().replace(/-/g, "_");
  const native = isNative(token);
  const sym = token.symbol.trim().toLowerCase();

  pushUnique(out, token.thumbnail);

  const isMonad =
    slug === "monad" ||
    slug === "monad_testnet" ||
    token.chainId === 10143 ||
    token.chainId === 143 ||
    sym === "mon";
  if (native && isMonad) {
    pushUnique(out, "/monad/mark.png");
  }

  if (SYMBOL_IMAGES[sym]) {
    for (const url of SYMBOL_IMAGES[sym]) pushUnique(out, url);
  }

  if (!native && token.tokenAddress) {
    const lower = token.tokenAddress.toLowerCase();
    const checksum = checksumOrLower(token.tokenAddress);
    const dexChain = dexScreenerChain(token, slug);
    const gtNet = geckoTerminalNetwork(token);

    if (lower.startsWith("0x")) {
      pushUnique(out, `https://tokens.1inch.io/${lower}.png`);
    }

    if (dexChain) {
      pushUnique(
        out,
        `https://dd.dexscreener.com/ds-data/tokens/${dexChain}/${token.tokenAddress}.png`,
      );
      pushUnique(
        out,
        `https://dd.dexscreener.com/ds-data/tokens/${dexChain}/${lower}.png`,
      );
    }

    if (token.chainId != null) {
      pushUnique(
        out,
        `https://icons.llamao.fi/icons/tokens/${token.chainId}/${lower}?h=64`,
      );
    }

    const tw = TRUST_WALLET_CHAIN[slug];
    if (slug === "solana" || tw === "solana") {
      pushUnique(
        out,
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/${token.tokenAddress}/logo.png`,
      );
      pushUnique(
        out,
        `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${token.tokenAddress}/logo.png`,
      );
    } else if (tw && lower.startsWith("0x")) {
      pushUnique(
        out,
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${tw}/assets/${checksum}/logo.png`,
      );
    }

    if (gtNet) {
      const q = new URLSearchParams({
        network: gtNet,
        address: lower,
      });
      pushUnique(out, `/api/logos/token?${q.toString()}`);
    }
  } else {
    const llama = LLAMA_CHAIN[slug];
    if (llama) {
      pushUnique(out, `https://icons.llamao.fi/icons/chains/rsz_${llama}.jpg`);
    }
    const tw = TRUST_WALLET_CHAIN[slug];
    if (tw) {
      pushUnique(
        out,
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${tw}/info/logo.png`,
      );
    }
  }

  if (sym && /^[a-z0-9]{1,12}$/.test(sym)) {
    pushUnique(out, `https://assets.coincap.io/assets/icons/${sym}@2x.png`);
    pushUnique(
      out,
      `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${sym}.png`,
    );
    pushUnique(
      out,
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${sym}.png`,
    );
  }

  return out;
}

/** Coverage-card / native chain marks from public CDNs. */
export const COVERAGE_LOGOS = {
  eth: "https://assets.coincap.io/assets/icons/eth@2x.png",
  sol: "https://assets.coincap.io/assets/icons/sol@2x.png",
  btc: "https://assets.coincap.io/assets/icons/btc@2x.png",
  sui: "https://assets.coincap.io/assets/icons/sui@2x.png",
  monad: "/monad/mark.png",
} as const;

export const EVM_CLUSTER_LOGOS = [
  "https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_bsc.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_polygon.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_base.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_optimism.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_avax.jpg",
  "https://icons.llamao.fi/icons/chains/rsz_monad.jpg",
] as const;

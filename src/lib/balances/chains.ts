/** Map Ankr blockchain slugs → display metadata + EVM chain ids */
export const ANKR_CHAIN_META: Record<
  string,
  { name: string; chainId: number | null }
> = {
  monad_testnet: { name: "Monad Testnet", chainId: 10143 },
  monad: { name: "Monad", chainId: 143 },
  eth: { name: "Ethereum", chainId: 1 },
  ethereum: { name: "Ethereum", chainId: 1 },
  bsc: { name: "BNB Smart Chain", chainId: 56 },
  polygon: { name: "Polygon", chainId: 137 },
  arbitrum: { name: "Arbitrum One", chainId: 42161 },
  optimism: { name: "Optimism", chainId: 10 },
  base: { name: "Base", chainId: 8453 },
  avalanche: { name: "Avalanche C-Chain", chainId: 43114 },
  robinhood: { name: "Robinhood Chain", chainId: 4663 },
  fraxtal: { name: "Fraxtal", chainId: 252 },
  frax: { name: "Fraxtal", chainId: 252 },
  fantom: { name: "Fantom", chainId: 250 },
  flare: { name: "Flare", chainId: 14 },
  gnosis: { name: "Gnosis", chainId: 100 },
  linea: { name: "Linea", chainId: 59144 },
  scroll: { name: "Scroll", chainId: 534352 },
  zksync: { name: "zkSync Era", chainId: 324 },
  polygon_zkevm: { name: "Polygon zkEVM", chainId: 1101 },
  polygonzkevm: { name: "Polygon zkEVM", chainId: 1101 },
  blast: { name: "Blast", chainId: 81457 },
  mantle: { name: "Mantle", chainId: 5000 },
  celo: { name: "Celo", chainId: 42220 },
  moonbeam: { name: "Moonbeam", chainId: 1284 },
  moonriver: { name: "Moonriver", chainId: 1285 },
  aurora: { name: "Aurora", chainId: 1313161554 },
  cronos: { name: "Cronos", chainId: 25 },
  syscoin: { name: "Syscoin", chainId: 57 },
  rollux: { name: "Rollux", chainId: 570 },
  taiko: { name: "Taiko", chainId: 167000 },
  xai: { name: "Xai", chainId: 660279 },
  sei: { name: "Sei EVM", chainId: 1329 },
  core: { name: "Core", chainId: 1116 },
  metis: { name: "Metis", chainId: 1088 },
  telos: { name: "Telos", chainId: 40 },
  kava: { name: "Kava EVM", chainId: 2222 },
  klaytn: { name: "Kaia (Klaytn)", chainId: 8217 },
  kaia: { name: "Kaia", chainId: 8217 },
  iota_evm: { name: "IOTA EVM", chainId: 8822 },
  bitrock: { name: "Bitrock", chainId: 7171 },
  sonic: { name: "Sonic", chainId: 146 },
  soneium: { name: "Soneium", chainId: 1868 },
  unichain: { name: "Unichain", chainId: 130 },
  story: { name: "Story", chainId: 1514 },
};

export function resolveChain(slug: string): {
  name: string;
  chainId: number | null;
  slug: string;
} {
  const key = slug.toLowerCase().replace(/-/g, "_");
  const meta = ANKR_CHAIN_META[key];
  if (meta) {
    return { name: meta.name, chainId: meta.chainId, slug: key };
  }
  return {
    name: slug
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    chainId: null,
    slug: key,
  };
}

/** Public RPC endpoints for native-balance fallback when no portfolio API key is set */
export const NATIVE_SCAN_CHAINS: {
  chainId: number;
  name: string;
  slug: string;
  symbol: string;
  decimals: number;
  rpc: string;
}[] = [
  {
    chainId: 1,
    name: "Ethereum",
    slug: "eth",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://ethereum.publicnode.com",
  },
  {
    chainId: 4663,
    name: "Robinhood Chain",
    slug: "robinhood",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://rpc.mainnet.chain.robinhood.com",
  },
  {
    chainId: 252,
    name: "Fraxtal",
    slug: "fraxtal",
    symbol: "frxETH",
    decimals: 18,
    rpc: "https://rpc.frax.com",
  },
  {
    chainId: 56,
    name: "BNB Smart Chain",
    slug: "bsc",
    symbol: "BNB",
    decimals: 18,
    rpc: "https://bsc.publicnode.com",
  },
  {
    chainId: 137,
    name: "Polygon",
    slug: "polygon",
    symbol: "POL",
    decimals: 18,
    rpc: "https://polygon-bor.publicnode.com",
  },
  {
    chainId: 42161,
    name: "Arbitrum One",
    slug: "arbitrum",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://arbitrum-one.publicnode.com",
  },
  {
    chainId: 10,
    name: "Optimism",
    slug: "optimism",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://optimism.publicnode.com",
  },
  {
    chainId: 8453,
    name: "Base",
    slug: "base",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://base.publicnode.com",
  },
  {
    chainId: 43114,
    name: "Avalanche C-Chain",
    slug: "avalanche",
    symbol: "AVAX",
    decimals: 18,
    rpc: "https://avalanche-c-chain.publicnode.com",
  },
  {
    chainId: 250,
    name: "Fantom",
    slug: "fantom",
    symbol: "FTM",
    decimals: 18,
    rpc: "https://fantom.publicnode.com",
  },
  {
    chainId: 324,
    name: "zkSync Era",
    slug: "zksync",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://zksync.publicnode.com",
  },
  {
    chainId: 59144,
    name: "Linea",
    slug: "linea",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://linea.publicnode.com",
  },
  {
    chainId: 534352,
    name: "Scroll",
    slug: "scroll",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://scroll.publicnode.com",
  },
  {
    chainId: 81457,
    name: "Blast",
    slug: "blast",
    symbol: "ETH",
    decimals: 18,
    rpc: "https://rpc.blast.io",
  },
  {
    chainId: 5000,
    name: "Mantle",
    slug: "mantle",
    symbol: "MNT",
    decimals: 18,
    rpc: "https://rpc.mantle.xyz",
  },
  {
    chainId: 100,
    name: "Gnosis",
    slug: "gnosis",
    symbol: "xDAI",
    decimals: 18,
    rpc: "https://gnosis.publicnode.com",
  },
  {
    chainId: 42220,
    name: "Celo",
    slug: "celo",
    symbol: "CELO",
    decimals: 18,
    rpc: "https://forno.celo.org",
  },
  {
    chainId: 1284,
    name: "Moonbeam",
    slug: "moonbeam",
    symbol: "GLMR",
    decimals: 18,
    rpc: "https://moonbeam.publicnode.com",
  },
  {
    chainId: 25,
    name: "Cronos",
    slug: "cronos",
    symbol: "CRO",
    decimals: 18,
    rpc: "https://evm.cronos.org",
  },
  {
    chainId: 1088,
    name: "Metis",
    slug: "metis",
    symbol: "METIS",
    decimals: 18,
    rpc: "https://andromeda.metis.io/?owner=1088",
  },
  {
    chainId: 2222,
    name: "Kava EVM",
    slug: "kava",
    symbol: "KAVA",
    decimals: 18,
    rpc: "https://evm.kava.io",
  },
  {
    chainId: 1329,
    name: "Sei EVM",
    slug: "sei",
    symbol: "SEI",
    decimals: 18,
    rpc: "https://evm-rpc.sei-apis.com",
  },
];

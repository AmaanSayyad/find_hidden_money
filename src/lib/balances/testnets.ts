/** Drop testnets from holdings. Monad Testnet is for tips only, not the portfolio. */

const TESTNET_CHAIN_IDS = new Set([
  5, // Goerli
  97, // BSC testnet
  420, // OP Goerli
  1337,
  31337,
  4002, // Fantom testnet
  84532, // Base Sepolia
  421614, // Arb Sepolia
  11155111, // Sepolia
  11155420, // OP Sepolia
  80001, // Mumbai
  80002, // Amoy
  43113, // Fuji
  10143, // Monad Testnet
  23400, // MegaETH testnet-ish
]);

const TESTNET_RE =
  /\b(test|testnet|devnet|sepolia|holesky|hoodi|goerli|mumbai|amoy|fuji|chapel|moksha|cardona|local|dev)\b/i;

export function isTestnetChain(opts: {
  chainId?: number | null;
  name?: string;
  slug?: string;
}): boolean {
  if (opts.chainId != null && TESTNET_CHAIN_IDS.has(opts.chainId)) return true;
  const hay = `${opts.name ?? ""} ${opts.slug ?? ""}`;
  return TESTNET_RE.test(hay);
}

export function isTestnetToken(token: {
  chainId?: number | null;
  chainName?: string;
  chainSlug?: string;
}): boolean {
  return isTestnetChain({
    chainId: token.chainId,
    name: token.chainName,
    slug: token.chainSlug,
  });
}

export function dropTestnetHoldings<T extends {
  chainId?: number | null;
  chainName?: string;
  chainSlug?: string;
  valueUsd?: number | null;
}>(tokens: T[]): T[] {
  return tokens.filter((t) => !isTestnetToken(t));
}

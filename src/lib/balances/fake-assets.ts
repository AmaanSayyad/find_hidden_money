import type { TokenBalance } from "./types";

const STABLE_TICKERS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "USDD",
  "FDUSD",
  "USDE",
  "USDT0",
]);

const OFFICIAL_STABLE_NAME =
  /\b(tether|usd coin|usdc|dai|circle|binance-?peg|bridged|usd₮|tether usd|usdt0)\b/i;

function tickerOf(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Flash / experimental USDT clones keep the USDT ticker but are not Tether.
 * PHDR is one of those — show the balance, never the ~$1 price.
 */
export function isFakeValuedToken(token: {
  symbol: string;
  name: string;
  chainName?: string;
  chainSlug?: string;
}): boolean {
  const hay = `${token.symbol} ${token.name} ${token.chainName ?? ""} ${token.chainSlug ?? ""}`;
  if (/\bflash\b|\bphdr\b/i.test(hay)) return true;

  const ticker = tickerOf(token.symbol);
  if (!STABLE_TICKERS.has(ticker)) return false;

  const nameKey = token.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (nameKey === ticker) return false;
  return !OFFICIAL_STABLE_NAME.test(token.name);
}

export function zeroFakeTokenValue<T extends {
  symbol: string;
  name: string;
  chainName?: string;
  chainSlug?: string;
  priceUsd?: number | null;
  valueUsd?: number | null;
}>(token: T): T {
  if (!isFakeValuedToken(token)) return token;
  return { ...token, priceUsd: 0, valueUsd: 0 };
}

export function zeroFakeTokenValues(tokens: TokenBalance[]): TokenBalance[] {
  return tokens.map(zeroFakeTokenValue);
}

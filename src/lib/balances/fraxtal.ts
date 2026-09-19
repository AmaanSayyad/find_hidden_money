import { nodeRequest } from "./http";
import type { PortfolioResult, TokenBalance } from "./types";

const CHAIN_ID = 252;
const CHAIN_SLUG = "fraxtal";
const CHAIN_NAME = "Fraxtal";
const RPC = "https://rpc.frax.com";

let cachedFrxEthUsd: { at: number; usd: number | null } | null = null;

async function fetchFrxEthUsd(): Promise<number | null> {
  if (cachedFrxEthUsd && Date.now() - cachedFrxEthUsd.at < 60_000) {
    return cachedFrxEthUsd.usd;
  }
  try {
    const { status, text } = await nodeRequest(
      "https://api.coingecko.com/api/v3/simple/price?ids=frax-ether&vs_currencies=usd",
      { timeoutMs: 8_000 },
    );
    if (status < 200 || status >= 300) {
      cachedFrxEthUsd = { at: Date.now(), usd: null };
      return null;
    }
    const data = JSON.parse(text) as { "frax-ether"?: { usd?: number } };
    const usd =
      typeof data["frax-ether"]?.usd === "number"
        ? data["frax-ether"].usd
        : null;
    cachedFrxEthUsd = { at: Date.now(), usd };
    return usd;
  } catch {
    cachedFrxEthUsd = { at: Date.now(), usd: null };
    return null;
  }
}

async function nativeBalance(address: string): Promise<bigint | null> {
  try {
    const { status, text } = await nodeRequest(RPC, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
      timeoutMs: 10_000,
    });
    if (status < 200 || status >= 300) return null;
    const data = JSON.parse(text) as { result?: string };
    if (typeof data.result !== "string") return null;
    return BigInt(data.result);
  } catch {
    return null;
  }
}

/**
 * Fraxtal (eip155:252) — Ankr does not index this chain.
 * Native gas is frxETH (MetaMask labels it Frax Ether). Same 0x as other EVM nets.
 */
export async function fetchFraxtalPortfolio(
  address: string,
): Promise<PortfolioResult> {
  const warnings: string[] = [];
  const tokens: TokenBalance[] = [];

  const [raw, priceUsd] = await Promise.all([
    nativeBalance(address),
    fetchFrxEthUsd(),
  ]);

  if (raw != null && raw > BigInt(0)) {
    const balance = Number(raw) / 1e18;
    tokens.push({
      chainId: CHAIN_ID,
      chainName: CHAIN_NAME,
      chainSlug: CHAIN_SLUG,
      symbol: "frxETH",
      name: "Frax Ether",
      balance,
      balanceRaw: raw.toString(),
      decimals: 18,
      priceUsd,
      valueUsd: priceUsd != null ? balance * priceUsd : null,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    });
  }

  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  if (tokens.length === 0) {
    warnings.push("Fraxtal: no native frxETH on this address.");
  } else {
    warnings.push(
      `Fraxtal: ${tokens.length} asset(s) via rpc.frax.com (chain ${CHAIN_ID}; Ankr unsupported).`,
    );
  }

  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: tokens.length ? 1 : 0,
    tokens,
    provider: "fraxtal-rpc",
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

/** Fill missing USD on frxETH / FRAX rows Ankr returned without a price. */
export async function priceFrxEthTokens(
  tokens: TokenBalance[],
): Promise<TokenBalance[]> {
  const needs = tokens.some(
    (t) =>
      /^(frxeth|frax ether)$/i.test(t.symbol) ||
      /frax ether/i.test(t.name) ||
      (t.chainSlug === "fraxtal" && t.valueUsd == null),
  );
  if (!needs) return tokens;
  const priceUsd = await fetchFrxEthUsd();
  if (priceUsd == null) return tokens;
  return tokens.map((t) => {
    const isFrx =
      /^(frxeth|frax)$/i.test(t.symbol) ||
      /frax ether/i.test(t.name) ||
      (t.chainSlug === "fraxtal" && t.tokenType === "native");
    if (!isFrx) return t;
    if (t.valueUsd != null && t.valueUsd > 0) return t;
    return {
      ...t,
      priceUsd,
      valueUsd: t.balance * priceUsd,
    };
  });
}

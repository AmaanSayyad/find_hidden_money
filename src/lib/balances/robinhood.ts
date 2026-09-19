import { nodeRequest } from "./http";
import type { PortfolioResult, TokenBalance } from "./types";

const CHAIN_ID = 4663;
const CHAIN_SLUG = "robinhood";
const CHAIN_NAME = "Robinhood Chain";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const RPC = "https://rpc.mainnet.chain.robinhood.com";

type BlockscoutTokenBal = {
  value?: string;
  token?: {
    address_hash?: string;
    name?: string;
    symbol?: string;
    decimals?: string | null;
    type?: string;
    exchange_rate?: string | null;
    icon_url?: string | null;
  };
};

type BlockscoutAddress = {
  coin_balance?: string | null;
  exchange_rate?: string | null;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const { status, text } = await nodeRequest(url, { timeoutMs: 12_000 });
    if (status < 200 || status >= 300) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function nativeViaRpc(address: string): Promise<bigint | null> {
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
 * Robinhood Chain (eip155:4663) uses the same 0x address as other EVM chains.
 * Ankr does not index it — pull natives + ERC-20s from Blockscout.
 */
export async function fetchRobinhoodPortfolio(
  address: string,
): Promise<PortfolioResult> {
  const warnings: string[] = [];
  const tokens: TokenBalance[] = [];

  const [addrInfo, tokenBals, rpcBal] = await Promise.all([
    fetchJson<BlockscoutAddress>(`${EXPLORER}/api/v2/addresses/${address}`),
    fetchJson<BlockscoutTokenBal[]>(
      `${EXPLORER}/api/v2/addresses/${address}/token-balances`,
    ),
    nativeViaRpc(address),
  ]);

  let nativeRaw =
    rpcBal ??
    (addrInfo?.coin_balance ? BigInt(addrInfo.coin_balance) : null);
  if (nativeRaw != null && nativeRaw > BigInt(0)) {
    const balance = Number(nativeRaw) / 1e18;
    const priceUsd = Number.parseFloat(addrInfo?.exchange_rate ?? "");
    const priced = Number.isFinite(priceUsd) ? priceUsd : null;
    tokens.push({
      chainId: CHAIN_ID,
      chainName: CHAIN_NAME,
      chainSlug: CHAIN_SLUG,
      symbol: "ETH",
      name: "Ether (Robinhood Chain)",
      balance,
      balanceRaw: nativeRaw.toString(),
      decimals: 18,
      priceUsd: priced,
      valueUsd: priced != null ? balance * priced : null,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    });
  }

  for (const row of tokenBals ?? []) {
    const t = row.token;
    if (!t?.address_hash || !row.value) continue;
    const type = (t.type || "").toUpperCase();
    if (type.includes("721") || type.includes("1155") || type.includes("NFT")) {
      continue;
    }
    const decimals = Number.parseInt(t.decimals || "18", 10) || 18;
    let raw: bigint;
    try {
      raw = BigInt(row.value);
    } catch {
      continue;
    }
    if (raw <= BigInt(0)) continue;
    const balance = Number(raw) / 10 ** decimals;
    if (!(balance > 0)) continue;
    const priceUsd = Number.parseFloat(t.exchange_rate ?? "");
    const priced = Number.isFinite(priceUsd) ? priceUsd : null;
    tokens.push({
      chainId: CHAIN_ID,
      chainName: CHAIN_NAME,
      chainSlug: CHAIN_SLUG,
      symbol: t.symbol || "TOKEN",
      name: t.name || t.symbol || "Robinhood token",
      balance,
      balanceRaw: raw.toString(),
      decimals,
      priceUsd: priced,
      valueUsd: priced != null ? balance * priced : null,
      tokenAddress: t.address_hash.toLowerCase(),
      thumbnail: t.icon_url || null,
      tokenType: "erc20",
    });
  }

  tokens.sort(
    (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
  );
  const totalValueUsd = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  if (tokens.length === 0) {
    warnings.push("Robinhood Chain: no balances on this address.");
  } else {
    warnings.push(
      `Robinhood Chain: ${tokens.length} asset(s) via Blockscout (chain ${CHAIN_ID}).`,
    );
  }

  return {
    address,
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: tokens.length ? 1 : 0,
    tokens,
    provider: "robinhood-blockscout",
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

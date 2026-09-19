import { nodeJsonRpc, nodeRequest } from "./http";
import { mapPool } from "./pool";
import { isTestnetChain } from "./testnets";
import type { PortfolioResult, ScanStats, TokenBalance } from "./types";

type ChainlistEntry = {
  name: string;
  chain: string;
  chainId: number;
  shortName?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpc?: string[];
};

export type ScanableChain = {
  chainId: number;
  name: string;
  slug: string;
  symbol: string;
  decimals: number;
  rpcs: string[];
};

const CHAINLIST_URL = "https://chainid.network/chains.json";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RPC_TIMEOUT_MS = 2_500;
const RPC_CONCURRENCY = 60;
const MAX_RPCS_PER_CHAIN = 1;

let cache: { at: number; chains: ScanableChain[] } | null = null;

function isUsableRpc(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (url.includes("${")) return false;
  if (/apikey|api_key|API_KEY|infura\.io\/v3\/$|alchemy\.com\/v2\/$/i.test(url)) {
    return false;
  }
  if (url.startsWith("ws://") || url.startsWith("wss://")) return false;
  return true;
}

function rpcPriority(url: string): number {
  if (url.includes("publicnode.com")) return 0;
  if (url.includes("llamarpc.com")) return 1;
  if (url.includes("drpc.org")) return 2;
  if (url.includes("1rpc.io")) return 3;
  if (url.startsWith("https://")) return 4;
  return 5;
}

function toSlug(name: string, chainId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "chain"}-${chainId}`;
}

export async function loadChainlist(): Promise<ScanableChain[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.chains;
  }

  const { status, text } = await nodeRequest(CHAINLIST_URL, {
    timeoutMs: 30_000,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Failed to load Chainlist (${status})`);
  }

  const raw = JSON.parse(text) as ChainlistEntry[];
  const byId = new Map<number, ScanableChain>();

  for (const entry of raw) {
    if (!entry?.chainId || !Array.isArray(entry.rpc)) continue;
    if (
      isTestnetChain({
        chainId: entry.chainId,
        name: entry.name,
        slug: entry.shortName || entry.chain,
      })
    ) {
      continue;
    }
    const rpcs = [...new Set(entry.rpc.filter(isUsableRpc))]
      .sort((a, b) => rpcPriority(a) - rpcPriority(b))
      .slice(0, MAX_RPCS_PER_CHAIN);
    if (rpcs.length === 0) continue;

    byId.set(entry.chainId, {
      chainId: entry.chainId,
      name: entry.name || `Chain ${entry.chainId}`,
      slug: toSlug(entry.shortName || entry.name || "chain", entry.chainId),
      symbol: entry.nativeCurrency?.symbol || "ETH",
      decimals: entry.nativeCurrency?.decimals ?? 18,
      rpcs,
    });
  }

  const chains = [...byId.values()].sort((a, b) => a.chainId - b.chainId);
  cache = { at: Date.now(), chains };
  return chains;
}

async function ethGetBalance(
  rpc: string,
  address: string,
): Promise<bigint | null> {
  try {
    const result = await nodeJsonRpc<string>(
      rpc,
      "eth_getBalance",
      [address, "latest"],
      RPC_TIMEOUT_MS,
    );
    if (typeof result !== "string" || !result.startsWith("0x")) return null;
    return BigInt(result);
  } catch {
    return null;
  }
}

async function balanceOnChain(
  chain: ScanableChain,
  address: string,
): Promise<{ raw: bigint | null; reachable: boolean }> {
  for (const rpc of chain.rpcs) {
    const raw = await ethGetBalance(rpc, address);
    // null = RPC failed; 0n = reachable with empty balance
    if (raw != null) return { raw, reachable: true };
  }
  return { raw: null, reachable: false };
}

export type ChainlistScanResult = {
  tokens: TokenBalance[];
  stats: ScanStats;
};

/**
 * Sweep native gas balances across every Chainlist EVM network that publishes
 * a public HTTP RPC (typically 2000+ chains).
 */
export async function scanChainlistNatives(
  address: string,
): Promise<ChainlistScanResult> {
  const started = Date.now();
  const chains = await loadChainlist();

  let reachable = 0;
  let failed = 0;

  const settled = await mapPool(chains, RPC_CONCURRENCY, async (chain) => {
    const { raw, reachable: ok } = await balanceOnChain(chain, address);
    if (!ok) {
      failed += 1;
      return null;
    }
    reachable += 1;
    if (raw == null || raw === BigInt(0)) return null;

    const decimals = chain.decimals || 18;
    const balance = Number(raw) / 10 ** decimals;
    if (!(balance > 0)) return null;

    const token: TokenBalance = {
      chainId: chain.chainId,
      chainName: chain.name,
      chainSlug: chain.slug,
      symbol: chain.symbol,
      name: `${chain.symbol} (native)`,
      balance,
      balanceRaw: raw.toString(),
      decimals,
      priceUsd: null,
      valueUsd: null,
      tokenAddress: null,
      thumbnail: null,
      tokenType: "native",
    };
    return token;
  });

  const tokens = settled
    .filter((t): t is TokenBalance => t != null)
    .sort((a, b) => b.balance - a.balance);

  return {
    tokens,
    stats: {
      chainsTargeted: chains.length,
      chainsReachable: reachable,
      chainsWithBalance: tokens.length,
      chainsFailed: failed,
      durationMs: Date.now() - started,
    },
  };
}

export async function fetchChainlistPortfolio(
  address: string,
): Promise<PortfolioResult> {
  const { tokens, stats } = await scanChainlistNatives(address);
  return {
    address,
    totalValueUsd: 0,
    tokenCount: tokens.length,
    chainCount: new Set(tokens.map((t) => t.chainSlug)).size,
    tokens,
    provider: "chainlist-rpc",
    scannedAt: new Date().toISOString(),
    warnings: [
      `Swept ${stats.chainsTargeted.toLocaleString()} Chainlist EVM networks for native balances (${stats.chainsReachable.toLocaleString()} RPCs responded in ${(stats.durationMs / 1000).toFixed(1)}s).`,
    ],
    scan: stats,
  };
}

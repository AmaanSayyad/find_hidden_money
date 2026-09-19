import { isValidSolanaAddress } from "@/lib/solana-address";
import { fetchAnkrPortfolio, fetchAnkrPortfolioFast } from "./ankr";
import { fetchBitcoinBalances } from "./bitcoin";
import { scanChainlistNatives } from "./chainlist";
import { fetchMoralisPortfolio } from "./moralis";
import { fetchNativeFallbackPortfolio } from "./native-fallback";
import { fetchKnownErc20Portfolio } from "./known-erc20";
import { fetchExtraEvmNatives } from "./extra-evm";
import {
  fetchFraxtalPortfolio,
  priceFrxEthTokens,
} from "./fraxtal";
import { zeroFakeTokenValues } from "./fake-assets";
import { isTestnetChain } from "./testnets";
import { priceUnpricedTokens } from "./prices";
import { fetchRobinhoodPortfolio } from "./robinhood";
import { fetchSolanaBalances } from "./solana";
import { fetchSuiBalances } from "./sui";
import { fetchTronBalances } from "./tron";
import type { PortfolioResult, ScanStats, TokenBalance } from "./types";

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

export function isValidEvmAddress(address: string): boolean {
  return EVM_RE.test(address);
}

export type ScanRequest = {
  evm?: string[];
  /** Robinhood Chain (4663) — may be different 0x addresses than Ethereum. */
  robinhood?: string[];
  solana?: string[];
  bitcoin?: string[];
  tron?: string[];
  sui?: string[];
  /**
   * quick = major natives + well-known ERC-20s (multi-wallet first pass).
   * indexed = natives, known ERC-20s, extra mainnets, indexer tokens.
   * full = indexed + 2,000+ Chainlist mainnet natives (no testnets).
   */
  mode?: "quick" | "indexed" | "full";
};

function normalizeAsset(token: TokenBalance): string {
  const addr = (token.tokenAddress || "").toLowerCase();
  if (
    !addr ||
    addr === "native" ||
    /^0x0+$/.test(addr) ||
    addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  ) {
    return "native";
  }
  return addr;
}

function tokenKey(token: TokenBalance): string {
  const chain = token.chainId != null ? `id:${token.chainId}` : token.chainSlug;
  return `${chain}:${normalizeAsset(token)}`;
}

function isSpamToken(token: TokenBalance): boolean {
  const hay = `${token.symbol} ${token.name}`.toLowerCase();
  return /https?:\/\/|www\.|\.top\b|\.cfd\b|t\.me\/|claim yours|visit website|airdrop/.test(
    hay,
  );
}

function mergeTokens(groups: TokenBalance[][]): TokenBalance[] {
  const merged = new Map<string, TokenBalance>();
  for (const group of groups) {
    for (const token of group) {
      if (isSpamToken(token)) continue;
      if (
        isTestnetChain({
          chainId: token.chainId,
          name: token.chainName,
          slug: token.chainSlug,
        })
      ) {
        continue;
      }
      const key = tokenKey(token);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, token);
        continue;
      }
      // Prefer priced / higher-value entries
      if ((token.valueUsd ?? -1) > (existing.valueUsd ?? -1)) {
        merged.set(key, token);
      }
    }
  }
  return [...merged.values()].sort(
    (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
  );
}

async function scanEvmIndexed(
  address: string,
  warnings: string[],
  fast = false,
) {
  const ankrKey = process.env.ANKR_API_KEY?.trim();
  const moralisKey = process.env.MORALIS_API_KEY?.trim();

  const indexedTokenGroups: TokenBalance[][] = [];
  const providers: string[] = [];
  let indexedTotalUsd = 0;

  // Always read major-chain natives so ETH/BNB/etc. show without an indexer key.
  try {
    const natives = await fetchNativeFallbackPortfolio(address, {
      lite: fast,
    });
    if (natives.tokenCount > 0) {
      indexedTokenGroups.push(natives.tokens);
      providers.push("native-rpc");
      indexedTotalUsd = Math.max(indexedTotalUsd, natives.totalValueUsd);
    }
    warnings.push(...natives.warnings);
  } catch (err) {
    warnings.push(
      `Native RPC: ${err instanceof Error ? err.message : "failed"}`,
    );
  }

  try {
    const known = await fetchKnownErc20Portfolio(address);
    if (known.tokenCount > 0) {
      indexedTokenGroups.push(known.tokens);
      providers.push("known-erc20");
      indexedTotalUsd = Math.max(indexedTotalUsd, known.totalValueUsd);
    }
    warnings.push(...known.warnings);
  } catch (err) {
    warnings.push(
      `Known ERC-20s: ${err instanceof Error ? err.message : "failed"}`,
    );
  }

  if (!ankrKey && !moralisKey) {
    warnings.push(
      "No ANKR_API_KEY / MORALIS_API_KEY — scanning natives + well-known ERC-20s on public RPCs. Add a key for full token discovery.",
    );
  }

  if (ankrKey) {
    try {
      const result = fast
        ? await fetchAnkrPortfolioFast(address, ankrKey)
        : await fetchAnkrPortfolio(address, ankrKey);
      indexedTokenGroups.push(result.tokens);
      providers.push(fast ? "ankr-fast" : "ankr");
      indexedTotalUsd = Math.max(indexedTotalUsd, result.totalValueUsd);
      warnings.push(...result.warnings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      warnings.push(
        `Ankr failed after retries: ${msg}. Check network / restart npm run dev.`,
      );
      if (fast) {
        // Rate-limits were previously shown as "empty" wallets — fall back to natives.
        try {
          const fb = await fetchNativeFallbackPortfolio(address);
          indexedTokenGroups.push(fb.tokens);
          providers.push("native-rpc-fallback");
          indexedTotalUsd = Math.max(indexedTotalUsd, fb.totalValueUsd);
          warnings.push(
            "Ankr rate-limited or failed — showing native balances on major chains only (ERC-20s like USDC may be missing until Ankr recovers).",
          );
        } catch (fbErr) {
          throw new Error(
            `Ankr failed: ${msg}; native fallback: ${fbErr instanceof Error ? fbErr.message : "failed"}`,
          );
        }
      }
    }
  }

  if (moralisKey && !fast) {
    try {
      const result = await fetchMoralisPortfolio(address, moralisKey);
      indexedTokenGroups.push(result.tokens);
      providers.push("moralis");
      indexedTotalUsd = Math.max(indexedTotalUsd, result.totalValueUsd);
      warnings.push(
        `Moralis returned ${result.tokenCount} token balance(s) across ${result.chainCount} chain(s).`,
      );
    } catch (err) {
      warnings.push(
        `Moralis: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  // Fraxtal + MetaMask gap mainnets (HyperEVM, Monad, Sei, …) — enrich/indexed only.
  // Skip on quick multi-wallet pass so 100+ wallets don't each hit ~12 RPCs.
  if (!fast) {
    try {
      const fx = await fetchFraxtalPortfolio(address);
      if (fx.tokenCount > 0) {
        indexedTokenGroups.push(fx.tokens);
        providers.push("fraxtal-rpc");
        indexedTotalUsd += fx.totalValueUsd;
      }
      warnings.push(...fx.warnings);
    } catch (err) {
      warnings.push(
        `Fraxtal: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
    try {
      const extra = await fetchExtraEvmNatives(address);
      if (extra.tokenCount > 0) {
        indexedTokenGroups.push(extra.tokens);
        providers.push("extra-evm-rpc");
        indexedTotalUsd += extra.totalValueUsd;
      }
      warnings.push(...extra.warnings);
    } catch (err) {
      warnings.push(
        `Extra EVM mainnets: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  if (indexedTokenGroups.length === 0 && (ankrKey || moralisKey)) {
    warnings.push(
      "Indexer keys are set but returned no balances (timeout or empty wallet on indexed chains).",
    );
  }

  let tokens = mergeTokens(indexedTokenGroups);
  tokens = await priceFrxEthTokens(tokens);
  tokens = await priceUnpricedTokens(tokens);
  tokens = zeroFakeTokenValues(tokens);
  const pricedTotal = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0);

  return {
    tokens,
    indexedProvider: providers.join("+") || null,
    indexedTotalUsd: Math.max(indexedTotalUsd, pricedTotal),
  };
}

async function scanEvm(
  address: string,
  warnings: string[],
  mode: "quick" | "indexed" | "full",
) {
  const indexed = await scanEvmIndexed(address, warnings, mode === "quick");

  if (mode === "indexed" || mode === "quick") {
    warnings.push(
      mode === "quick"
        ? "Quick scan: major-chain natives + well-known ERC-20s."
        : "Indexed scan: natives, well-known ERC-20s, and indexer tokens. Deep scan adds 2,000+ mainnet natives.",
    );
    return {
      tokens: indexed.tokens,
      scan: undefined,
      indexedProvider: indexed.indexedProvider,
      indexedTotalUsd: indexed.indexedTotalUsd,
    };
  }

  let chainlist: Awaited<ReturnType<typeof scanChainlistNatives>> | null =
    null;
  try {
    chainlist = await scanChainlistNatives(address);
  } catch (err) {
    warnings.push(
      `Chainlist sweep: ${err instanceof Error ? err.message : "failed"}`,
    );
  }

  warnings.push(
    "Token coverage: indexed tokens on major chains, plus native gas on 2,000+ mainnet EVM RPCs. Testnets are excluded.",
  );

  return {
    tokens: mergeTokens([indexed.tokens, chainlist?.tokens ?? []]),
    scan: chainlist?.stats,
    indexedProvider: indexed.indexedProvider,
    indexedTotalUsd: indexed.indexedTotalUsd,
  };
}

/**
 * Multi-ecosystem portfolio scan from MetaMask Multichain accounts.
 * EVM address → Ankr/Moralis + 2000+ Chainlist RPCs
 * Solana / Bitcoin / Tron → native + token balances on those networks
 */
export async function scanMultiPortfolio(
  request: ScanRequest,
): Promise<PortfolioResult> {
  const warnings: string[] = [];
  const mode =
    request.mode === "full"
      ? "full"
      : request.mode === "quick"
        ? "quick"
        : "indexed";
  const evm = [...new Set((request.evm ?? []).map((a) => a.toLowerCase()))].filter(
    isValidEvmAddress,
  );
  const robinhood = [
    ...new Set((request.robinhood ?? []).map((a) => a.toLowerCase())),
  ].filter(isValidEvmAddress);
  const solana = [...new Set(request.solana ?? [])].filter(isValidSolanaAddress);
  const bitcoin = [...new Set(request.bitcoin ?? [])].filter(Boolean);
  const tron = [...new Set(request.tron ?? [])].filter(Boolean);
  const sui = [...new Set(request.sui ?? [])].filter(Boolean);

  if (
    evm.length === 0 &&
    robinhood.length === 0 &&
    solana.length === 0 &&
    bitcoin.length === 0 &&
    tron.length === 0 &&
    sui.length === 0
  ) {
    throw new Error("No wallet addresses provided to scan");
  }

  const tokenGroups: TokenBalance[][] = [];
  let scanStats: ScanStats | undefined;
  const providers: string[] = [];

  // Robinhood + Solana/etc in parallel so RH isn't blocked behind Ankr.
  const nonEvmPromise = Promise.all([
    ...robinhood.map(async (addr) => {
      try {
        const result = await fetchRobinhoodPortfolio(addr);
        if (result.tokenCount > 0) providers.push("robinhood-blockscout");
        warnings.push(...result.warnings);
        return result.tokens;
      } catch (err) {
        warnings.push(
          `Robinhood Chain: ${err instanceof Error ? err.message : "failed"}`,
        );
        return [] as TokenBalance[];
      }
    }),
    ...solana.map(async (addr) => {
      try {
        const tokens = await fetchSolanaBalances(addr);
        providers.push("solana-rpc");
        warnings.push(
          `Solana ${addr.slice(0, 4)}…${addr.slice(-4)}: ${tokens.length} asset(s).`,
        );
        return tokens;
      } catch (err) {
        warnings.push(
          `Solana: ${err instanceof Error ? err.message : "failed"}`,
        );
        return [] as TokenBalance[];
      }
    }),
    ...bitcoin.map(async (addr) => {
      try {
        const tokens = await fetchBitcoinBalances(addr);
        providers.push("mempool.space");
        warnings.push(
          `Bitcoin ${addr.slice(0, 6)}…: ${tokens.length ? `${tokens[0].balance} BTC` : "no balance"}.`,
        );
        return tokens;
      } catch (err) {
        warnings.push(
          `Bitcoin: ${err instanceof Error ? err.message : "failed"}`,
        );
        return [] as TokenBalance[];
      }
    }),
    ...tron.map(async (addr) => {
      try {
        const tokens = await fetchTronBalances(addr);
        providers.push("trongrid");
        warnings.push(
          `Tron ${addr.slice(0, 4)}…${addr.slice(-4)}: ${tokens.length} asset(s).`,
        );
        return tokens;
      } catch (err) {
        warnings.push(
          `Tron: ${err instanceof Error ? err.message : "failed"}`,
        );
        return [] as TokenBalance[];
      }
    }),
    ...sui.map(async (addr) => {
      try {
        const tokens = await fetchSuiBalances(addr);
        providers.push("sui-rpc");
        warnings.push(
          `Sui ${addr.slice(0, 6)}…: ${tokens.length} asset(s).`,
        );
        return tokens;
      } catch (err) {
        warnings.push(
          `Sui: ${err instanceof Error ? err.message : "failed"}`,
        );
        return [] as TokenBalance[];
      }
    }),
  ]);

  // Primary EVM address — indexed (fast) or full (+ Chainlist)
  if (evm[0]) {
    const primary = await scanEvm(evm[0], warnings, mode);
    tokenGroups.push(primary.tokens);
    scanStats = primary.scan;
    if (primary.indexedProvider) providers.push(primary.indexedProvider);
    if (primary.scan) providers.push("chainlist-rpc");
    if (primary.scan) {
      warnings.push(
        `EVM Chainlist: ${primary.scan.chainsTargeted.toLocaleString()} networks, ${primary.scan.chainsReachable.toLocaleString()} RPCs ok, ${primary.scan.chainsWithBalance.toLocaleString()} with native balance.`,
      );
    }
  }

  for (const extra of evm.slice(1)) {
    const ankrKey = process.env.ANKR_API_KEY?.trim();
    if (!ankrKey) break;
    try {
      const extraPortfolio = await fetchAnkrPortfolio(extra, ankrKey);
      tokenGroups.push(extraPortfolio.tokens);
    } catch (err) {
      warnings.push(
        `Ankr extra ${extra.slice(0, 8)}…: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  const nonEvmGroups = await nonEvmPromise;
  tokenGroups.push(...nonEvmGroups);

  const tokens = zeroFakeTokenValues(mergeTokens(tokenGroups));
  const totalValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);

  const ecosystems = new Set(tokens.map((t) => t.chainSlug));

  return {
    address: evm[0] ?? solana[0] ?? bitcoin[0] ?? tron[0] ?? sui[0] ?? "",
    totalValueUsd,
    tokenCount: tokens.length,
    chainCount: ecosystems.size,
    tokens,
    provider: [...new Set(providers)].join("+") || "none",
    scannedAt: new Date().toISOString(),
    warnings,
    scan: scanStats,
  };
}

/** @deprecated prefer scanMultiPortfolio */
export async function scanWalletPortfolio(
  address: string,
): Promise<PortfolioResult> {
  return scanMultiPortfolio({ evm: [address] });
}

export type { PortfolioResult, TokenBalance, ScanStats } from "./types";

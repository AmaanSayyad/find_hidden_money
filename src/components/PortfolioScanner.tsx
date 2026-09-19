"use client";

import Image from "next/image";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMultichainWallet } from "@/context/MultichainWallet";
import {
  buildMultiPortfolio,
  portfolioToSlice,
  type CombinedToken,
  type MultiPortfolio,
  type WalletSlice,
} from "@/lib/balances/multi-wallet";
import type { PortfolioResult, TokenBalance } from "@/lib/balances/types";
import { formatTokenAmount, formatUsd, shortenAddress } from "@/lib/format";
import { easeOut, fadeIn, fadeUp, floatY, staggerContainer } from "@/lib/motion";
import { labelForScope } from "@/lib/multichain/scopes";
import { AddWalletsMenu } from "./AddWalletsMenu";
import { AnimatedUsd } from "./AnimatedUsd";
import { MonadMark } from "./MonadMark";
import { MonadTipGate } from "./MonadTipGate";
import { ScanTape } from "./ScanTape";
import { TokenIcon } from "./TokenIcon";
import { WalletHub } from "./WalletHub";
import {
  firstUnlockedAmong,
  isWalletTipUnlocked,
  markWalletTipUnlocked,
  storedUnlockAddresses,
} from "@/lib/monad/unlock";
import { MONAD_TIP_AMOUNT } from "@/lib/monad/config";
import { isTestnetToken } from "@/lib/balances/testnets";
import { zeroFakeTokenValue } from "@/lib/balances/fake-assets";

type Group = {
  chainSlug: string;
  chainName: string;
  tokens: Array<TokenBalance & { walletCount?: number }>;
  valueUsd: number;
};

type ViewMode = "combined" | "wallet";

const INITIAL_VISIBLE = 10;
const BATCH_SIZE = 5;
const BATCH_GAP_MS = 500;
/** After roster quick scan, deepen the richest / incomplete wallets. */
const ENRICH_TOP = 25;
const ADDR_PREVIEW = 8;

function CompactAddrGroup({
  label,
  addresses,
}: {
  label: string;
  addresses: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (addresses.length === 0) return null;
  const extra = addresses.length > ADDR_PREVIEW;
  const shown =
    expanded || !extra ? addresses : addresses.slice(0, ADDR_PREVIEW);
  return (
    <div className="discovered-addr-group">
      <p className="discovered-addr-label">
        {label} · {addresses.length}
      </p>
      <ul className="discovered-addr-grid">
        {shown.map((addr) => (
          <li key={addr}>
            <code title={addr}>{shortenAddress(addr)}</code>
          </li>
        ))}
      </ul>
      {extra ? (
        <button
          type="button"
          className="linkish"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `Show all ${addresses.length}`}
        </button>
      ) : null}
    </div>
  );
}

type BatchResponse = {
  results: Array<{
    address: string;
    ok: boolean;
    portfolio?: PortfolioResult;
    error?: string;
  }>;
};

export function PortfolioScanner() {
  const {
    accounts,
    roster,
    solanaRoster,
    enabledEvm,
    enabledSolana,
    scanSolana,
    scanRobinhood,
    scanBitcoin,
    scanTron,
    scanSui,
    walletKind,
    isConnected,
    evmOnly,
    rediscoverNetworks,
    isPending,
  } = useMultichainWallet();
  const walletLabel =
    walletKind === "phantom"
      ? "Phantom"
      : walletKind === "metamask"
        ? "MetaMask"
        : "wallet";
  const reduceMotion = useReducedMotion();

  const tipCandidates = [
    ...storedUnlockAddresses(),
    ...roster
      .filter((w) => w.source === "metamask" || w.source === "appkit")
      .map((w) => w.address),
    ...accounts.evm,
    ...enabledEvm,
    ...roster.map((w) => w.address),
  ];
  const tipPayer =
    firstUnlockedAmong(tipCandidates) ||
    roster.find(
      (w) =>
        w.enabled && (w.source === "metamask" || w.source === "appkit"),
    )?.address ||
    accounts.evm[0] ||
    enabledEvm[0] ||
    roster.find((w) => w.enabled)?.address ||
    null;

  const [tipUnlocked, setTipUnlocked] = useState(false);

  useEffect(() => {
    if (!tipPayer) {
      setTipUnlocked(false);
      return;
    }
    if (isWalletTipUnlocked(tipPayer)) {
      setTipUnlocked(true);
      return;
    }
    setTipUnlocked(false);
    let cancelled = false;
    void fetch(`/api/monad/tip/verify?address=${encodeURIComponent(tipPayer)}`)
      .then((res) => res.json())
      .then((data: { unlocked?: boolean }) => {
        if (cancelled || !data.unlocked) return;
        markWalletTipUnlocked(tipPayer, "onchain");
        setTipUnlocked(true);
      })
      .catch(() => {
        /* localStorage miss and RPC miss stay locked */
      });
    return () => {
      cancelled = true;
    };
  }, [tipPayer, isConnected]);

  const [slices, setSlices] = useState<WalletSlice[]>([]);
  const [multi, setMulti] = useState<MultiPortfolio | null>(null);
  const [solanaTokens, setSolanaTokens] = useState<TokenBalance[]>([]);
  const [robinhoodTokens, setRobinhoodTokens] = useState<TokenBalance[]>([]);
  const [bitcoinTokens, setBitcoinTokens] = useState<TokenBalance[]>([]);
  const [tronTokens, setTronTokens] = useState<TokenBalance[]>([]);
  const [suiTokens, setSuiTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hideDust, setHideDust] = useState(true);
  const [query, setQuery] = useState("");
  const [deepScanning, setDeepScanning] = useState(false);
  const [activeChain, setActiveChain] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [solanaScanning, setSolanaScanning] = useState(false);
  const [rhScanning, setRhScanning] = useState(false);
  const [btcScanning, setBtcScanning] = useState(false);
  const [tronScanning, setTronScanning] = useState(false);
  const [suiScanning, setSuiScanning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("combined");
  const [activeWallet, setActiveWallet] = useState<string | "all">("all");
  const [scanProgress, setScanProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const scanEpoch = useRef(0);

  const rebuildMulti = useCallback(
    (
      nextSlices: WalletSlice[],
      extraTokens: TokenBalance[],
      warnings: string[],
    ) => {
      const base = buildMultiPortfolio(nextSlices, warnings);
      if (extraTokens.length === 0) {
        setMulti(base);
        return;
      }
      // Fold Solana / Robinhood into combined totals (not a single EVM wallet row).
      const byKey = new Map(
        base.combinedTokens.map((t) => [
          `${t.chainSlug}:${(t.tokenAddress || "native").toLowerCase()}`,
          t as CombinedToken,
        ]),
      );
      for (const t of extraTokens) {
        if (isTestnetToken(t)) continue;
        const honest = zeroFakeTokenValue(t);
        const key = `${honest.chainSlug}:${(honest.tokenAddress || "native").toLowerCase()}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, {
            ...honest,
            walletCount: 1,
            wallets: ["extra"],
          });
          continue;
        }
        existing.balance += honest.balance;
        existing.valueUsd =
          existing.valueUsd == null && honest.valueUsd == null
            ? null
            : (existing.valueUsd ?? 0) + (honest.valueUsd ?? 0);
        existing.walletCount += 1;
      }
      const combinedTokens = [...byKey.values()].sort(
        (a, b) =>
          (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || b.balance - a.balance,
      );
      const extraUsd = extraTokens
        .filter((t) => !isTestnetToken(t))
        .map(zeroFakeTokenValue)
        .reduce((s, t) => s + (t.valueUsd ?? 0), 0);
      const chains = new Set(combinedTokens.map((t) => t.chainSlug));
      setMulti({
        ...base,
        combinedTokens,
        totalValueUsd: base.totalValueUsd + extraUsd,
        tokenCount: combinedTokens.length,
        chainCount: chains.size,
      });
    },
    [],
  );

  const scanSolanaOnly = useCallback(async (epoch: number) => {
    if (scanSolana.length === 0) {
      setSolanaTokens([]);
      return [];
    }
    setSolanaScanning(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solana: scanSolana, mode: "indexed" }),
      });
      const data = (await res.json()) as PortfolioResult & { error?: string };
      if (epoch !== scanEpoch.current) return [];
      if (!res.ok) throw new Error(data.error || "Solana scan failed");
      const tokens = data.tokens.filter((t) => t.chainSlug === "solana");
      setSolanaTokens(tokens);
      return tokens;
    } catch {
      if (epoch === scanEpoch.current) setSolanaTokens([]);
      return [];
    } finally {
      if (epoch === scanEpoch.current) setSolanaScanning(false);
    }
  }, [scanSolana]);

  const scanRobinhoodOnly = useCallback(async (epoch: number) => {
    if (scanRobinhood.length === 0) {
      setRobinhoodTokens([]);
      return [];
    }
    setRhScanning(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robinhood: scanRobinhood,
          mode: "indexed",
        }),
      });
      const data = (await res.json()) as PortfolioResult & { error?: string };
      if (epoch !== scanEpoch.current) return [];
      if (!res.ok) throw new Error(data.error || "Robinhood scan failed");
      const tokens = data.tokens.filter((t) => t.chainSlug === "robinhood");
      setRobinhoodTokens(tokens);
      return tokens;
    } catch {
      if (epoch === scanEpoch.current) setRobinhoodTokens([]);
      return [];
    } finally {
      if (epoch === scanEpoch.current) setRhScanning(false);
    }
  }, [scanRobinhood]);

  const scanBitcoinOnly = useCallback(async (epoch: number) => {
    if (scanBitcoin.length === 0) {
      setBitcoinTokens([]);
      return [];
    }
    setBtcScanning(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitcoin: scanBitcoin, mode: "indexed" }),
      });
      const data = (await res.json()) as PortfolioResult & { error?: string };
      if (epoch !== scanEpoch.current) return [];
      if (!res.ok) throw new Error(data.error || "Bitcoin scan failed");
      const tokens = data.tokens.filter((t) => t.chainSlug === "bitcoin");
      setBitcoinTokens(tokens);
      return tokens;
    } catch {
      if (epoch === scanEpoch.current) setBitcoinTokens([]);
      return [];
    } finally {
      if (epoch === scanEpoch.current) setBtcScanning(false);
    }
  }, [scanBitcoin]);

  const scanTronOnly = useCallback(async (epoch: number) => {
    if (scanTron.length === 0) {
      setTronTokens([]);
      return [];
    }
    setTronScanning(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tron: scanTron, mode: "indexed" }),
      });
      const data = (await res.json()) as PortfolioResult & { error?: string };
      if (epoch !== scanEpoch.current) return [];
      if (!res.ok) throw new Error(data.error || "Tron scan failed");
      const tokens = data.tokens.filter((t) => t.chainSlug === "tron");
      setTronTokens(tokens);
      return tokens;
    } catch {
      if (epoch === scanEpoch.current) setTronTokens([]);
      return [];
    } finally {
      if (epoch === scanEpoch.current) setTronScanning(false);
    }
  }, [scanTron]);

  const scanSuiOnly = useCallback(async (epoch: number) => {
    if (scanSui.length === 0) {
      setSuiTokens([]);
      return [];
    }
    setSuiScanning(true);
    try {
      const res = await fetch("/api/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sui: scanSui, mode: "indexed" }),
      });
      const data = (await res.json()) as PortfolioResult & { error?: string };
      if (epoch !== scanEpoch.current) return [];
      if (!res.ok) throw new Error(data.error || "Sui scan failed");
      const tokens = data.tokens.filter((t) => t.chainSlug === "sui");
      setSuiTokens(tokens);
      return tokens;
    } catch {
      if (epoch === scanEpoch.current) setSuiTokens([]);
      return [];
    } finally {
      if (epoch === scanEpoch.current) setSuiScanning(false);
    }
  }, [scanSui]);

  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const solRosterRef = useRef(solanaRoster);
  solRosterRef.current = solanaRoster;
  const enabledRef = useRef(enabledEvm);
  enabledRef.current = enabledEvm;
  const enabledSolRef = useRef(enabledSolana);
  enabledSolRef.current = enabledSolana;
  const solRef = useRef(scanSolana);
  solRef.current = scanSolana;
  const rhRef = useRef(scanRobinhood);
  rhRef.current = scanRobinhood;
  const btcRef = useRef(scanBitcoin);
  btcRef.current = scanBitcoin;
  const tronRef = useRef(scanTron);
  tronRef.current = scanTron;
  const suiRef = useRef(scanSui);
  suiRef.current = scanSui;

  const scan = useCallback(async () => {
    const epoch = ++scanEpoch.current;
    // Snapshot so mid-scan roster edits don't abort the whole run.
    const wallets = [...enabledRef.current];
    const solanaAddrs = [...enabledSolRef.current];
    // Linked Solana not already in the Solana roster (MetaMask fallback).
    const solanaExtra = solRef.current.filter((a) => !solanaAddrs.includes(a));
    const robinhoodAddrs = [...rhRef.current];
    const bitcoinAddrs = [...btcRef.current];
    const tronAddrs = [...tronRef.current];
    const suiAddrs = [...suiRef.current];
    setLoading(true);
    setError(null);
    setDeepScanning(false);
    setActiveChain("all");

    if (
      wallets.length === 0 &&
      solanaAddrs.length === 0 &&
      solanaExtra.length === 0 &&
      robinhoodAddrs.length === 0 &&
      bitcoinAddrs.length === 0 &&
      tronAddrs.length === 0 &&
      suiAddrs.length === 0
    ) {
      setSlices([]);
      setMulti(null);
      setLoading(false);
      setScanProgress(null);
      return;
    }

    const labelFor = (addr: string) =>
      rosterRef.current.find((r) => r.address === addr)?.label ||
      solRosterRef.current.find((r) => r.address === addr)?.label ||
      shortenAddress(addr);

    const initial: WalletSlice[] = [
      ...wallets.map((address) => ({
        address,
        label: labelFor(address),
        status: "pending" as const,
        totalValueUsd: 0,
        tokenCount: 0,
        chainCount: 0,
        tokens: [],
      })),
      ...solanaAddrs.map((address) => ({
        address,
        label: labelFor(address),
        status: "pending" as const,
        totalValueUsd: 0,
        tokenCount: 0,
        chainCount: 0,
        tokens: [],
      })),
    ];
    setSlices(initial);
    const totalJobs = wallets.length + solanaAddrs.length;
    setScanProgress({ done: 0, total: totalJobs });

    let solToks: TokenBalance[] = [];
    let rhToks: TokenBalance[] = [];
    let btcToks: TokenBalance[] = [];
    let tronToks: TokenBalance[] = [];
    let suiToks: TokenBalance[] = [];
    const extras = () =>
      [...solToks, ...rhToks, ...btcToks, ...tronToks, ...suiToks].filter(
        (t) => !isTestnetToken(t),
      );
    const firstMode = wallets.length <= 4 ? "indexed" : "quick";

    const bumpExtras = (note: string) => {
      setSlices((prev) => {
        rebuildMulti(prev, extras(), [note]);
        return prev;
      });
    };

    // Solana addresses outside the roster (rare) still fold into combined.
    if (solanaExtra.length > 0) {
      void scanSolanaOnly(epoch).then((tokens) => {
        if (epoch !== scanEpoch.current) return;
        // Only keep tokens for addresses not in the Solana roster slices.
        solToks = tokens;
        bumpExtras(`Scanning linked Solana address(es).`);
      });
    } else {
      setSolanaTokens([]);
    }
    void scanRobinhoodOnly(epoch).then((tokens) => {
      if (epoch !== scanEpoch.current) return;
      rhToks = tokens;
      bumpExtras(
        `Scanning ${wallets.length} EVM + ${solanaAddrs.length} Solana wallet(s).`,
      );
    });
    void scanBitcoinOnly(epoch).then((tokens) => {
      if (epoch !== scanEpoch.current) return;
      btcToks = tokens;
      bumpExtras(`Bitcoin addresses from ${walletLabel} session scanned.`);
    });
    void scanTronOnly(epoch).then((tokens) => {
      if (epoch !== scanEpoch.current) return;
      tronToks = tokens;
      bumpExtras(`Tron addresses from ${walletLabel} session scanned.`);
    });
    void scanSuiOnly(epoch).then((tokens) => {
      if (epoch !== scanEpoch.current) return;
      suiToks = tokens;
      bumpExtras(`Sui addresses from ${walletLabel} session scanned.`);
    });

    try {
      const nextSlices = [...initial];
      let done = 0;

      for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
        if (epoch !== scanEpoch.current) return;
        const batch = wallets.slice(i, i + BATCH_SIZE);
        setSlices((prev) =>
          prev.map((s) =>
            batch.includes(s.address) ? { ...s, status: "scanning" } : s,
          ),
        );

        const res = await fetch("/api/balances/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Same 0x on Robinhood is automatic — no separate connect/paste.
          body: JSON.stringify({
            evm: batch,
            robinhood: batch,
            mode: firstMode,
          }),
        });
        const data = (await res.json()) as BatchResponse & { error?: string };
        if (epoch !== scanEpoch.current) return;
        if (!res.ok) throw new Error(data.error || "Batch scan failed");

        for (const row of data.results) {
          const idx = nextSlices.findIndex((s) => s.address === row.address);
          if (idx < 0) continue;
          nextSlices[idx] = portfolioToSlice(
            row.address,
            labelFor(row.address),
            row.ok ? row.portfolio ?? null : null,
            row.ok ? undefined : row.error,
          );
        }
        done += batch.length;
        setSlices([...nextSlices]);
        setScanProgress({ done, total: totalJobs });
        const errCount = nextSlices.filter((s) => s.status === "error").length;
        rebuildMulti(nextSlices, extras(), [
          `Scanned ${done}/${totalJobs} wallets (EVM ${firstMode} pass).`,
          ...(errCount
            ? [`${errCount} wallet(s) failed indexer — showing as error, not empty.`]
            : []),
        ]);
        if (done > 0) setLoading(false);
        if (i + BATCH_SIZE < wallets.length) {
          await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
        }
      }

      // Solana roster (Phantom multi-wallet) — full SPL + Token-2022 metadata.
      for (let i = 0; i < solanaAddrs.length; i += BATCH_SIZE) {
        if (epoch !== scanEpoch.current) return;
        const batch = solanaAddrs.slice(i, i + BATCH_SIZE);
        setSlices((prev) =>
          prev.map((s) =>
            batch.includes(s.address) ? { ...s, status: "scanning" } : s,
          ),
        );
        const res = await fetch("/api/balances/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ solana: batch, mode: "indexed" }),
        });
        const data = (await res.json()) as BatchResponse & { error?: string };
        if (epoch !== scanEpoch.current) return;
        if (!res.ok) throw new Error(data.error || "Solana batch failed");
        for (const row of data.results) {
          const idx = nextSlices.findIndex((s) => s.address === row.address);
          if (idx < 0) continue;
          nextSlices[idx] = portfolioToSlice(
            row.address,
            labelFor(row.address),
            row.ok ? row.portfolio ?? null : null,
            row.ok ? undefined : row.error,
          );
        }
        done += batch.length;
        setSlices([...nextSlices]);
        setScanProgress({ done, total: totalJobs });
        rebuildMulti(nextSlices, extras(), [
          `Scanned ${done}/${totalJobs} wallets (includes Solana SPL / Token-2022).`,
        ]);
        if (done > 0) setLoading(false);
        if (i + BATCH_SIZE < solanaAddrs.length) {
          await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
        }
      }

      if (epoch !== scanEpoch.current) return;

      // Phase 2: deepen top EVM wallets that only got the quick pass.
      if (firstMode === "quick") {
        const evmSet = new Set(wallets);
        const enrichTargets = [
          ...nextSlices
            .filter(
              (s) =>
                evmSet.has(s.address) &&
                (s.status === "error" ||
                  (s.provider || "").includes("native-rpc")),
            )
            .map((s) => s.address),
          ...nextSlices
            .filter((s) => evmSet.has(s.address) && s.status === "done")
            .slice()
            .sort((a, b) => b.totalValueUsd - a.totalValueUsd)
            .slice(0, ENRICH_TOP)
            .map((s) => s.address),
        ];
        const uniqueEnrich = [...new Set(enrichTargets)].slice(
          0,
          ENRICH_TOP + 10,
        );

        if (uniqueEnrich.length > 0) {
          setScanProgress({ done: 0, total: uniqueEnrich.length });
          rebuildMulti(nextSlices, extras(), [
            `Deepening ${uniqueEnrich.length} wallet(s) for missing tokens/chains…`,
          ]);
          let enrichDone = 0;
          for (let i = 0; i < uniqueEnrich.length; i += BATCH_SIZE) {
            if (epoch !== scanEpoch.current) return;
            const batch = uniqueEnrich.slice(i, i + BATCH_SIZE);
            setSlices((prev) =>
              prev.map((s) =>
                batch.includes(s.address) ? { ...s, status: "scanning" } : s,
              ),
            );
            const res = await fetch("/api/balances/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                evm: batch,
                robinhood: batch,
                mode: "indexed",
              }),
            });
            const data = (await res.json()) as BatchResponse & {
              error?: string;
            };
            if (epoch !== scanEpoch.current) return;
            if (res.ok) {
              for (const row of data.results) {
                const idx = nextSlices.findIndex(
                  (s) => s.address === row.address,
                );
                if (idx < 0) continue;
                const prev = nextSlices[idx]!;
                const next = portfolioToSlice(
                  row.address,
                  labelFor(row.address),
                  row.ok ? row.portfolio ?? null : null,
                  row.ok ? undefined : row.error,
                );
                if (
                  row.ok &&
                  (next.totalValueUsd > prev.totalValueUsd ||
                    next.tokenCount > prev.tokenCount ||
                    prev.status === "error" ||
                    (prev.provider || "").includes("native-rpc"))
                ) {
                  nextSlices[idx] = next;
                } else if (prev.status === "scanning") {
                  nextSlices[idx] = { ...prev, status: "done" };
                }
              }
            }
            enrichDone += batch.length;
            setSlices([...nextSlices]);
            setScanProgress({ done: enrichDone, total: uniqueEnrich.length });
            rebuildMulti(nextSlices, extras(), [
              `Deepened ${enrichDone}/${uniqueEnrich.length} high-value wallets.`,
            ]);
            if (i + BATCH_SIZE < uniqueEnrich.length) {
              await new Promise((r) => setTimeout(r, BATCH_GAP_MS));
            }
          }
        }
      }

      if (epoch !== scanEpoch.current) return;

      // One EVM wallet → also sweep 2,000+ mainnet natives (testnets excluded).
      if (wallets.length === 1) {
        const only = wallets[0]!;
        setDeepScanning(true);
        rebuildMulti(nextSlices, extras(), [
          "Sweeping 2,000+ mainnet EVM natives — testnets are excluded.",
        ]);
        const res = await fetch("/api/balances/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evm: [only], mode: "full" }),
        });
        const data = (await res.json()) as BatchResponse & { error?: string };
        if (epoch !== scanEpoch.current) return;
        if (res.ok && data.results[0]?.ok) {
          const idx = nextSlices.findIndex((s) => s.address === only);
          if (idx >= 0) {
            const prev = nextSlices[idx]!;
            const next = portfolioToSlice(
              only,
              labelFor(only),
              data.results[0].portfolio ?? null,
            );
            if (
              next.totalValueUsd > prev.totalValueUsd ||
              next.tokenCount > prev.tokenCount
            ) {
              nextSlices[idx] = next;
              setSlices([...nextSlices]);
            }
          }
        }
        setDeepScanning(false);
      }

      if (epoch !== scanEpoch.current) return;
      const fallbackN = nextSlices.filter(
        (s) =>
          (s.provider || "").includes("native-rpc") &&
          !(s.provider || "").includes("known-erc20"),
      ).length;
      const errN = nextSlices.filter((s) => s.status === "error").length;
      rebuildMulti(nextSlices, extras(), [
        `Finished ${wallets.length} wallet(s) on mainnets only (testnets hidden). ${walletLabel} totals can still be higher if Solana/Bitcoin were not approved on Connect.`,
        ...(fallbackN
          ? [`${fallbackN} wallet(s) used native-only fallback (ERC-20s may be missing).`]
          : []),
        ...(errN ? [`${errN} wallet(s) still failed the indexer.`] : []),
        ...(solanaAddrs.length === 0
          ? [`Solana not in ${walletLabel} session — reconnect and approve Solana. MetaMask’s SOL is a separate address from this 0x.`]
          : []),
        ...(bitcoinAddrs.length === 0
          ? [`Bitcoin not in ${walletLabel} session yet — approve Bitcoin on Connect if offered.`]
          : []),
        ...(suiAddrs.length === 0 && walletKind === "phantom"
          ? [
              "Sui is not in this session yet — reconnect and approve Sui if the wallet offers it.",
            ]
          : []),
      ]);
      setLoading(false);
      setScanProgress(null);
    } catch (err) {
      if (epoch !== scanEpoch.current) return;
      setError(err instanceof Error ? err.message : "Scan failed");
      setLoading(false);
      setDeepScanning(false);
      setScanProgress(null);
    }
  }, [
    scanSolanaOnly,
    scanRobinhoodOnly,
    scanBitcoinOnly,
    scanTronOnly,
    scanSuiOnly,
    rebuildMulti,
    accounts.source,
    walletLabel,
    walletKind,
  ]);

  const rosterKey = enabledEvm.join("|");
  const solRosterKey = enabledSolana.join("|");
  const solKey = scanSolana.join("|");
  const rhKey = scanRobinhood.join("|");
  const btcKey = scanBitcoin.join("|");
  const tronKey = scanTron.join("|");
  const suiKey = scanSui.join("|");

  useEffect(() => {
    if (!isConnected) {
      scanEpoch.current += 1;
      setSlices([]);
      setMulti(null);
      setSolanaTokens([]);
      setRobinhoodTokens([]);
      setBitcoinTokens([]);
      setTronTokens([]);
      setSuiTokens([]);
      setError(null);
      setDeepScanning(false);
      setScanProgress(null);
      return;
    }
    if (
      !rosterKey &&
      !solRosterKey &&
      !solKey &&
      !rhKey &&
      !btcKey &&
      !tronKey &&
      !suiKey
    ) {
      return;
    }
    // Debounce so Enable-all / wallet merges don't abort mid-sweep repeatedly.
    const timer = setTimeout(() => {
      void scan();
    }, 450);
    return () => clearTimeout(timer);
    // Intentionally only re-run when enabled / non-EVM address sets change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isConnected,
    rosterKey,
    solRosterKey,
    solKey,
    rhKey,
    btcKey,
    tronKey,
    suiKey,
  ]);

  const deepScanWallet = useCallback(async () => {
    if (activeWallet === "all" || viewMode !== "wallet") return;
    const epoch = scanEpoch.current;
    setDeepScanning(true);
    try {
      const res = await fetch("/api/balances/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evm: [activeWallet], mode: "full" }),
      });
      const data = (await res.json()) as BatchResponse & { error?: string };
      if (epoch !== scanEpoch.current) return;
      if (!res.ok) throw new Error(data.error || "Deep scan failed");
      const row = data.results[0];
      if (!row) return;
      setSlices((prev) => {
        const next = prev.map((s) =>
          s.address === activeWallet
            ? portfolioToSlice(
                activeWallet,
                s.label,
                row.ok ? row.portfolio ?? null : null,
                row.ok ? undefined : row.error,
              )
            : s,
        );
        rebuildMulti(
          next,
          [
            ...solanaTokens,
            ...robinhoodTokens,
            ...bitcoinTokens,
            ...tronTokens,
            ...suiTokens,
          ],
          ["Deep scan finished for selected wallet (Chainlist natives)."],
        );
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deep scan failed");
    } finally {
      if (epoch === scanEpoch.current) setDeepScanning(false);
    }
  }, [
    activeWallet,
    viewMode,
    bitcoinTokens,
    tronTokens,
    suiTokens,
    solanaTokens,
    robinhoodTokens,
    rebuildMulti,
  ]);

  const displayTokens = useMemo(() => {
    if (!multi) return [] as Array<TokenBalance & { walletCount?: number }>;
    const source =
      viewMode === "wallet" && activeWallet !== "all"
        ? ((slices.find((s) => s.address === activeWallet)?.tokens ??
            []) as Array<TokenBalance & { walletCount?: number }>)
        : multi.combinedTokens;
    return source
      .filter((t) => !isTestnetToken(t))
      .map(zeroFakeTokenValue);
  }, [multi, viewMode, activeWallet, slices]);

  const displayTotals = useMemo(() => {
    if (!multi) return { value: 0, tokens: 0, chains: 0 };
    const value = displayTokens.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0);
    const chains = new Set(displayTokens.map((t) => t.chainSlug)).size;
    return {
      value,
      tokens: displayTokens.length,
      chains,
    };
  }, [multi, displayTokens]);

  const filteredTokens = useMemo(() => {
    const q = query.trim().toLowerCase();
    return displayTokens.filter((t) => {
      // Keep unpriced balances visible; only hide priced dust.
      if (
        hideDust &&
        t.valueUsd != null &&
        Number.isFinite(t.valueUsd) &&
        t.valueUsd > 0 &&
        t.valueUsd < 0.01
      ) {
        return false;
      }
      if (activeChain !== "all" && t.chainSlug !== activeChain) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.chainName.toLowerCase().includes(q) ||
        (t.tokenAddress?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [displayTokens, hideDust, query, activeChain]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const token of filteredTokens) {
      const existing = map.get(token.chainSlug);
      if (existing) {
        existing.tokens.push(token);
        existing.valueUsd += token.valueUsd ?? 0;
      } else {
        map.set(token.chainSlug, {
          chainSlug: token.chainSlug,
          chainName: token.chainName,
          tokens: [token],
          valueUsd: token.valueUsd ?? 0,
        });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        b.valueUsd - a.valueUsd || b.tokens.length - a.tokens.length,
    );
  }, [filteredTokens]);

  const chainTabs = useMemo(() => {
    const map = new Map<
      string,
      { name: string; count: number; value: number }
    >();
    for (const t of displayTokens) {
      if (
        hideDust &&
        t.valueUsd != null &&
        Number.isFinite(t.valueUsd) &&
        t.valueUsd > 0 &&
        t.valueUsd < 0.01
      ) {
        continue;
      }
      const cur = map.get(t.chainSlug) ?? {
        name: t.chainName,
        count: 0,
        value: 0,
      };
      cur.count += 1;
      cur.value += t.valueUsd ?? 0;
      map.set(t.chainSlug, cur);
    }
    return [...map.entries()]
      .map(([slug, v]) => ({ slug, ...v }))
      .sort((a, b) => b.value - a.value || b.count - a.count);
  }, [displayTokens, hideDust]);

  if (!isConnected) return null;

  const scanning =
    loading ||
    deepScanning ||
    solanaScanning ||
    rhScanning ||
    btcScanning ||
    tronScanning ||
    suiScanning ||
    slices.some((s) => s.status === "scanning");

  const headline =
    viewMode === "wallet" && activeWallet !== "all"
      ? activeWallet
      : enabledEvm.length > 1
        ? `${enabledEvm.length} of ${roster.length} wallets`
        : shortenAddress(
            enabledEvm[0] ||
              accounts.evm[0] ||
              scanSolana[0] ||
              "",
          );

  const discoveredAddrCount =
    enabledEvm.length +
    new Set([...enabledSolana, ...scanSolana]).size +
    scanBitcoin.length +
    scanTron.length +
    scanSui.length;

  return (
    <motion.div
      className="portfolio-home"
      id="portfolio"
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeOut}
    >
      <ScanTape active={scanning} />
      <section className="hero-panel portfolio-hero">
        <div className="hero-waves" aria-hidden />
        <div className="hero-copy">
          <p className="brand-hero">Your hidden money.</p>
          <p className="monad-chip">
            <MonadMark size={22} />
            Built on Monad
          </p>
          <h1 className="headline">{headline}</h1>
          <p className="lede">
            Read-only scan of every network this wallet still exposes. Totals
            stay free. Token names unlock with a MON tip.
          </p>
          <div className="eco-row">
            {enabledEvm.length ? (
              <span className="eco-chip">{enabledEvm.length} EVM</span>
            ) : null}
            {scanSolana.length ? <span className="eco-chip">Solana</span> : null}
            {scanRobinhood.length ? (
              <span className="eco-chip">Robinhood</span>
            ) : null}
            {scanBitcoin.length ? (
              <span className="eco-chip">Bitcoin</span>
            ) : null}
            {scanSui.length ? <span className="eco-chip">Sui</span> : null}
            {scanTron.length ? <span className="eco-chip">Tron</span> : null}
            {viewMode === "combined" ? (
              <span className="eco-chip">Combined</span>
            ) : (
              <span className="eco-chip eco-chip-warn">Per wallet</span>
            )}
          </div>
          <div className="hero-cta">
            <motion.button
              type="button"
              className={tipUnlocked ? "btn-ghost" : "btn-primary"}
              onClick={() =>
                document
                  .getElementById("tip-gate")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            >
              {tipUnlocked
                ? "Tip receipt"
                : `Tip ${MONAD_TIP_AMOUNT} MON`}
            </motion.button>
            <motion.button
              type="button"
              className={tipUnlocked ? "btn-primary" : "btn-ghost"}
              onClick={() => void scan()}
              disabled={loading || deepScanning}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            >
              {loading ? "Scanning…" : "Rescan all"}
            </motion.button>
            {viewMode === "wallet" && activeWallet !== "all" ? (
              <motion.button
                type="button"
                className="btn-ghost"
                onClick={() => void deepScanWallet()}
                disabled={loading || deepScanning}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              >
                {deepScanning ? "Deep scan…" : "Deep scan wallet"}
              </motion.button>
            ) : null}
            <AddWalletsMenu buttonClassName="btn-ghost" />
          </div>
        </div>
        <div className="hero-mascot-wrap">
          <motion.div animate={reduceMotion ? undefined : floatY}>
            <Image
              src="/rain/homepage/banner/bannerright.png"
              alt=""
              width={1177}
              height={1031}
              className="hero-mascot"
              priority
            />
          </motion.div>
        </div>
      </section>

      <div className="coverage-band">
        <section className="stat-grid" aria-label="Portfolio stats">
          <article className="stat-card accent-lime">
            <h2>Combined</h2>
            <p>{formatUsd(displayTotals.value)}</p>
          </article>
          <article className="stat-card accent-purple">
            <h2>Scanned</h2>
            <p>
              {multi?.insights
                ? `${multi.insights.scannedCount}/${enabledEvm.length + enabledSolana.length}`
                : loading
                  ? "…"
                  : "—"}
            </p>
          </article>
          <article className="stat-card accent-cyan">
            <h2>In roster</h2>
            <p>
              {solanaRoster.length > 0
                ? `${solanaRoster.length} SOL · ${roster.length} EVM`
                : `${roster.length || 0} EVM`}
            </p>
          </article>
          <article className="stat-card accent-vermilion">
            <h2>Empty</h2>
            <p>
              {multi?.insights ? String(multi.insights.emptyCount) : "—"}
            </p>
          </article>
          <article className="stat-card accent-mint">
            <h2>Top wallet</h2>
            <p>
              {multi?.insights
                ? `${Math.round(multi.insights.topWalletShare * 100)}%`
                : "—"}
            </p>
          </article>
        </section>
      </div>

      <section className="scan-section">

      {isConnected ? (
        <MonadTipGate
          payerAddress={tipPayer}
          unlocked={tipUnlocked}
          onUnlocked={() => setTipUnlocked(true)}
        />
      ) : null}

      <WalletHub
        viewMode={viewMode}
        onViewMode={setViewMode}
        activeWallet={activeWallet}
        onActiveWallet={setActiveWallet}
        slices={
          tipUnlocked
            ? slices
            : slices.map((s) => ({
                ...s,
                // Keep USD totals visible; hide token inventory.
                tokenCount: 0,
                tokens: [],
              }))
        }
        insights={tipUnlocked ? (multi?.insights ?? null) : null}
        totalValueUsd={displayTotals.value}
        scanProgress={scanProgress}
        scanning={loading}
        hideInsights
      />

      {Object.keys(accounts.byScope).length > 0 ||
      accounts.all.length > 0 ? (
        <details className="extra-chain-panel">
          <summary className="extra-chain-title">
            Network addresses ({accounts.all.length})
          </summary>
          <p className="extra-chain-copy">
            Each network can use a different address format — Solana, Bitcoin,
            and Sui are never the same as your Ethereum 0x. EVM nets (Ethereum,
            Base, Polygon, Monad, Robinhood, HyperEVM) share one 0x.
          </p>
          {Object.entries(accounts.byScope).map(([scope, addrs]) => (
            <CompactAddrGroup
              key={scope}
              label={labelForScope(scope)}
              addresses={addrs}
            />
          ))}
        </details>
      ) : null}

      <div className="extra-chain-panel">
        <p className="extra-chain-title">
          Auto-discovered networks
          {solanaScanning ||
          rhScanning ||
          btcScanning ||
          tronScanning ||
          suiScanning
            ? " · scanning…"
            : ""}
        </p>
        <p className="extra-chain-copy">
          Addresses come from the connected wallet automatically — EVM, Solana,
          Bitcoin, Tron, Sui, and Robinhood. Approve every network the wallet
          offers when you connect.
        </p>
        <div className="eco-row" style={{ marginTop: "0.75rem" }}>
          <span
            className={
              enabledEvm.length ? "eco-chip" : "eco-chip eco-chip-warn"
            }
          >
            {enabledEvm.length} EVM
          </span>
          <span
            className={
              enabledSolana.length || scanSolana.length
                ? "eco-chip"
                : "eco-chip eco-chip-warn"
            }
          >
            Solana{" "}
            {enabledSolana.length
              ? `· ${enabledSolana.length} wallet${enabledSolana.length === 1 ? "" : "s"}`
              : scanSolana.length
                ? "· on"
                : "· waiting"}
          </span>
          <span className="eco-chip">
            Robinhood · auto
            {scanRobinhood.length
              ? ` +${scanRobinhood.length} distinct`
              : ""}
          </span>
          <span
            className={
              scanBitcoin.length ? "eco-chip" : "eco-chip eco-chip-warn"
            }
          >
            Bitcoin {scanBitcoin.length ? "· on" : "· waiting"}
          </span>
          <span
            className={
              scanSui.length ? "eco-chip" : "eco-chip eco-chip-warn"
            }
          >
            Sui {scanSui.length ? "· on" : "· waiting"}
          </span>
        </div>
        {discoveredAddrCount > 0 ? (
          <details className="discovered-addrs">
            <summary>
              View {discoveredAddrCount} address
              {discoveredAddrCount === 1 ? "" : "es"}
            </summary>
            <CompactAddrGroup label="EVM" addresses={enabledEvm} />
            <CompactAddrGroup
              label="Solana"
              addresses={[...new Set([...enabledSolana, ...scanSolana])]}
            />
            <CompactAddrGroup label="Bitcoin" addresses={scanBitcoin} />
            <CompactAddrGroup label="Tron" addresses={scanTron} />
            <CompactAddrGroup label="Sui" addresses={scanSui} />
          </details>
        ) : null}
        {(scanSolana.length === 0 ||
          scanBitcoin.length === 0 ||
          (walletKind === "phantom" && scanSui.length === 0)) && (
          <div className="extra-chain-form" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={isPending}
              onClick={() => void rediscoverNetworks()}
            >
              {isPending ? "Discovering…" : "Add networks"}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {loading && !multi ? (
          <motion.div
            key="loading"
            className="scan-loading"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="radar" aria-hidden />
            <div>
              <p className="scan-loading-title">Hunting balances</p>
              <p>
                {enabledEvm.length > 1
                  ? `Scanning ${enabledEvm.length} wallets in batches…`
                  : "Usually 10–30 seconds for indexed tokens."}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? <p className="error-text panel-error">{error}</p> : null}

      <AnimatePresence>
        {multi ? (
          <motion.div
            key="portfolio"
            className={
              tipUnlocked
                ? "portfolio-layout"
                : "portfolio-layout portfolio-locked"
            }
            variants={reduceMotion ? undefined : fadeIn}
            initial="hidden"
            animate="show"
          >
            <motion.aside
              className="portfolio-side"
              initial={reduceMotion ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={easeOut}
            >
              <div className="value-block">
                <p className="value-label">
                  {viewMode === "combined" ? "Combined value" : "Wallet value"}
                </p>
                <AnimatedUsd
                  className="value-figure"
                  value={displayTotals.value}
                />
                {!tipUnlocked ? (
                  <p className="value-hint">
                    Total is visible — tip {MONAD_TIP_AMOUNT} MON to see tokens
                    and chains.
                  </p>
                ) : null}
              </div>

              <dl className="stat-list">
                <div>
                  <dt>Assets</dt>
                  <dd>
                    {tipUnlocked ? displayTotals.tokens.toLocaleString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Networks</dt>
                  <dd>{tipUnlocked ? displayTotals.chains : "—"}</dd>
                </div>
                <div>
                  <dt>Wallets on</dt>
                  <dd>
                    {enabledEvm.length}
                    {roster.length !== enabledEvm.length
                      ? ` / ${roster.length}`
                      : ""}
                  </dd>
                </div>
              </dl>

              <AnimatePresence>
                {deepScanning ? (
                  <motion.p
                    className="deep-scan-bar"
                    role="status"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <span className="deep-pulse" aria-hidden />
                    Deep scan running…
                  </motion.p>
                ) : null}
              </AnimatePresence>

              {tipUnlocked && chainTabs.length > 0 ? (
                <LayoutGroup>
                  <nav className="side-nav" aria-label="Chains">
                    <p className="side-nav-label">Networks</p>
                    <button
                      type="button"
                      className={
                        activeChain === "all" ? "nav-item active" : "nav-item"
                      }
                      onClick={() => setActiveChain("all")}
                    >
                      {activeChain === "all" ? (
                        <motion.span
                          className="nav-active-bar"
                          layoutId="nav-active"
                          transition={easeOut}
                        />
                      ) : null}
                      <span className="nav-item-label">All networks</span>
                      <em>{displayTotals.tokens}</em>
                    </button>
                    {chainTabs.map((tab) => (
                      <button
                        key={tab.slug}
                        type="button"
                        className={
                          activeChain === tab.slug
                            ? "nav-item active"
                            : "nav-item"
                        }
                        onClick={() => setActiveChain(tab.slug)}
                      >
                        {activeChain === tab.slug ? (
                          <motion.span
                            className="nav-active-bar"
                            layoutId="nav-active"
                            transition={easeOut}
                          />
                        ) : null}
                        <span className="nav-item-label">{tab.name}</span>
                        <em>{tab.count}</em>
                      </button>
                    ))}
                  </nav>
                </LayoutGroup>
              ) : null}
            </motion.aside>

            <div className="portfolio-main">
              {!tipUnlocked ? (
                <div className="portfolio-locked-panel">
                  <MonadMark size={40} />
                  <p className="scan-loading-title">
                    Tokens &amp; chains are sealed
                  </p>
                  <p>
                    Your portfolio value is shown on the left. Tip{" "}
                    {MONAD_TIP_AMOUNT} MON on Monad to reveal which
                    tokens you hold and on which networks.
                  </p>
                </div>
              ) : (
                <>
              <div className="toolbar">
                <label className="search-field">
                  <span className="sr-only">Filter tokens</span>
                  <input
                    type="search"
                    placeholder="Search token, chain, contract…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={hideDust}
                    onChange={(e) => setHideDust(e.target.checked)}
                  />
                  Hide dust under $0.01
                </label>
              </div>

              {(() => {
                const fallbackN = slices.filter((s) =>
                  (s.provider || "").includes("native-rpc"),
                ).length;
                const errN = slices.filter((s) => s.status === "error").length;
                const noSol = scanSolana.length === 0;
                const noBtc = scanBitcoin.length === 0;
                const noSui = walletKind === "phantom" && scanSui.length === 0;
                if (
                  !fallbackN &&
                  !errN &&
                  !noSol &&
                  multi.warnings.length === 0
                ) {
                  return null;
                }
                return (
                  <div className="coverage-banner" role="status">
                    <p className="coverage-title">
                      Why this can be below the connected wallet
                    </p>
                    <ul>
                      {noSol || noBtc || noSui ? (
                        <li>
                          <strong>Non-EVM still waiting</strong> — disconnect and
                          connect again; approve Solana / Bitcoin / Sui when
                          prompted. MetaMask’s SOL lives on a Solana address,
                          not this 0x.
                        </li>
                      ) : null}
                      {fallbackN > 0 ? (
                        <li>
                          <strong>{fallbackN} wallet(s)</strong> only got native
                          balances — ERC-20s like USDC may be missing. Rescan
                          later or Deep scan those wallets.
                        </li>
                      ) : null}
                      {errN > 0 ? (
                        <li>
                          <strong>{errN} wallet(s)</strong> failed the indexer —
                          open Per wallet and look for <em>error</em> status.
                        </li>
                      ) : null}
                      <li>
                        Default scan covers major-chain natives and well-known
                        tokens (LINK, stables, wrapped SOL). A connected single
                        wallet also sweeps 2,000+ <strong>mainnet</strong> EVM
                        natives — testnets are never listed.
                      </li>
                    </ul>
                    {multi.warnings.length > 0 ? (
                      <details className="warnings-panel">
                        <summary>Scan notes ({multi.warnings.length})</summary>
                        <ul>
                          {multi.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                );
              })()}

              <AnimatePresence mode="wait">
                {groups.length === 0 ? (
                  <motion.p
                    key="empty"
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    No balances matched. Clear search, enable wallets, or show
                    dust.
                  </motion.p>
                ) : (
                  <motion.div
                    key={`${viewMode}-${activeWallet}-${activeChain}-${query}-${hideDust}`}
                    className="chain-groups"
                    variants={reduceMotion ? undefined : staggerContainer}
                    initial="hidden"
                    animate="show"
                  >
                    {groups.map((group) => {
                      const isOpen = expanded[group.chainSlug] ?? false;
                      const visible = isOpen
                        ? group.tokens
                        : group.tokens.slice(0, INITIAL_VISIBLE);
                      const hidden = group.tokens.length - visible.length;

                      return (
                        <motion.article
                          key={group.chainSlug}
                          className="chain-group"
                          variants={fadeUp}
                        >
                          <header className="chain-group-head">
                            <h3>{group.chainName}</h3>
                            <p>
                              {group.tokens.length} tokens
                              {group.valueUsd > 0
                                ? ` · ${formatUsd(group.valueUsd)}`
                                : ""}
                            </p>
                          </header>
                          <ul className="token-list">
                            <li className="token-row token-head" aria-hidden>
                              <span>Asset</span>
                              <span>Balance</span>
                            </li>
                            {visible.map((token, idx) => (
                              <motion.li
                                key={`${token.chainSlug}-${token.tokenAddress ?? "native"}-${token.symbol}-${token.balanceRaw}`}
                                className="token-row"
                                initial={
                                  reduceMotion
                                    ? false
                                    : { opacity: 0, y: 6 }
                                }
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  ...easeOut,
                                  delay: Math.min(idx, 12) * 0.02,
                                }}
                              >
                                <div className="token-identity">
                                  <TokenIcon
                                    chainId={token.chainId}
                                    chainSlug={token.chainSlug}
                                    tokenAddress={token.tokenAddress}
                                    thumbnail={token.thumbnail}
                                    symbol={token.symbol}
                                    tokenType={token.tokenType}
                                  />
                                  <div className="token-copy">
                                    <p className="token-symbol">
                                      {token.symbol}
                                      {viewMode === "combined" &&
                                      (token.walletCount ?? 0) > 1 ? (
                                        <em className="wallet-badge">
                                          {" "}
                                          · {token.walletCount} wallets
                                        </em>
                                      ) : null}
                                    </p>
                                    <p className="token-name">{token.name}</p>
                                  </div>
                                </div>
                                <div className="token-amounts">
                                  <p className="token-usd">
                                    {formatUsd(token.valueUsd)}
                                  </p>
                                  <p className="token-balance">
                                    {formatTokenAmount(token.balance)}{" "}
                                    {token.symbol}
                                  </p>
                                </div>
                              </motion.li>
                            ))}
                          </ul>
                          {hidden > 0 || isOpen ? (
                            <button
                              type="button"
                              className="show-more"
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [group.chainSlug]: !isOpen,
                                }))
                              }
                            >
                              {isOpen ? "Show less" : `Show ${hidden} more`}
                            </button>
                          ) : null}
                        </motion.article>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      </section>

      <section className="storm-banner">
        <div className="storm-copy">
          <h2>Keep hunting forgotten balances.</h2>
          <p>
            Totals stay free. Tip {MONAD_TIP_AMOUNT} MON on Monad to
            unlock token names and networks.
          </p>
          <div className="hero-cta">
            <button
              type="button"
              className="btn-on-lime"
              onClick={() => void scan()}
              disabled={loading || deepScanning}
            >
              {loading ? "Scanning…" : "Rescan all"}
            </button>
            <a className="btn-on-lime-ghost" href="#wallets">
              Manage wallets
            </a>
          </div>
        </div>
        <motion.div
          className="storm-mascot"
          animate={reduceMotion ? undefined : floatY}
        >
          <Image
            src="/rain/stormimg.png"
            alt=""
            width={849}
            height={476}
            className="storm-photo"
          />
        </motion.div>
      </section>
    </motion.div>
  );
}

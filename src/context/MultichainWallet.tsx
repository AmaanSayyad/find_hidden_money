"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppKitBridge } from "@/components/AppKitBridge";
import { isValidEvmAddress } from "@/lib/balances";
import {
  createMultichainSession,
  getMultichainSession,
  refreshDiscoveredAccounts,
  requestAllWalletAddresses,
  requestMoreEvmAccounts,
  revokeMultichainSession,
} from "@/lib/multichain/connect";
import {
  createPhantomSession,
  disconnectPhantom,
  requestActivePhantomSolana,
  subscribePhantomAccountChanges,
} from "@/lib/multichain/phantom";
import { getMetaMaskProvider } from "@/lib/multichain/provider";
import { requestMetaMaskSolanaAccounts } from "@/lib/multichain/solana-auto";
import {
  emptyAccounts,
  type MultichainAccounts,
} from "@/lib/multichain/scopes";
import {
  isValidSolanaAddress,
} from "@/lib/solana-address";
import {
  loadRoster,
  mergeRoster,
  parseBulkEvmAddresses,
  persistRoster,
  shortenLabel,
  type RosterWallet,
} from "@/lib/wallets/roster";
import {
  clearPersistedSolanaRoster,
  loadSolanaRoster,
  mergeSolanaRoster,
  parseBulkSolanaAddresses,
  persistSolanaRoster,
  shortenSolLabel,
  type SolanaRosterWallet,
  MAX_SOLANA_WALLETS,
} from "@/lib/wallets/solana-roster";

const LINKED_SOLANA_KEY = "fhm.linkedSolana";
const LINKED_ROBINHOOD_KEY = "fhm.linkedRobinhood";
const WALLET_KIND_KEY = "fhm.walletKind";

export type WalletKind = "metamask" | "phantom" | "appkit" | null;

type Ctx = {
  accounts: MultichainAccounts;
  walletKind: WalletKind;
  /** Currently selected EVM account (first eth_accounts entry), lowercase. */
  activeEvm: string | null;
  roster: RosterWallet[];
  /** Phantom Solana multi-wallet roster (up to 100). */
  solanaRoster: SolanaRosterWallet[];
  enabledEvm: string[];
  enabledSolana: string[];
  linkedSolana: string[];
  scanSolana: string[];
  linkedRobinhood: string[];
  /** Distinct RH addresses not already in the EVM roster. */
  scanRobinhood: string[];
  scanBitcoin: string[];
  scanTron: string[];
  scanSui: string[];
  isConnected: boolean;
  isPending: boolean;
  error: string | null;
  evmOnly: boolean;
  maxSolanaWallets: number;
  /** Open Reown AppKit — 500+ wallets across EVM, Solana, Bitcoin, Tron. */
  connect: () => Promise<void>;
  /** Connect Phantom — Solana + EVM + Bitcoin + Sui automatically. */
  connectPhantom: () => Promise<void>;
  /**
   * Add the currently selected Phantom Solana account to the roster
   * (switch accounts in Phantom, then call — collect up to 100).
   */
  addActivePhantomSolana: () => Promise<number>;
  /** Wipe saved Phantom Solana roster (local). */
  clearSolanaRoster: () => void;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  requestMoreAccounts: () => Promise<number>;
  /**
   * Prompt the connected wallet to authorize every account it holds
   * (EVM picker + Solana). Enable them all for scanning.
   */
  connectAllAddresses: () => Promise<{
    evmAdded: number;
    solAdded: number;
    evmTotal: number;
    solTotal: number;
  }>;
  /**
   * Re-run automatic multichain discovery (no paste). Prefer Connect —
   * this is only for rare silent refresh.
   */
  rediscoverNetworks: () => Promise<void>;
  importEvmBulk: (raw: string) => { added: number; total: number; error?: string };
  importSolanaBulk: (raw: string) => { added: number; total: number; error?: string };
  toggleWallet: (address: string, enabled: boolean) => void;
  toggleSolanaWallet: (address: string, enabled: boolean) => void;
  setAllEnabled: (enabled: boolean) => void;
  setAllSolanaEnabled: (enabled: boolean) => void;
  removeWallet: (address: string) => void;
  removeSolanaWallet: (address: string) => void;
  renameWallet: (address: string, label: string) => void;
};

const MultichainWalletContext = createContext<Ctx | null>(null);

function loadLinkedSolana(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LINKED_SOLANA_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(isValidSolanaAddress),
      ),
    ];
  } catch {
    return [];
  }
}

function persistLinkedSolana(addrs: string[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LINKED_SOLANA_KEY, JSON.stringify(addrs));
}

function loadLinkedRobinhood(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(LINKED_ROBINHOOD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().toLowerCase())
          .filter(isValidEvmAddress),
      ),
    ];
  } catch {
    return [];
  }
}

function persistLinkedRobinhood(addrs: string[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LINKED_ROBINHOOD_KEY, JSON.stringify(addrs));
}

function syncRosterFromAccounts(
  prev: RosterWallet[],
  accounts: MultichainAccounts,
  source: "metamask" | "phantom" | "appkit" = "metamask",
): RosterWallet[] {
  const incoming = accounts.evm.map((address, i) => ({
    address,
    source,
    label: shortenLabel(address, i),
  }));
  return mergeRoster(prev, incoming);
}

function loadWalletKind(): WalletKind {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(WALLET_KIND_KEY);
  return v === "metamask" || v === "phantom" || v === "appkit" ? v : null;
}

function persistWalletKind(kind: WalletKind) {
  if (typeof window === "undefined") return;
  if (!kind) sessionStorage.removeItem(WALLET_KIND_KEY);
  else sessionStorage.setItem(WALLET_KIND_KEY, kind);
}

export function MultichainWalletProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<MultichainAccounts>(emptyAccounts);
  const [walletKind, setWalletKind] = useState<WalletKind>(null);
  const [activeEvm, setActiveEvm] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterWallet[]>([]);
  const [solanaRoster, setSolanaRoster] = useState<SolanaRosterWallet[]>([]);
  const [linkedSolana, setLinkedSolana] = useState<string[]>([]);
  const [linkedRobinhood, setLinkedRobinhood] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appKitApi = useRef<{
    openConnect: () => Promise<void>;
    disconnect: () => Promise<void>;
  } | null>(null);

  const addSolanaAddresses = useCallback(
    (addrs: string[], source: "phantom" | "metamask" | "appkit" | "manual" = "phantom") => {
      const valid = addrs.filter(isValidSolanaAddress);
      if (valid.length === 0) return 0;
      let added = 0;
      setSolanaRoster((prev) => {
        const before = prev.length;
        const merged = mergeSolanaRoster(
          prev,
          valid.map((address, i) => ({
            address,
            source,
            label: shortenSolLabel(address, before + i),
          })),
        );
        added = merged.length - before;
        persistSolanaRoster(merged);
        return merged;
      });
      setLinkedSolana((prev) => {
        const next = [...new Set([...prev, ...valid])].slice(
          0,
          MAX_SOLANA_WALLETS,
        );
        persistLinkedSolana(next);
        return next;
      });
      return added;
    },
    [],
  );

  useEffect(() => {
    setLinkedSolana(loadLinkedSolana());
    setLinkedRobinhood(loadLinkedRobinhood());
    setRoster(loadRoster());
    setSolanaRoster(loadSolanaRoster());
    setWalletKind(loadWalletKind());
  }, []);

  // Auto-collect Phantom accounts as the user switches wallets in the extension.
  useEffect(() => {
    if (walletKind !== "phantom") return;
    return subscribePhantomAccountChanges({
      onSolana: (address) => {
        addSolanaAddresses([address], "phantom");
        setAccounts((prev) => {
          if (prev.solana.includes(address)) return prev;
          return {
            ...prev,
            solana: [...prev.solana, address],
            all: [
              ...prev.all,
              {
                ecosystem: "solana",
                scope: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
                address,
                caip10: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${address}`,
              },
            ],
          };
        });
      },
      onEvm: (addresses) => {
        setActiveEvm(addresses[0] ?? null);
        setRoster((prev) => {
          const merged = mergeRoster(
            prev,
            addresses.map((address, i) => ({
              address,
              source: "phantom" as const,
              label: shortenLabel(address, prev.length + i),
            })),
          ).map((w) =>
            addresses.includes(w.address) ? { ...w, enabled: true } : w,
          );
          persistRoster(merged);
          return merged;
        });
      },
    });
  }, [walletKind, addSolanaAddresses]);

  // Keep roster in sync when user switches / unlocks more MetaMask accounts.
  useEffect(() => {
    if (walletKind !== "metamask") return;
    let alive = true;
    let provider: Awaited<ReturnType<typeof getMetaMaskProvider>> = null;

    const mergeAddresses = (addrs: string[]) => {
      if (!alive || addrs.length === 0) return;
      const normalized = [
        ...new Set(addrs.map((a) => a.toLowerCase()).filter(Boolean)),
      ];
      // MetaMask puts the currently selected account first.
      setActiveEvm(normalized[0] ?? null);
      setAccounts((prev) => {
        const scope = "eip155:1";
        const next = {
          ...prev,
          evm: [...prev.evm],
          all: [...prev.all],
          byScope: { ...prev.byScope },
        };
        for (const addr of normalized) {
          if (next.evm.includes(addr)) continue;
          next.evm.push(addr);
          next.all.push({
            ecosystem: "eip155",
            scope,
            address: addr,
            caip10: `${scope}:${addr}`,
          });
          const list = next.byScope[scope] ?? [];
          if (!list.includes(addr)) next.byScope[scope] = [...list, addr];
        }
        if (next.source === "none") next.source = "evm-fallback";
        return next;
      });
      setRoster((prev) => {
        const merged = mergeRoster(
          prev,
          normalized.map((address, i) => ({
            address,
            source: "metamask" as const,
            label: shortenLabel(address, prev.length + i),
          })),
        ).map((w) =>
          normalized.includes(w.address) ? { ...w, enabled: true } : w,
        );
        persistRoster(merged);
        return merged;
      });
    };

    const onAccountsChanged = (addrs: unknown) => {
      if (Array.isArray(addrs)) {
        mergeAddresses(addrs.filter((a): a is string => typeof a === "string"));
      }
    };

    void (async () => {
      provider = await getMetaMaskProvider();
      if (!provider || !alive) return;
      const eth = provider as {
        on?: (event: string, handler: (addrs: string[]) => void) => void;
        removeListener?: (
          event: string,
          handler: (addrs: string[]) => void,
        ) => void;
        request: (args: { method: string; params?: unknown }) => Promise<unknown>;
      };
      eth.on?.("accountsChanged", onAccountsChanged);
      try {
        const permitted = (await eth.request({
          method: "eth_accounts",
          params: [],
        })) as string[];
        if (alive) mergeAddresses(permitted ?? []);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      alive = false;
      const eth = provider as {
        removeListener?: (
          event: string,
          handler: (addrs: string[]) => void,
        ) => void;
      } | null;
      eth?.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [walletKind]);

  const applyConnectedAccounts = useCallback(
    (next: MultichainAccounts, kind: "metamask" | "phantom" | "appkit") => {
      setAccounts(next);
      setWalletKind(kind);
      persistWalletKind(kind);
      setActiveEvm(next.evm[0] ?? null);

      if (kind === "appkit") {
        if (next.solana.length > 0) addSolanaAddresses(next.solana, "appkit");
        setSolanaRoster((prev) => {
          const merged = mergeSolanaRoster(
            prev,
            next.solana.map((address, i) => ({
              address,
              source: "appkit" as const,
              label: shortenSolLabel(address, i),
            })),
          );
          persistSolanaRoster(merged);
          return merged;
        });
        setRoster((prev) => {
          const merged = syncRosterFromAccounts(prev, next, "appkit").map(
            (w) => ({ ...w, enabled: true }),
          );
          persistRoster(merged);
          return merged;
        });
        if (next.robinhood.length > 0 || next.evm.length > 0) {
          const rh = [
            ...new Set([
              ...next.robinhood,
              ...next.evm.filter(isValidEvmAddress),
            ]),
          ];
          persistLinkedRobinhood(rh);
          setLinkedRobinhood(rh);
        }
        return;
      }

      if (kind === "phantom") {
        // Phantom path — never merge MetaMask EVM roster.
        if (next.solana.length > 0) {
          addSolanaAddresses(next.solana, "phantom");
        }
        // Reload any previously collected Phantom Solana wallets from disk.
        setSolanaRoster((prev) => {
          const saved = loadSolanaRoster().filter((w) => w.source === "phantom");
          const merged = mergeSolanaRoster(
            [...saved, ...prev.filter((w) => w.source === "phantom")],
            next.solana.map((address, i) => ({
              address,
              source: "phantom" as const,
              label: shortenSolLabel(address, i),
            })),
          );
          persistSolanaRoster(merged);
          return merged;
        });
        setRoster((prev) => {
          const phantomOnly = prev.filter((w) => w.source === "phantom");
          const merged = syncRosterFromAccounts(phantomOnly, next, "phantom").map(
            (w) => ({ ...w, enabled: true }),
          );
          persistRoster(merged);
          return merged;
        });
        if (next.robinhood.length > 0 || next.evm.length > 0) {
          const rh = [
            ...new Set([
              ...next.robinhood,
              ...next.evm.filter(isValidEvmAddress),
            ]),
          ];
          persistLinkedRobinhood(rh);
          setLinkedRobinhood(rh);
        }
        return;
      }

      // MetaMask path — never touch Phantom Solana roster.
      if (next.solana.length > 0) {
        addSolanaAddresses(next.solana, "metamask");
      }
      if (next.robinhood.length > 0 || next.evm.length > 0) {
        const rh = [
          ...new Set([
            ...loadLinkedRobinhood(),
            ...next.robinhood,
            ...next.evm.filter(isValidEvmAddress),
          ]),
        ];
        persistLinkedRobinhood(rh);
        setLinkedRobinhood(rh);
      }
      setRoster((prev) => {
        const mmOnly = prev.filter((w) => w.source !== "phantom");
        const merged = syncRosterFromAccounts(mmOnly, next, "metamask").map(
          (w) => ({ ...w, enabled: true }),
        );
        persistRoster(merged);
        return merged;
      });
    },
    [addSolanaAddresses],
  );

  const connect = useCallback(async () => {
    setError(null);
    try {
      await appKitApi.current?.openConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open wallets");
      throw err;
    }
  }, []);

  const connectPhantom = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const next = await createPhantomSession();
      if (next.all.length === 0) {
        throw new Error("No accounts returned from Phantom");
      }
      applyConnectedAccounts(next, "phantom");
    } catch (err) {
      setAccounts(emptyAccounts());
      setActiveEvm(null);
      setWalletKind(null);
      persistWalletKind(null);
      setError(err instanceof Error ? err.message : "Failed to connect Phantom");
      throw err;
    } finally {
      setIsPending(false);
    }
  }, [applyConnectedAccounts]);

  const addActivePhantomSolana = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const addr = await requestActivePhantomSolana();
      if (!addr) {
        setError(
          "No Phantom Solana account — unlock Phantom, select an account, then retry.",
        );
        return 0;
      }
      const added = addSolanaAddresses([addr], "phantom");
      return added;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add Phantom account",
      );
      return 0;
    } finally {
      setIsPending(false);
    }
  }, [addSolanaAddresses]);

  const clearSolanaRoster = useCallback(() => {
    setSolanaRoster([]);
    clearPersistedSolanaRoster();
    setLinkedSolana([]);
    persistLinkedSolana([]);
  }, []);

  const disconnect = useCallback(async () => {
    setIsPending(true);
    const kind = walletKind;
    try {
      if (kind === "phantom") {
        await disconnectPhantom();
      } else if (kind === "metamask") {
        await revokeMultichainSession();
      } else {
        await appKitApi.current?.disconnect();
      }
    } finally {
      mmSolanaTried.current = null;
      mmSolanaInFlight.current = false;
      setAccounts(emptyAccounts());
      setActiveEvm(null);
      setWalletKind(null);
      persistWalletKind(null);
      setError(null);

      if (kind === "phantom") {
        // Keep Solana roster in localStorage — Phantom cannot re-select all 60
        // in one prompt; collected wallets survive disconnect/reconnect.
        setRoster([]);
        persistRoster([]);
        setLinkedRobinhood([]);
        persistLinkedRobinhood([]);
      } else if (kind === "metamask") {
        setRoster([]);
        persistRoster([]);
        setLinkedRobinhood([]);
        persistLinkedRobinhood([]);
        // Do not wipe Phantom Solana collection — wallets stay separate.
        setSolanaRoster((prev) => {
          const next = prev.filter((w) => w.source === "phantom");
          persistSolanaRoster(next);
          return next;
        });
        setLinkedSolana((prev) => {
          const keep = new Set(
            loadSolanaRoster()
              .filter((w) => w.source === "phantom")
              .map((w) => w.address),
          );
          const next = prev.filter((a) => keep.has(a));
          persistLinkedSolana(next);
          return next;
        });
      } else {
        setRoster([]);
        persistRoster([]);
        setLinkedRobinhood([]);
        persistLinkedRobinhood([]);
      }

      setIsPending(false);
    }
  }, [walletKind]);

  const refresh = useCallback(async () => {
    const next = await getMultichainSession();
    setAccounts(next);
    if (next.evm.length > 0) {
      setRoster((prev) => {
        const merged = syncRosterFromAccounts(prev, next);
        persistRoster(merged);
        return merged;
      });
    }
  }, []);

  const applyDiscovered = useCallback((next: MultichainAccounts) => {
    setAccounts(next);
    if (next.evm[0]) setActiveEvm(next.evm[0]);
    if (next.solana.length > 0) {
      const sol = [...new Set([...loadLinkedSolana(), ...next.solana])];
      persistLinkedSolana(sol);
      setLinkedSolana(sol);
    }
    if (next.robinhood.length > 0) {
      const rh = [...new Set([...loadLinkedRobinhood(), ...next.robinhood])];
      persistLinkedRobinhood(rh);
      setLinkedRobinhood(rh);
    }
    if (next.evm.length > 0) {
      setRoster((prev) => {
        const merged = syncRosterFromAccounts(prev, next);
        persistRoster(merged);
        return merged;
      });
    }
  }, []);

  const rediscoverNetworks = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      if (walletKind === "appkit") {
        await appKitApi.current?.openConnect();
        return;
      }
      if (walletKind === "phantom") {
        const next = await createPhantomSession();
        applyConnectedAccounts(next, "phantom");
      } else {
        const next = await refreshDiscoveredAccounts(accounts);
        applyDiscovered(next);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Network rediscovery failed",
      );
    } finally {
      setIsPending(false);
    }
  }, [accounts, applyDiscovered, applyConnectedAccounts, walletKind]);

  const requestMoreAccounts = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const addrs = await requestMoreEvmAccounts();
      if (addrs.length === 0) return 0;
      let added = 0;
      setRoster((prev) => {
        const before = prev.length;
        const merged = mergeRoster(
          prev,
          addrs.map((address, i) => ({
            address,
            source:
              walletKind === "appkit"
                ? ("appkit" as const)
                : ("metamask" as const),
            label: shortenLabel(address, before + i),
          })),
        ).map((w) =>
          addrs.includes(w.address) ? { ...w, enabled: true } : w,
        );
        added = merged.length - before;
        persistRoster(merged);
        return merged;
      });
      setAccounts((prev) => {
        const scope = "eip155:1";
        const next = {
          ...prev,
          evm: [...prev.evm],
          all: [...prev.all],
          byScope: { ...prev.byScope },
        };
        for (const addr of addrs) {
          if (next.evm.includes(addr)) continue;
          next.evm.push(addr);
          next.all.push({
            ecosystem: "eip155",
            scope,
            address: addr,
            caip10: `${scope}:${addr}`,
          });
          const list = next.byScope[scope] ?? [];
          if (!list.includes(addr)) next.byScope[scope] = [...list, addr];
        }
        return next;
      });
      return added;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add accounts");
      return 0;
    } finally {
      setIsPending(false);
    }
  }, [walletKind]);

  const importEvmBulk = useCallback((raw: string) => {
    const parsed = parseBulkEvmAddresses(raw);
    if (parsed.length === 0) {
      return { added: 0, total: roster.length, error: "No valid 0x addresses found." };
    }
    let added = 0;
    let total = roster.length;
    setRoster((prev) => {
      const before = prev.length;
      const merged = mergeRoster(
        prev,
        parsed.map((address, i) => ({
          address,
          source: "manual" as const,
          label: shortenLabel(address, before + i),
        })),
      );
      added = merged.length - before;
      total = merged.length;
      persistRoster(merged);
      return merged;
    });
    return { added, total };
  }, [roster.length]);

  const importSolanaBulk = useCallback((raw: string) => {
    const parsed = parseBulkSolanaAddresses(raw);
    if (parsed.length === 0) {
      return {
        added: 0,
        total: solanaRoster.length,
        error: "No valid Solana addresses found.",
      };
    }
    let added = 0;
    let total = solanaRoster.length;
    setSolanaRoster((prev) => {
      const before = prev.length;
      const merged = mergeSolanaRoster(
        prev,
        parsed.map((address, i) => ({
          address,
          source: "manual" as const,
          label: shortenSolLabel(address, before + i),
        })),
      );
      added = merged.length - before;
      total = merged.length;
      persistSolanaRoster(merged);
      return merged;
    });
    setLinkedSolana((prev) => {
      const next = [...new Set([...prev, ...parsed])].slice(
        0,
        MAX_SOLANA_WALLETS,
      );
      persistLinkedSolana(next);
      return next;
    });
    return { added, total };
  }, [solanaRoster.length]);

  const toggleWallet = useCallback((address: string, enabled: boolean) => {
    setRoster((prev) => {
      const next = prev.map((w) =>
        w.address === address.toLowerCase() ? { ...w, enabled } : w,
      );
      persistRoster(next);
      return next;
    });
  }, []);

  const toggleSolanaWallet = useCallback(
    (address: string, enabled: boolean) => {
      setSolanaRoster((prev) => {
        const next = prev.map((w) =>
          w.address === address ? { ...w, enabled } : w,
        );
        persistSolanaRoster(next);
        return next;
      });
    },
    [],
  );

  const setAllEnabled = useCallback((enabled: boolean) => {
    setRoster((prev) => {
      const next = prev.map((w) => ({ ...w, enabled }));
      persistRoster(next);
      return next;
    });
  }, []);

  const setAllSolanaEnabled = useCallback((enabled: boolean) => {
    setSolanaRoster((prev) => {
      const next = prev.map((w) => ({ ...w, enabled }));
      persistSolanaRoster(next);
      return next;
    });
  }, []);

  const removeWallet = useCallback((address: string) => {
    setRoster((prev) => {
      const next = prev.filter((w) => w.address !== address.toLowerCase());
      persistRoster(next);
      return next;
    });
  }, []);

  const removeSolanaWallet = useCallback((address: string) => {
    setSolanaRoster((prev) => {
      const next = prev.filter((w) => w.address !== address);
      persistSolanaRoster(next);
      return next;
    });
    setLinkedSolana((prev) => {
      const next = prev.filter((a) => a !== address);
      persistLinkedSolana(next);
      return next;
    });
  }, []);

  const renameWallet = useCallback((address: string, label: string) => {
    const trimmed = label.trim().slice(0, 40) || shortenLabel(address, 0);
    setRoster((prev) => {
      const next = prev.map((w) =>
        w.address === address.toLowerCase() ? { ...w, label: trimmed } : w,
      );
      persistRoster(next);
      return next;
    });
  }, []);

  const enabledEvm = useMemo(
    () => roster.filter((w) => w.enabled).map((w) => w.address),
    [roster],
  );

  const enabledSolana = useMemo(
    () =>
      solanaRoster
        .filter((w) => w.enabled)
        .filter((w) =>
          walletKind === "phantom"
            ? w.source === "phantom" || w.source === "manual"
            : walletKind === "metamask"
              ? w.source === "metamask"
              : w.source === "appkit" ||
                w.source === "metamask" ||
                w.source === "manual",
        )
        .map((w) => w.address),
    [solanaRoster, walletKind],
  );

  const scanSolana = useMemo(() => {
    if (walletKind === "phantom") {
      return [...new Set(enabledSolana)].slice(0, MAX_SOLANA_WALLETS);
    }
    return [
      ...new Set([
        ...enabledSolana,
        ...accounts.solana,
        ...linkedSolana,
      ]),
    ].slice(0, MAX_SOLANA_WALLETS);
  }, [walletKind, enabledSolana, accounts.solana, linkedSolana]);

  /**
   * Robinhood addresses that differ from the EVM roster (session-scoped).
   * Same-address RH balances are scanned automatically with each EVM wallet.
   */
  const scanRobinhood = useMemo(() => {
    const evmSet = new Set(enabledEvm);
    return [
      ...new Set([...accounts.robinhood, ...linkedRobinhood]),
    ].filter((a) => !evmSet.has(a));
  }, [accounts.robinhood, linkedRobinhood, enabledEvm]);

  const scanBitcoin = useMemo(() => [...accounts.bitcoin], [accounts.bitcoin]);
  const scanTron = useMemo(() => [...accounts.tron], [accounts.tron]);
  const scanSui = useMemo(() => [...accounts.sui], [accounts.sui]);

  const mmSolanaTried = useRef<string | null>(null);
  const mmSolanaInFlight = useRef(false);

  const mergeSolanaIntoState = useCallback(
    (addrs: string[], source: "metamask" | "appkit") => {
      const valid = addrs.filter(isValidSolanaAddress);
      if (valid.length === 0) return;
      addSolanaAddresses(valid, source);
      setAccounts((prev) => {
        const scope = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
        const next = {
          ...prev,
          solana: [...prev.solana],
          all: [...prev.all],
          byScope: { ...prev.byScope },
        };
        for (const address of valid) {
          if (next.solana.includes(address)) continue;
          next.solana.push(address);
          next.all.push({
            ecosystem: "solana",
            scope,
            address,
            caip10: `${scope}:${address}`,
          });
          const list = next.byScope[scope] ?? [];
          if (!list.includes(address)) next.byScope[scope] = [...list, address];
        }
        return next;
      });
    },
    [addSolanaAddresses],
  );

  const connectAllAddresses = useCallback(async () => {
    setIsPending(true);
    setError(null);
    const beforeEvm = roster.length;
    const beforeSol = solanaRoster.length;
    try {
      if (walletKind === "phantom") {
        const next = await createPhantomSession();
        applyConnectedAccounts(next, "phantom");
        await addActivePhantomSolana();
        setAllEnabled(true);
        setAllSolanaEnabled(true);
        return {
          evmAdded: Math.max(0, next.evm.length),
          solAdded: Math.max(0, next.solana.length),
          evmTotal: next.evm.length,
          solTotal: next.solana.length,
        };
      }

      const { evm, solana } = await requestAllWalletAddresses({
        revokeFirst: walletKind !== "appkit",
      });

      if (evm.length > 0) {
        setRoster((prev) => {
          const merged = mergeRoster(
            prev,
            evm.map((address, i) => ({
              address,
              source:
                walletKind === "appkit"
                  ? ("appkit" as const)
                  : ("metamask" as const),
              label: shortenLabel(address, prev.length + i),
            })),
          ).map((w) =>
            evm.includes(w.address) ? { ...w, enabled: true } : w,
          );
          persistRoster(merged);
          return merged;
        });
        setAccounts((prev) => {
          const scope = "eip155:1";
          const next = {
            ...prev,
            evm: [...prev.evm],
            all: [...prev.all],
            byScope: { ...prev.byScope },
          };
          for (const addr of evm) {
            if (next.evm.includes(addr)) continue;
            next.evm.push(addr);
            next.all.push({
              ecosystem: "eip155",
              scope,
              address: addr,
              caip10: `${scope}:${addr}`,
            });
            const list = next.byScope[scope] ?? [];
            if (!list.includes(addr)) next.byScope[scope] = [...list, addr];
          }
          return next;
        });
      }

      if (solana.length > 0) {
        mergeSolanaIntoState(
          solana,
          walletKind === "appkit" ? "appkit" : "metamask",
        );
      }

      setAllEnabled(true);
      setAllSolanaEnabled(true);

      if (evm.length === 0 && solana.length === 0) {
        await appKitApi.current?.openConnect();
      }

      return {
        evmAdded: Math.max(0, evm.length - beforeEvm),
        solAdded: Math.max(0, solana.length - beforeSol),
        evmTotal: evm.length,
        solTotal: solana.length,
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect all accounts",
      );
      try {
        await appKitApi.current?.openConnect();
      } catch {
        /* ignore */
      }
      return { evmAdded: 0, solAdded: 0, evmTotal: 0, solTotal: 0 };
    } finally {
      setIsPending(false);
    }
  }, [
    walletKind,
    roster.length,
    solanaRoster.length,
    applyConnectedAccounts,
    addActivePhantomSolana,
    mergeSolanaIntoState,
    setAllEnabled,
    setAllSolanaEnabled,
  ]);

  const enrichMetaMaskSolana = useCallback(
    async (evm: string[]) => {
      const key = evm.map((a) => a.toLowerCase()).sort().join("|");
      if (!key || mmSolanaTried.current === key || mmSolanaInFlight.current) {
        return;
      }

      const mm = await getMetaMaskProvider();
      if (!mm) return;

      let permitted: string[] = [];
      try {
        permitted = (
          (await mm.request({
            method: "eth_accounts",
            params: [],
          })) as string[]
        ).map((a) => a.toLowerCase());
      } catch {
        return;
      }
      const overlap = evm.some((a) => permitted.includes(a.toLowerCase()));
      mmSolanaTried.current = key;
      if (!overlap) return;

      mmSolanaInFlight.current = true;
      try {
        const silent = await requestMetaMaskSolanaAccounts({ silentFirst: true });
        let addrs = silent.addresses.filter(isValidSolanaAddress);
        if (addrs.length === 0) {
          const interactive = await requestMetaMaskSolanaAccounts({
            silentFirst: false,
          });
          addrs = interactive.addresses.filter(isValidSolanaAddress);
        }
        if (addrs.length > 0) mergeSolanaIntoState(addrs, "metamask");
      } finally {
        mmSolanaInFlight.current = false;
      }
    },
    [mergeSolanaIntoState],
  );

  const onAppKitAccounts = useCallback(
    (next: MultichainAccounts) => {
      applyConnectedAccounts(next, "appkit");
      if (next.solana.length > 0) {
        mmSolanaTried.current = next.evm.map((a) => a.toLowerCase()).sort().join("|") || "sol";
        return;
      }
      if (next.evm.length > 0) {
        void enrichMetaMaskSolana(next.evm);
      }
    },
    [applyConnectedAccounts, enrichMetaMaskSolana],
  );

  const onAppKitDisconnected = useCallback(() => {
    mmSolanaTried.current = null;
    mmSolanaInFlight.current = false;
    setAccounts(emptyAccounts());
    setActiveEvm(null);
    setWalletKind(null);
    persistWalletKind(null);
    setRoster([]);
    persistRoster([]);
    setLinkedRobinhood([]);
    persistLinkedRobinhood([]);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      accounts,
      walletKind,
      activeEvm,
      roster,
      solanaRoster,
      enabledEvm,
      enabledSolana,
      linkedSolana,
      scanSolana,
      linkedRobinhood,
      scanRobinhood,
      scanBitcoin,
      scanTron,
      scanSui,
      isConnected:
        walletKind !== null &&
        (accounts.all.length > 0 ||
          roster.length > 0 ||
          (walletKind === "phantom" && solanaRoster.length > 0)),
      isPending,
      error,
      evmOnly:
        accounts.source === "evm-fallback" ||
        (enabledEvm.length > 0 &&
          accounts.solana.length === 0 &&
          accounts.bitcoin.length === 0 &&
          accounts.tron.length === 0 &&
          accounts.sui.length === 0),
      maxSolanaWallets: MAX_SOLANA_WALLETS,
      connect,
      connectPhantom,
      addActivePhantomSolana,
      clearSolanaRoster,
      disconnect,
      refresh,
      requestMoreAccounts,
      connectAllAddresses,
      rediscoverNetworks,
      importEvmBulk,
      importSolanaBulk,
      toggleWallet,
      toggleSolanaWallet,
      setAllEnabled,
      setAllSolanaEnabled,
      removeWallet,
      removeSolanaWallet,
      renameWallet,
    }),
    [
      accounts,
      walletKind,
      activeEvm,
      roster,
      solanaRoster,
      enabledEvm,
      enabledSolana,
      linkedSolana,
      scanSolana,
      linkedRobinhood,
      scanRobinhood,
      scanBitcoin,
      scanTron,
      scanSui,
      isPending,
      error,
      connect,
      connectPhantom,
      addActivePhantomSolana,
      clearSolanaRoster,
      disconnect,
      refresh,
      requestMoreAccounts,
      connectAllAddresses,
      rediscoverNetworks,
      importEvmBulk,
      importSolanaBulk,
      toggleWallet,
      toggleSolanaWallet,
      setAllEnabled,
      setAllSolanaEnabled,
      removeWallet,
      removeSolanaWallet,
      renameWallet,
    ],
  );

  return (
    <MultichainWalletContext.Provider value={value}>
      <AppKitBridge
        active={walletKind === "appkit"}
        onAccounts={onAppKitAccounts}
        onDisconnected={onAppKitDisconnected}
        apiRef={appKitApi}
      />
      {children}
    </MultichainWalletContext.Provider>
  );
}

export function useMultichainWallet(): Ctx {
  const ctx = useContext(MultichainWalletContext);
  if (!ctx) {
    throw new Error("useMultichainWallet must be used within provider");
  }
  return ctx;
}

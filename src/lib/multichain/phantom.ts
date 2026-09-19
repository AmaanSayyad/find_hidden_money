"use client";

import { getWallets } from "@wallet-standard/app";
import { isValidEvmAddress } from "@/lib/balances";
import {
  emptyAccounts,
  MULTICHAIN_SCOPES,
  type MultichainAccounts,
} from "./scopes";

type PhantomSolana = {
  isPhantom?: boolean;
  publicKey?: { toString: () => string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString: () => string };
  }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

type PhantomEthereum = {
  isPhantom?: boolean;
  selectedAddress?: string | null;
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

type BtcAccount = {
  address: string;
  purpose?: string;
  addressType?: string;
};

type PhantomBitcoin = {
  isPhantom?: boolean;
  requestAccounts: () => Promise<BtcAccount[]>;
};

type PhantomSui = {
  isPhantom?: boolean;
  requestAccount: () => Promise<{
    address?: string;
    publicKey?: { toString: () => string } | string;
  }>;
};

type PhantomWindowApi = {
  solana?: PhantomSolana;
  ethereum?: PhantomEthereum;
  bitcoin?: PhantomBitcoin;
  sui?: PhantomSui;
};

function getPhantomApi(): PhantomWindowApi | null {
  if (typeof window === "undefined") return null;
  const p = (window as Window & { phantom?: PhantomWindowApi }).phantom;
  return p ?? null;
}

function pushAccount(
  accounts: MultichainAccounts,
  entry: {
    ecosystem: MultichainAccounts["all"][number]["ecosystem"];
    scope: string;
    address: string;
  },
) {
  let address = entry.address.trim();
  if (!address) return;

  // Never store Sui-length 0x…64 as EVM (Phantom sometimes mislabels).
  if (entry.ecosystem === "eip155") {
    if (!isValidEvmAddress(address)) return;
    address = address.toLowerCase();
  } else if (entry.ecosystem === "sui") {
    if (!address.startsWith("0x")) address = `0x${address}`;
    if (isValidEvmAddress(address)) return;
  }

  const key = `${entry.scope}:${address}`;
  if (accounts.all.some((a) => `${a.scope}:${a.address}` === key)) return;

  accounts.all.push({
    ecosystem: entry.ecosystem,
    scope: entry.scope,
    address,
    caip10: `${entry.scope}:${address}`,
  });
  const list = accounts.byScope[entry.scope] ?? [];
  if (!list.includes(address)) accounts.byScope[entry.scope] = [...list, address];

  if (entry.ecosystem === "eip155") {
    if (!accounts.evm.includes(address)) accounts.evm.push(address);
    if (entry.scope === MULTICHAIN_SCOPES.robinhood) {
      if (!accounts.robinhood.includes(address)) {
        accounts.robinhood.push(address);
      }
    }
  } else if (entry.ecosystem === "solana") {
    if (!accounts.solana.includes(address)) accounts.solana.push(address);
  } else if (entry.ecosystem === "bip122") {
    if (!accounts.bitcoin.includes(address)) accounts.bitcoin.push(address);
  } else if (entry.ecosystem === "sui") {
    if (!accounts.sui.includes(address)) accounts.sui.push(address);
  }
}

function addEvmAddress(accounts: MultichainAccounts, address: string) {
  if (!isValidEvmAddress(address)) return;
  const lower = address.toLowerCase();
  pushAccount(accounts, {
    ecosystem: "eip155",
    scope: MULTICHAIN_SCOPES.ethereum,
    address: lower,
  });
  pushAccount(accounts, {
    ecosystem: "eip155",
    scope: MULTICHAIN_SCOPES.robinhood,
    address: lower,
  });
}

type StandardConnectFeature = {
  connect: (input?: {
    silent?: boolean;
  }) => Promise<{ accounts: ReadonlyArray<{ address: string }> }>;
};

type StandardDisconnectFeature = {
  disconnect: () => Promise<void>;
};

/** Phantom-only Wallet Standard entries (never MetaMask / other wallets). */
function phantomStandardWallets() {
  try {
    const { get } = getWallets();
    return get().filter(
      (w) => /phantom/i.test(w.name) && !/metamask/i.test(w.name),
    );
  } catch {
    return [];
  }
}

/** Already-authorized Phantom Solana accounts from Wallet Standard. */
function solanaFromWalletStandard(): string[] {
  const addrs: string[] = [];
  for (const wallet of phantomStandardWallets()) {
    for (const acc of wallet.accounts) {
      if (typeof acc.address === "string" && acc.address.length >= 32) {
        addrs.push(acc.address);
      }
    }
  }
  return [...new Set(addrs)];
}

/**
 * Interactive Phantom Solana connect via Wallet Standard.
 * Returns every account Phantom authorizes (usually 1 — Phantom has no
 * MetaMask-style multi-select for Solana).
 */
async function connectPhantomSolanaStandard(): Promise<string[]> {
  for (const wallet of phantomStandardWallets()) {
    const connectFeat = wallet.features["standard:connect"] as
      | StandardConnectFeature
      | undefined;
    if (!connectFeat?.connect) continue;

    const disconnectFeat = wallet.features["standard:disconnect"] as
      | StandardDisconnectFeature
      | undefined;
    try {
      await disconnectFeat?.disconnect?.();
    } catch {
      /* ignore */
    }

    try {
      const { accounts } = await connectFeat.connect();
      const addrs = [
        ...new Set(
          accounts
            .map((a) => a.address)
            .filter((a) => typeof a === "string" && a.length >= 32),
        ),
      ];
      if (addrs.length > 0) return addrs;
    } catch (err) {
      console.warn("Phantom Wallet Standard connect failed:", err);
    }
  }
  return [];
}

export function isPhantomInstalled(): boolean {
  const p = getPhantomApi();
  return Boolean(
    p?.solana?.isPhantom || p?.ethereum?.isPhantom || p?.bitcoin?.isPhantom,
  );
}

/** Current active Phantom Solana pubkey (no prompt). */
export function getActivePhantomSolana(): string | null {
  const pk = getPhantomApi()?.solana?.publicKey?.toString();
  return pk || null;
}

async function revokePhantomEvmPermissions(eth: PhantomEthereum | undefined) {
  if (!eth?.request) return;
  try {
    await eth.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* Phantom / older builds may not support revoke */
  }
}

/**
 * Phantom-only connect (never MetaMask).
 *
 * Important: Phantom’s Solana API does **not** offer MetaMask-style
 * “select all accounts” checkboxes. Connect returns the active Solana account
 * (sometimes a few already-authorized ones via Wallet Standard). Extra wallets
 * must be collected by switching accounts in Phantom — we auto-add each one.
 */
async function connectViaInjectedProviders(): Promise<MultichainAccounts> {
  const accounts = emptyAccounts();
  accounts.source = "phantom";
  const phantom = getPhantomApi();
  if (!phantom) {
    throw new Error("Phantom not found — install the Phantom extension and retry.");
  }

  // 1) Wallet Standard (Phantom only) — collect every authorized Solana account.
  const fromStandard = await connectPhantomSolanaStandard();
  for (const addr of fromStandard) {
    pushAccount(accounts, {
      ecosystem: "solana",
      scope: MULTICHAIN_SCOPES.solana,
      address: addr,
    });
  }

  // 2) Injected Solana fallback if Wallet Standard returned nothing.
  if (accounts.solana.length === 0 && phantom.solana?.isPhantom) {
    try {
      try {
        await phantom.solana.disconnect?.();
      } catch {
        /* ignore */
      }
      const resp = await phantom.solana.connect({ onlyIfTrusted: false });
      const pk = resp.publicKey.toString();
      if (pk) {
        pushAccount(accounts, {
          ecosystem: "solana",
          scope: MULTICHAIN_SCOPES.solana,
          address: pk,
        });
      }
    } catch (err) {
      console.warn("Phantom Solana connect failed:", err);
    }
  }

  // Merge any other already-authorized Phantom Solana keys.
  for (const addr of solanaFromWalletStandard()) {
    pushAccount(accounts, {
      ecosystem: "solana",
      scope: MULTICHAIN_SCOPES.solana,
      address: addr,
    });
  }

  // 3) Phantom EVM (separate from Solana multi-wallet collect).
  if (phantom.ethereum?.isPhantom) {
    try {
      await revokePhantomEvmPermissions(phantom.ethereum);
      try {
        await phantom.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        /* older Phantom */
      }
      const requested = (await phantom.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      let permitted: string[] = [];
      try {
        permitted = (await phantom.ethereum.request({
          method: "eth_accounts",
        })) as string[];
      } catch {
        permitted = [];
      }
      for (const addr of [...(requested ?? []), ...(permitted ?? [])]) {
        if (addr) addEvmAddress(accounts, addr);
      }
    } catch (err) {
      console.warn("Phantom Ethereum connect failed:", err);
    }
  }

  if (phantom.bitcoin?.isPhantom) {
    try {
      const btcAccounts = await phantom.bitcoin.requestAccounts();
      for (const acc of btcAccounts ?? []) {
        if (!acc?.address) continue;
        pushAccount(accounts, {
          ecosystem: "bip122",
          scope: MULTICHAIN_SCOPES.bitcoin,
          address: acc.address,
        });
      }
    } catch (err) {
      console.warn("Phantom Bitcoin connect failed:", err);
    }
  }

  if (phantom.sui?.isPhantom) {
    try {
      const resp = await phantom.sui.requestAccount();
      const addr =
        resp.address ||
        (typeof resp.publicKey === "string"
          ? resp.publicKey
          : resp.publicKey?.toString());
      if (addr) {
        // Sui addresses are 32-byte (64 hex) — never treat as EVM.
        const normalized = addr.startsWith("0x") ? addr : `0x${addr}`;
        if (isValidEvmAddress(normalized)) {
          // Extremely unlikely for Sui; skip misclassify.
        } else {
          pushAccount(accounts, {
            ecosystem: "sui",
            scope: MULTICHAIN_SCOPES.sui,
            address: normalized,
          });
        }
      }
    } catch (err) {
      console.warn("Phantom Sui connect failed:", err);
    }
  }

  if (accounts.all.length === 0) {
    throw new Error(
      "Phantom connected but returned no accounts. Unlock Phantom and approve the connection.",
    );
  }
  return accounts;
}

async function enrichSilent(
  accounts: MultichainAccounts,
): Promise<MultichainAccounts> {
  const phantom = getPhantomApi();
  if (!phantom) return accounts;

  for (const addr of solanaFromWalletStandard()) {
    pushAccount(accounts, {
      ecosystem: "solana",
      scope: MULTICHAIN_SCOPES.solana,
      address: addr,
    });
  }

  if (phantom.solana?.publicKey) {
    pushAccount(accounts, {
      ecosystem: "solana",
      scope: MULTICHAIN_SCOPES.solana,
      address: phantom.solana.publicKey.toString(),
    });
  }

  if (phantom.ethereum) {
    try {
      const addrs = (await phantom.ethereum.request({
        method: "eth_accounts",
      })) as string[];
      for (const addr of addrs ?? []) {
        if (addr) addEvmAddress(accounts, addr);
      }
    } catch {
      /* ignore */
    }
  }

  // Retry Bitcoin / Sui — first connect often rejects or times out.
  if (phantom.bitcoin?.isPhantom && accounts.bitcoin.length === 0) {
    try {
      const btcAccounts = await phantom.bitcoin.requestAccounts();
      for (const acc of btcAccounts ?? []) {
        if (!acc?.address) continue;
        pushAccount(accounts, {
          ecosystem: "bip122",
          scope: MULTICHAIN_SCOPES.bitcoin,
          address: acc.address,
        });
      }
    } catch {
      /* user declined or unavailable */
    }
  }

  if (phantom.sui?.isPhantom && accounts.sui.length === 0) {
    try {
      const resp = await phantom.sui.requestAccount();
      const addr =
        resp.address ||
        (typeof resp.publicKey === "string"
          ? resp.publicKey
          : resp.publicKey?.toString());
      if (addr) {
        const normalized = addr.startsWith("0x") ? addr : `0x${addr}`;
        pushAccount(accounts, {
          ecosystem: "sui",
          scope: MULTICHAIN_SCOPES.sui,
          address: normalized,
        });
      }
    } catch {
      /* user declined or unavailable */
    }
  }

  return accounts;
}

/**
 * Connect Phantom only (never MetaMask). Discovers Solana + optional EVM/BTC/Sui
 * from `window.phantom`.
 */
export async function createPhantomSession(): Promise<MultichainAccounts> {
  if (typeof window === "undefined") {
    throw new Error("Phantom connect only works in the browser");
  }
  if (!isPhantomInstalled()) {
    throw new Error(
      "Phantom not found. Install the Phantom extension, then retry.",
    );
  }

  // Phantom extension only — do not fall back to a generic injected wallet
  // (that can accidentally open MetaMask).
  const injected = await connectViaInjectedProviders();
  return enrichSilent(injected);
}

/**
 * Subscribe to Phantom account switches so we can collect many wallets
 * (switch accounts in Phantom → we auto-add each one, up to 100).
 */
export function subscribePhantomAccountChanges(handlers: {
  onSolana?: (address: string) => void;
  onEvm?: (addresses: string[]) => void;
}): () => void {
  const phantom = getPhantomApi();
  if (!phantom) return () => undefined;

  const onSol = (publicKey: unknown) => {
    if (!publicKey) return;
    const addr =
      typeof publicKey === "string"
        ? publicKey
        : typeof (publicKey as { toString?: () => string }).toString ===
            "function"
          ? (publicKey as { toString: () => string }).toString()
          : null;
    if (addr) handlers.onSolana?.(addr);
  };

  const onEth = (addrs: unknown) => {
    if (!Array.isArray(addrs)) return;
    const list = addrs.filter(
      (a): a is string => typeof a === "string" && isValidEvmAddress(a),
    );
    if (list.length) handlers.onEvm?.(list.map((a) => a.toLowerCase()));
  };

  phantom.solana?.on?.("accountChanged", onSol);
  phantom.ethereum?.on?.("accountsChanged", onEth);

  return () => {
    phantom.solana?.off?.("accountChanged", onSol);
    phantom.solana?.removeListener?.("accountChanged", onSol);
    phantom.ethereum?.removeListener?.("accountsChanged", onEth);
  };
}

/** Prompt Phantom again and return the currently selected Solana address. */
export async function requestActivePhantomSolana(): Promise<string | null> {
  const sol = getPhantomApi()?.solana;
  if (!sol?.isPhantom) return null;
  try {
    try {
      await sol.disconnect?.();
    } catch {
      /* ignore */
    }
    const resp = await sol.connect({ onlyIfTrusted: false });
    return resp.publicKey.toString();
  } catch {
    return sol.publicKey?.toString() ?? null;
  }
}

export async function disconnectPhantom(): Promise<void> {
  const phantom = getPhantomApi();
  try {
    await phantom?.solana?.disconnect?.();
  } catch {
    /* ignore */
  }
  await revokePhantomEvmPermissions(phantom?.ethereum);
}

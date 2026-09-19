import { isValidEvmAddress } from "@/lib/balances";
import { getMetaMaskProvider } from "./provider";
import {
  connectMmMultichainSession,
  disconnectMmMultichain,
  getMmMultichainSession,
} from "./mm-client";
import {
  accountsFromSessionScopes,
  buildOptionalScopes,
  emptyAccounts,
  MULTICHAIN_SCOPES,
  type MultichainAccounts,
} from "./scopes";
import { requestMetaMaskSolanaAccounts } from "./solana-auto";

function mergeSolanaIntoAccounts(
  accounts: MultichainAccounts,
  solAddrs: string[],
): MultichainAccounts {
  if (solAddrs.length === 0) return accounts;
  const scope = MULTICHAIN_SCOPES.solana;
  const next: MultichainAccounts = {
    ...accounts,
    solana: [...accounts.solana],
    all: [...accounts.all],
    byScope: { ...accounts.byScope },
  };
  for (const address of solAddrs) {
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
  if (next.source === "evm-fallback" && next.solana.length > 0) {
    next.source = "multichain";
  }
  return next;
}

function mergeAccounts(
  base: MultichainAccounts,
  extra: MultichainAccounts,
): MultichainAccounts {
  let next = { ...base };
  for (const entry of extra.all) {
    const key = `${entry.scope}:${entry.address}`;
    if (next.all.some((a) => `${a.scope}:${a.address}` === key)) continue;
    next = {
      ...next,
      all: [...next.all, entry],
      byScope: { ...next.byScope },
      evm: [...next.evm],
      robinhood: [...next.robinhood],
      solana: [...next.solana],
      bitcoin: [...next.bitcoin],
      tron: [...next.tron],
      sui: [...next.sui],
      other: [...next.other],
    };
    const list = next.byScope[entry.scope] ?? [];
    if (!list.includes(entry.address)) {
      next.byScope[entry.scope] = [...list, entry.address];
    }
    if (entry.ecosystem === "eip155") {
      const addr = entry.address.toLowerCase();
      if (entry.scope === MULTICHAIN_SCOPES.robinhood) {
        if (!next.robinhood.includes(addr)) next.robinhood.push(addr);
      }
      if (!next.evm.includes(addr)) next.evm.push(addr);
    } else if (entry.ecosystem === "solana") {
      if (!next.solana.includes(entry.address)) next.solana.push(entry.address);
    } else if (entry.ecosystem === "bip122") {
      if (!next.bitcoin.includes(entry.address)) {
        next.bitcoin.push(entry.address);
      }
    } else if (entry.ecosystem === "tron") {
      if (!next.tron.includes(entry.address)) next.tron.push(entry.address);
    } else if (entry.ecosystem === "sui") {
      if (!next.sui.includes(entry.address)) next.sui.push(entry.address);
    } else {
      next.other.push(entry);
    }
  }
  if (extra.source === "multichain" || extra.source === "phantom") {
    next.source = extra.source;
  }
  return next;
}

function mergeEvmAddresses(
  accounts: MultichainAccounts,
  addrs: string[],
): MultichainAccounts {
  const ethScope = MULTICHAIN_SCOPES.ethereum;
  const next: MultichainAccounts = {
    ...accounts,
    evm: [...accounts.evm],
    all: [...accounts.all],
    byScope: { ...accounts.byScope },
  };
  for (const addr of addrs) {
    if (!addr) continue;
    const lower = addr.toLowerCase();
    if (next.evm.includes(lower)) continue;
    next.evm.push(lower);
    next.all.push({
      ecosystem: "eip155",
      scope: ethScope,
      address: lower,
      caip10: `${ethScope}:${lower}`,
    });
    const list = next.byScope[ethScope] ?? [];
    if (!list.includes(lower)) next.byScope[ethScope] = [...list, lower];
  }
  return next;
}

type SessionResult = {
  sessionScopes?: Record<
    string,
    { accounts?: string[]; methods?: string[]; notifications?: string[] }
  >;
};

async function requireMetaMask() {
  const provider = await getMetaMaskProvider();
  if (!provider) {
    throw new Error(
      "MetaMask not found. Another wallet (e.g. Temple) may be capturing the page — install/enable MetaMask, or disable other wallet extensions and retry.",
    );
  }
  return provider;
}

async function readPermittedEvm(): Promise<string[]> {
  const provider = await getMetaMaskProvider();
  if (!provider) return [];
  try {
    const permitted = (await provider.request({
      method: "eth_accounts",
      params: [],
    })) as string[];
    return [...new Set((permitted ?? []).map((a) => a.toLowerCase()))];
  } catch {
    return [];
  }
}

/**
 * After a session exists, pull every ecosystem MetaMask can expose without
 * asking the user to paste addresses.
 */
async function autoEnrichAccounts(
  accounts: MultichainAccounts,
  opts?: { interactiveSolana?: boolean },
): Promise<MultichainAccounts> {
  let next = accounts;

  // Pull any accounts that arrived after connect (session settle).
  try {
    const session = await getMmMultichainSession();
    if (session?.sessionScopes) {
      next = mergeAccounts(
        next,
        accountsFromSessionScopes(session.sessionScopes),
      );
    }
  } catch {
    /* ignore */
  }

  try {
    const provider = await getMetaMaskProvider();
    if (provider) {
      const legacy = (await provider.request({
        method: "wallet_getSession",
        params: [],
      })) as SessionResult;
      if (legacy?.sessionScopes) {
        next = mergeAccounts(
          next,
          accountsFromSessionScopes(legacy.sessionScopes),
        );
      }
    }
  } catch {
    /* ignore */
  }

  const evm = await readPermittedEvm();
  if (evm.length > 0) next = mergeEvmAddresses(next, evm);

  // Solana via Wallet Standard — part of the same Connect click when needed.
  if (next.solana.length === 0) {
    try {
      const sol = await requestMetaMaskSolanaAccounts({
        silentFirst: opts?.interactiveSolana === false,
      });
      next = mergeSolanaIntoAccounts(next, sol.addresses);
    } catch (err) {
      console.warn("Solana auto-discover failed:", err);
    }
  }

  return next;
}

async function revokeEvmAccountPermissions(
  provider: { request: (args: { method: string; params?: unknown }) => Promise<unknown> },
) {
  try {
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* older MetaMask */
  }
}

export async function createMultichainSession(): Promise<MultichainAccounts> {
  // Drop prior permissions first so Connect always shows the account picker.
  try {
    await revokeMultichainSession();
  } catch {
    /* ignore */
  }
  try {
    const provider = await getMetaMaskProvider();
    if (provider) await revokeEvmAccountPermissions(provider);
  } catch {
    /* ignore */
  }

  // 1) MetaMask Connect Multichain — single approval for EVM + Solana (+ BTC/Tron).
  try {
    const session = await connectMmMultichainSession({ force: true });
    let accounts = accountsFromSessionScopes(session?.sessionScopes);
    if (accounts.all.length > 0 || (await readPermittedEvm()).length > 0) {
      if (accounts.all.length === 0) {
        accounts = emptyAccounts();
        accounts.source = "evm-fallback";
      }
      accounts = await autoEnrichAccounts(accounts, {
        interactiveSolana: true,
      });
      if (accounts.all.length > 0) return accounts;
    }
  } catch (err) {
    console.warn("MetaMask Connect Multichain failed, trying legacy:", err);
  }

  // 2) Legacy CAIP-25 on the injected provider.
  const provider = await requireMetaMask();
  const optionalScopes = buildOptionalScopes();
  const sessionAttempts = [
    {
      optionalScopes,
      sessionProperties: {
        "eip1193-compatible": true,
        solana_accountChanged_notifications: true,
        tron_accountChanged_notifications: true,
        bip122_accountChanged_notifications: true,
      },
    },
    { optionalScopes },
  ];

  for (const params of sessionAttempts) {
    try {
      const result = (await provider.request({
        method: "wallet_createSession",
        params,
      })) as SessionResult;

      let accounts = accountsFromSessionScopes(result.sessionScopes);
      if (accounts.all.length > 0) {
        return autoEnrichAccounts(accounts, { interactiveSolana: true });
      }
    } catch (err) {
      console.warn("wallet_createSession attempt failed:", err);
    }
  }

  // 3) EIP-1193 EVM fallback + automatic Solana / Robinhood from EVM set.
  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* older builds */
  }

  const requested = (await provider.request({
    method: "eth_requestAccounts",
    params: [],
  })) as string[];

  let accounts = emptyAccounts();
  accounts.source = "evm-fallback";
  accounts = mergeEvmAddresses(accounts, [
    ...(requested ?? []),
    ...(await readPermittedEvm()),
  ]);

  if (accounts.all.length === 0) {
    throw new Error("MetaMask connected but returned no accounts");
  }

  return autoEnrichAccounts(accounts, { interactiveSolana: true });
}

/** Silent re-discovery after connect (no paste / no extra buttons). */
export async function refreshDiscoveredAccounts(
  current?: MultichainAccounts,
): Promise<MultichainAccounts> {
  let base = current ?? emptyAccounts();
  try {
    const session = await getMmMultichainSession();
    if (session?.sessionScopes) {
      base = mergeAccounts(
        base,
        accountsFromSessionScopes(session.sessionScopes),
      );
    }
  } catch {
    /* ignore */
  }
  return autoEnrichAccounts(base, { interactiveSolana: false });
}

/** @deprecated Prefer automatic discovery on Connect — kept for rare retries. */
export async function requestSolanaAccounts(): Promise<string[]> {
  const { addresses, error } = await requestMetaMaskSolanaAccounts({
    silentFirst: false,
  });
  if (error && addresses.length === 0) {
    throw new Error(error);
  }
  return addresses;
}

/** @deprecated Robinhood is auto-linked from EVM + session scopes on Connect. */
export async function requestRobinhoodAccounts(): Promise<string[]> {
  const refreshed = await refreshDiscoveredAccounts();
  return refreshed.robinhood.length > 0
    ? refreshed.robinhood
    : refreshed.evm;
}

/** Prompt MetaMask again so the user can approve additional accounts. */
export async function requestMoreEvmAccounts(): Promise<string[]> {
  const { evm } = await requestAllWalletAddresses({ revokeFirst: true });
  return evm;
}

async function evmFromWalletPermissions(
  provider: {
    request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  },
): Promise<string[]> {
  try {
    const perms = (await provider.request({
      method: "wallet_getPermissions",
      params: [],
    })) as Array<{
      parentCapability?: string;
      caveats?: Array<{ type?: string; name?: string; value?: unknown }>;
    }>;
    const out: string[] = [];
    for (const perm of perms ?? []) {
      if (
        perm.parentCapability &&
        perm.parentCapability !== "eth_accounts"
      ) {
        continue;
      }
      for (const caveat of perm.caveats ?? []) {
        const kind = caveat.type || caveat.name;
        if (kind !== "restrictReturnedAccounts" || !Array.isArray(caveat.value)) {
          continue;
        }
        for (const value of caveat.value) {
          if (typeof value === "string" && isValidEvmAddress(value)) {
            out.push(value.toLowerCase());
          }
        }
      }
    }
    return [...new Set(out)];
  } catch {
    return [];
  }
}

/**
 * Ask the connected wallet (MetaMask) for every account it can expose:
 * EVM account picker + Solana. The wallet UI is required — select all
 * accounts, then confirm.
 */
export async function requestAllWalletAddresses(opts?: {
  revokeFirst?: boolean;
}): Promise<{ evm: string[]; solana: string[] }> {
  const provider = await getMetaMaskProvider();
  if (!provider) {
    const sol = await requestMetaMaskSolanaAccounts({ silentFirst: false });
    return { evm: [], solana: sol.addresses };
  }

  if (opts?.revokeFirst) {
    await revokeEvmAccountPermissions(provider);
  }

  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* user rejected or older build */
  }

  let requested: string[] = [];
  try {
    requested = ((await provider.request({
      method: "eth_requestAccounts",
      params: [],
    })) as string[]) ?? [];
  } catch {
    requested = [];
  }

  const fromPerms = await evmFromWalletPermissions(provider);
  const fromSession = await readPermittedEvm();
  const evm = [
    ...new Set(
      [...fromPerms, ...fromSession, ...requested]
        .map((a) => a.toLowerCase())
        .filter(isValidEvmAddress),
    ),
  ];

  const sol = await requestMetaMaskSolanaAccounts({ silentFirst: false });
  return { evm, solana: sol.addresses };
}

export async function getMultichainSession(): Promise<MultichainAccounts> {
  try {
    const session = await getMmMultichainSession();
    let accounts = accountsFromSessionScopes(session?.sessionScopes);
    if (accounts.all.length > 0) {
      return autoEnrichAccounts(accounts, { interactiveSolana: false });
    }
  } catch {
    /* ignore */
  }

  const provider = await getMetaMaskProvider();
  if (!provider) return emptyAccounts();

  try {
    const result = (await provider.request({
      method: "wallet_getSession",
      params: [],
    })) as SessionResult;
    const fromSession = accountsFromSessionScopes(result.sessionScopes);
    if (fromSession.all.length > 0) {
      return autoEnrichAccounts(fromSession, { interactiveSolana: false });
    }
  } catch {
    // ignore
  }

  try {
    const evmAccounts = (await provider.request({
      method: "eth_accounts",
      params: [],
    })) as string[];
    let accounts = emptyAccounts();
    accounts.source = "evm-fallback";
    accounts = mergeEvmAddresses(accounts, evmAccounts ?? []);
    if (accounts.all.length === 0) return accounts;
    return autoEnrichAccounts(accounts, { interactiveSolana: false });
  } catch {
    return emptyAccounts();
  }
}

export async function revokeMultichainSession(): Promise<void> {
  await disconnectMmMultichain();
  const provider = await getMetaMaskProvider();
  if (!provider) return;
  try {
    await provider.request({ method: "wallet_revokeSession", params: [] });
  } catch {
    // ignore
  }
  await revokeEvmAccountPermissions(provider);
}

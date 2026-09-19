"use client";

import { createSolanaClient } from "@metamask/connect-solana";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { getMetaMaskProvider } from "./provider";
import { isValidSolanaAddress, normalizeSolanaAddress } from "@/lib/solana-address";

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type ConnectFeature = {
  connect: (input?: {
    silent?: boolean;
  }) => Promise<{ accounts: ReadonlyArray<{ address: string }> }>;
};

let clientPromise: Promise<Awaited<ReturnType<typeof createSolanaClient>>> | null =
  null;

function isMetaMaskWallet(wallet: Wallet): boolean {
  return /metamask/i.test(wallet.name) && !/temple/i.test(wallet.name);
}

function accountsFromWallet(wallet: Wallet): string[] {
  return collectAddresses(
    wallet.accounts.map((a) => a.address),
  );
}

function collectAddresses(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      const addr = normalizeSolanaAddress(v);
      if (isValidSolanaAddress(addr)) out.push(addr);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.address === "string") visit(o.address);
      if (o.accounts) visit(o.accounts);
      if (o.result) visit(o.result);
      if (o.pubkey) visit(String(o.pubkey));
      if (o.sessionScopes && typeof o.sessionScopes === "object") {
        for (const [scope, data] of Object.entries(
          o.sessionScopes as Record<string, { accounts?: unknown }>,
        )) {
          if (scope.startsWith("solana:")) visit(data?.accounts);
        }
      }
    }
  };
  visit(value);
  return [...new Set(out)];
}

async function solanaFromInjectedProvider(): Promise<string[]> {
  const provider = await getMetaMaskProvider();
  if (!provider) return [];

  const attempts: Array<{ method: string; params?: unknown }> = [
    {
      method: "wallet_invokeMethod",
      params: {
        scope: SOLANA_MAINNET,
        request: { method: "getAccounts", params: {} },
      },
    },
    {
      method: "wallet_invokeMethod",
      params: {
        scope: SOLANA_MAINNET,
        request: { method: "get", params: {} },
      },
    },
    { method: "wallet_getSession", params: [] },
    { method: "solana_requestAccounts", params: [] },
  ];

  for (const req of attempts) {
    try {
      const result = await provider.request(req);
      const addrs = collectAddresses(result);
      if (addrs.length > 0) return addrs;
    } catch {
      /* try next shape */
    }
  }
  return [];
}

async function requestSolanaSession(): Promise<string[]> {
  const provider = await getMetaMaskProvider();
  if (!provider) return [];
  try {
    const result = await provider.request({
      method: "wallet_createSession",
      params: {
        optionalScopes: {
          [SOLANA_MAINNET]: {
            methods: [
              "signMessage",
              "signTransaction",
              "signAndSendTransaction",
              "getAccounts",
            ],
            notifications: [],
          },
        },
      },
    });
    return collectAddresses(result);
  } catch {
    return [];
  }
}

async function ensureSolanaClient() {
  if (!clientPromise) {
    clientPromise = createSolanaClient({
      dapp: {
        name: "Find Hidden Money",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost:3000",
      },
      analytics: { enabled: false },
      api: {
        supportedNetworks: {
          mainnet: "https://api.mainnet-beta.solana.com",
        },
      },
    });
  }
  return clientPromise;
}

function findRegisteredMetaMask(): Wallet | null {
  try {
    const { get } = getWallets();
    return get().find(isMetaMaskWallet) ?? null;
  } catch {
    return null;
  }
}

/**
 * Automatically request Solana accounts from MetaMask via Wallet Standard
 * (@metamask/connect-solana). No address paste required when Multichain Solana
 * is available in the user's MetaMask build.
 */
export async function requestMetaMaskSolanaAccounts(opts?: {
  /** Prefer silent reconnect when accounts already authorized. */
  silentFirst?: boolean;
}): Promise<{ addresses: string[]; error?: string }> {
  if (typeof window === "undefined") {
    return { addresses: [], error: "Not in browser" };
  }

  try {
    await ensureSolanaClient();
  } catch (err) {
    return {
      addresses: [],
      error:
        err instanceof Error
          ? err.message
          : "Failed to init MetaMask Solana client",
    };
  }

  const injected = await solanaFromInjectedProvider();
  if (injected.length > 0 && opts?.silentFirst !== false) {
    return { addresses: injected };
  }

  const wallet = findRegisteredMetaMask() ?? (await ensureSolanaClient()).getWallet();
  const existing = [
    ...new Set([...injected, ...accountsFromWallet(wallet)]),
  ];
  if (existing.length > 0 && opts?.silentFirst !== false) {
    return { addresses: existing };
  }

  const feature = wallet.features["standard:connect"] as
    | ConnectFeature
    | undefined;
  if (!feature?.connect) {
    if (opts?.silentFirst === true) {
      return {
        addresses: existing,
        error:
          "MetaMask Solana connect unavailable — update MetaMask or enable Solana in the wallet.",
      };
    }
    const fromSession = await requestSolanaSession();
    if (fromSession.length > 0) return { addresses: fromSession };
    return {
      addresses: existing,
      error:
        "MetaMask Solana connect unavailable — update MetaMask or enable Solana in the wallet.",
    };
  }

  try {
    if (opts?.silentFirst !== false) {
      try {
        const silent = await feature.connect({ silent: true });
        const addrs = collectAddresses(silent.accounts.map((a) => a.address));
        if (addrs.length > 0) return { addresses: addrs };
      } catch {
        /* fall through */
      }
      const again = await solanaFromInjectedProvider();
      if (again.length > 0) return { addresses: again };
      if (opts?.silentFirst === true) {
        return {
          addresses: existing,
          error: existing.length === 0 ? "Solana not authorized yet." : undefined,
        };
      }
    }

    const { accounts } = await feature.connect();
    const addresses = collectAddresses([
      ...existing,
      ...accounts.map((a) => a.address),
      ...(await solanaFromInjectedProvider()),
    ]);
    return { addresses };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/reject|denied|4001/i.test(msg)) {
      return { addresses: existing, error: "Solana connect rejected in MetaMask." };
    }
    return {
      addresses: existing,
      error: msg || "Solana connect failed",
    };
  }
}

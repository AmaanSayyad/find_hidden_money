"use client";

import {
  createMultichainClient,
  type MultichainCore,
  type Scope,
  type SessionData,
} from "@metamask/connect-multichain";
import { MULTICHAIN_SCOPES } from "./scopes";

let clientPromise: Promise<MultichainCore> | null = null;

/** Public RPCs so Connect Multichain can register every network we care about. */
function supportedNetworks(): Record<string, string> {
  return {
    [MULTICHAIN_SCOPES.ethereum]: "https://cloudflare-eth.com",
    [MULTICHAIN_SCOPES.linea]: "https://rpc.linea.build",
    [MULTICHAIN_SCOPES.bnb]: "https://bsc-dataseed.binance.org",
    [MULTICHAIN_SCOPES.polygon]: "https://polygon-rpc.com",
    [MULTICHAIN_SCOPES.arbitrum]: "https://arb1.arbitrum.io/rpc",
    [MULTICHAIN_SCOPES.optimism]: "https://mainnet.optimism.io",
    [MULTICHAIN_SCOPES.base]: "https://mainnet.base.org",
    [MULTICHAIN_SCOPES.avalanche]: "https://api.avax.network/ext/bc/C/rpc",
    [MULTICHAIN_SCOPES.monads]: "https://rpc.monad.xyz",
    [MULTICHAIN_SCOPES.sei]: "https://evm-rpc.sei-apis.com",
    [MULTICHAIN_SCOPES.hyperevm]: "https://rpc.hyperliquid.xyz/evm",
    [MULTICHAIN_SCOPES.rootstock]: "https://public-node.rsk.co",
    [MULTICHAIN_SCOPES.gnosis]: "https://rpc.gnosischain.com",
    [MULTICHAIN_SCOPES.mantle]: "https://rpc.mantle.xyz",
    [MULTICHAIN_SCOPES.mode]: "https://mainnet.mode.network",
    [MULTICHAIN_SCOPES.celo]: "https://forno.celo.org",
    [MULTICHAIN_SCOPES.scroll]: "https://rpc.scroll.io",
    [MULTICHAIN_SCOPES.zksync]: "https://mainnet.era.zksync.io",
    [MULTICHAIN_SCOPES.blast]: "https://rpc.blast.io",
    [MULTICHAIN_SCOPES.unichain]: "https://mainnet.unichain.org",
    [MULTICHAIN_SCOPES.flare]: "https://flare-api.flare.network/ext/C/rpc",
    [MULTICHAIN_SCOPES.fantom]: "https://rpc.ftm.tools",
    [MULTICHAIN_SCOPES.robinhood]: "https://rpc.mainnet.chain.robinhood.com",
    [MULTICHAIN_SCOPES.fraxtal]: "https://rpc.frax.com",
    [MULTICHAIN_SCOPES.solana]: "https://api.mainnet-beta.solana.com",
    [MULTICHAIN_SCOPES.solanaDevnet]: "https://api.devnet.solana.com",
    // Placeholders — MetaMask supplies snap RPCs when it grants these scopes.
    [MULTICHAIN_SCOPES.bitcoin]: "https://mempool.space/api",
    [MULTICHAIN_SCOPES.tron]: "https://api.trongrid.io",
    [MULTICHAIN_SCOPES.tronMainnet]: "https://api.trongrid.io",
  };
}

export function allConnectScopes(): Scope[] {
  return Object.values(MULTICHAIN_SCOPES) as Scope[];
}

export async function getMmMultichainClient(): Promise<MultichainCore> {
  if (!clientPromise) {
    clientPromise = createMultichainClient({
      dapp: {
        name: "Find Hidden Money",
        url:
          typeof window !== "undefined"
            ? window.location.origin
            : "http://localhost:3000",
      },
      api: { supportedNetworks: supportedNetworks() },
      analytics: { enabled: false },
      ui: { preferExtension: true, showInstallModal: true },
    });
  }
  return clientPromise;
}

const SESSION_PROPERTIES = {
  "eip1193-compatible": true,
  solana_accountChanged_notifications: true,
  tron_accountChanged_notifications: true,
  bip122_accountChanged_notifications: true,
} as const;

/**
 * One MetaMask Connect Multichain prompt for EVM + Solana (+ BTC/Tron when
 * the wallet supports those scopes). Returns sessionScopes accounts.
 */
export async function connectMmMultichainSession(opts?: {
  /** Force a fresh permission prompt even if a session exists. */
  force?: boolean;
}): Promise<SessionData | undefined> {
  const client = await getMmMultichainClient();
  await client.connect(
    allConnectScopes(),
    [],
    SESSION_PROPERTIES,
    opts?.force ?? true,
  );
  return client.provider.getSession();
}

export async function getMmMultichainSession(): Promise<SessionData | undefined> {
  try {
    const client = await getMmMultichainClient();
    return await client.provider.getSession();
  } catch {
    return undefined;
  }
}

export async function disconnectMmMultichain(): Promise<void> {
  try {
    const client = await getMmMultichainClient();
    await client.disconnect();
  } catch {
    /* ignore */
  }
}

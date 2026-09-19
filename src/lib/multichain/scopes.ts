/** CAIP-2 scopes MetaMask Multichain may grant (unsupported ones are dropped). */
export const MULTICHAIN_SCOPES = {
  ethereum: "eip155:1",
  linea: "eip155:59144",
  bnb: "eip155:56",
  polygon: "eip155:137",
  arbitrum: "eip155:42161",
  optimism: "eip155:10",
  base: "eip155:8453",
  avalanche: "eip155:43114",
  monads: "eip155:143",
  sei: "eip155:1329",
  hyperevm: "eip155:999",
  rootstock: "eip155:30",
  gnosis: "eip155:100",
  mantle: "eip155:5000",
  mode: "eip155:34443",
  celo: "eip155:42220",
  scroll: "eip155:534352",
  zksync: "eip155:324",
  blast: "eip155:81457",
  unichain: "eip155:130",
  flare: "eip155:14",
  fantom: "eip155:250",
  /** Robinhood Chain — may use a different authorized 0x than Ethereum */
  robinhood: "eip155:4663",
  /** Fraxtal — Frax L2; native gas is frxETH */
  fraxtal: "eip155:252",
  solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  bitcoin: "bip122:000000000019d6689c085ae165831e93",
  tron: "tron:0x2b6653dc",
  tronMainnet: "tron:mainnet",
  sui: "sui:mainnet",
} as const;

const EVM_METHODS = [
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
  "eth_getBalance",
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
];

const EVM_NOTIFICATIONS = ["accountsChanged", "chainChanged", "eth_subscription"];

const SOLANA_METHODS = [
  "signMessage",
  "signTransaction",
  "signAndSendTransaction",
  "signAllTransactions",
  "signIn",
  "getAccounts",
];

const BITCOIN_METHODS = [
  "signMessage",
  "sendBitcoin",
  "getBalance",
  "getAccount",
];

const TRON_METHODS = [
  "signMessage",
  "signTransaction",
  "signAndSendTransaction",
  "getAccounts",
];

export type ScopeObject = {
  methods: string[];
  notifications: string[];
  references?: string[];
};

/** Build optionalScopes for wallet_createSession (MetaMask pre-rewrite CAIP-25). */
export function buildOptionalScopes(): Record<string, ScopeObject> {
  const scopes: Record<string, ScopeObject> = {};

  const evmScopes = [
    MULTICHAIN_SCOPES.ethereum,
    MULTICHAIN_SCOPES.linea,
    MULTICHAIN_SCOPES.bnb,
    MULTICHAIN_SCOPES.polygon,
    MULTICHAIN_SCOPES.arbitrum,
    MULTICHAIN_SCOPES.optimism,
    MULTICHAIN_SCOPES.base,
    MULTICHAIN_SCOPES.avalanche,
    MULTICHAIN_SCOPES.monads,
    MULTICHAIN_SCOPES.sei,
    MULTICHAIN_SCOPES.hyperevm,
    MULTICHAIN_SCOPES.rootstock,
    MULTICHAIN_SCOPES.gnosis,
    MULTICHAIN_SCOPES.mantle,
    MULTICHAIN_SCOPES.mode,
    MULTICHAIN_SCOPES.celo,
    MULTICHAIN_SCOPES.scroll,
    MULTICHAIN_SCOPES.zksync,
    MULTICHAIN_SCOPES.blast,
    MULTICHAIN_SCOPES.unichain,
    MULTICHAIN_SCOPES.flare,
    MULTICHAIN_SCOPES.fantom,
    MULTICHAIN_SCOPES.robinhood,
    MULTICHAIN_SCOPES.fraxtal,
  ];

  // Namespace form — MetaMask may grant many EVM chains under one scope.
  scopes.eip155 = {
    methods: EVM_METHODS,
    notifications: EVM_NOTIFICATIONS,
    references: evmScopes.map((s) => s.split(":")[1]!).filter(Boolean),
  };

  for (const scope of evmScopes) {
    scopes[scope] = { methods: EVM_METHODS, notifications: EVM_NOTIFICATIONS };
  }

  scopes[MULTICHAIN_SCOPES.solana] = {
    methods: SOLANA_METHODS,
    notifications: [],
  };
  scopes[MULTICHAIN_SCOPES.solanaDevnet] = {
    methods: SOLANA_METHODS,
    notifications: [],
  };
  scopes[MULTICHAIN_SCOPES.bitcoin] = {
    methods: BITCOIN_METHODS,
    notifications: [],
  };
  scopes[MULTICHAIN_SCOPES.tron] = {
    methods: TRON_METHODS,
    notifications: [],
  };
  scopes[MULTICHAIN_SCOPES.tronMainnet] = {
    methods: TRON_METHODS,
    notifications: [],
  };

  return scopes;
}

export type Ecosystem =
  | "eip155"
  | "solana"
  | "bip122"
  | "tron"
  | "sui"
  | "other";

export type MultichainAccount = {
  ecosystem: Ecosystem;
  scope: string;
  address: string;
  caip10: string;
};

export type ConnectionSource =
  | "multichain"
  | "evm-fallback"
  | "phantom"
  | "none";

export type MultichainAccounts = {
  evm: string[];
  /**
   * Addresses authorized for Robinhood Chain (eip155:4663).
   * May differ from Ethereum if MetaMask granted a different account for that scope.
   */
  robinhood: string[];
  solana: string[];
  bitcoin: string[];
  tron: string[];
  sui: string[];
  /** CAIP-2 scope → addresses authorized for that exact network. */
  byScope: Record<string, string[]>;
  other: MultichainAccount[];
  all: MultichainAccount[];
  /** How accounts were obtained — evm-fallback means non-EVM was never granted. */
  source: ConnectionSource;
};

export function emptyAccounts(): MultichainAccounts {
  return {
    evm: [],
    robinhood: [],
    solana: [],
    bitcoin: [],
    tron: [],
    sui: [],
    byScope: {},
    other: [],
    all: [],
    source: "none",
  };
}

function isRobinhoodScope(scope: string): boolean {
  const s = scope.toLowerCase();
  return s === "eip155:4663" || s === MULTICHAIN_SCOPES.robinhood;
}

function ecosystemFromScope(scope: string): Ecosystem {
  const ns = scope.split(":")[0]?.toLowerCase() ?? "";
  if (ns === "eip155") return "eip155";
  if (ns === "solana") return "solana";
  if (ns === "bip122") return "bip122";
  if (ns === "tron") return "tron";
  if (ns === "sui") return "sui";
  return "other";
}

/** Parse CAIP-10 account id → address */
export function parseCaip10(caip10: string): {
  scope: string;
  address: string;
} | null {
  const parts = caip10.split(":");
  if (parts.length < 3) return null;
  const address = parts.slice(2).join(":");
  const scope = `${parts[0]}:${parts[1]}`;
  if (!address) return null;
  return { scope, address };
}

type SessionScope = {
  accounts?: string[];
  methods?: string[];
  notifications?: string[];
  references?: string[];
};

function pushScopeAddr(
  byScope: Record<string, string[]>,
  scope: string,
  address: string,
) {
  const list = byScope[scope] ?? [];
  if (!list.includes(address)) list.push(address);
  byScope[scope] = list;
}

export function accountsFromSessionScopes(
  sessionScopes: Record<string, SessionScope> | undefined | null,
): MultichainAccounts {
  const result = emptyAccounts();
  result.source = "multichain";
  if (!sessionScopes) return result;

  const seen = new Set<string>();

  for (const [scope, obj] of Object.entries(sessionScopes)) {
    for (const caip10 of obj.accounts ?? []) {
      const parsed = parseCaip10(caip10);
      if (!parsed) continue;
      const key = `${parsed.scope}:${parsed.address}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const ecosystem = ecosystemFromScope(parsed.scope);
      const entry: MultichainAccount = {
        ecosystem,
        scope: parsed.scope,
        address: parsed.address,
        caip10,
      };
      result.all.push(entry);
      pushScopeAddr(result.byScope, parsed.scope, parsed.address);

      if (ecosystem === "eip155") {
        const addr = parsed.address.toLowerCase();
        const rhScope =
          isRobinhoodScope(scope) || isRobinhoodScope(parsed.scope);
        if (rhScope) {
          if (!result.robinhood.includes(addr)) result.robinhood.push(addr);
        }
        if (!result.evm.includes(addr)) result.evm.push(addr);
      } else if (ecosystem === "solana") {
        if (!result.solana.includes(parsed.address)) {
          result.solana.push(parsed.address);
        }
      } else if (ecosystem === "bip122") {
        if (!result.bitcoin.includes(parsed.address)) {
          result.bitcoin.push(parsed.address);
        }
      } else if (ecosystem === "tron") {
        if (!result.tron.includes(parsed.address)) {
          result.tron.push(parsed.address);
        }
      } else if (ecosystem === "sui") {
        if (!result.sui.includes(parsed.address)) {
          result.sui.push(parsed.address);
        }
      } else {
        result.other.push(entry);
      }
    }
  }

  return result;
}

/** Human label for a CAIP-2 scope (for discovery UI). */
export function labelForScope(scope: string): string {
  const map: Record<string, string> = {
    [MULTICHAIN_SCOPES.ethereum]: "Ethereum",
    [MULTICHAIN_SCOPES.linea]: "Linea",
    [MULTICHAIN_SCOPES.bnb]: "BNB Chain",
    [MULTICHAIN_SCOPES.polygon]: "Polygon",
    [MULTICHAIN_SCOPES.arbitrum]: "Arbitrum",
    [MULTICHAIN_SCOPES.optimism]: "Optimism",
    [MULTICHAIN_SCOPES.base]: "Base",
    [MULTICHAIN_SCOPES.avalanche]: "Avalanche",
    [MULTICHAIN_SCOPES.monads]: "Monad",
    [MULTICHAIN_SCOPES.sei]: "Sei",
    [MULTICHAIN_SCOPES.hyperevm]: "HyperEVM",
    [MULTICHAIN_SCOPES.robinhood]: "Robinhood Chain",
    [MULTICHAIN_SCOPES.fraxtal]: "Fraxtal",
    [MULTICHAIN_SCOPES.solana]: "Solana",
    [MULTICHAIN_SCOPES.bitcoin]: "Bitcoin",
    [MULTICHAIN_SCOPES.tron]: "Tron",
    [MULTICHAIN_SCOPES.tronMainnet]: "Tron",
    [MULTICHAIN_SCOPES.sui]: "Sui",
    [MULTICHAIN_SCOPES.celo]: "Celo",
    [MULTICHAIN_SCOPES.mantle]: "Mantle",
    [MULTICHAIN_SCOPES.mode]: "Mode",
    [MULTICHAIN_SCOPES.zksync]: "zkSync Era",
    [MULTICHAIN_SCOPES.blast]: "Blast",
    [MULTICHAIN_SCOPES.unichain]: "Unichain",
    [MULTICHAIN_SCOPES.flare]: "Flare",
    [MULTICHAIN_SCOPES.gnosis]: "Gnosis",
    [MULTICHAIN_SCOPES.rootstock]: "Rootstock",
  };
  return map[scope] || scope;
}

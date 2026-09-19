import {
  emptyAccounts,
  parseCaip10,
  type Ecosystem,
  type MultichainAccounts,
} from "@/lib/multichain/scopes";
import { isValidEvmAddress } from "@/lib/balances";
import { isValidSolanaAddress } from "@/lib/solana-address";

type AppKitAccountSlice = {
  address?: string;
  caipAddress?: string;
  isConnected?: boolean;
  allAccounts?: Array<{
    address: string;
    caipAddress?: string;
    namespace?: string;
  }>;
};

function ecosystemFromNamespace(ns: string | undefined): Ecosystem {
  if (ns === "eip155") return "eip155";
  if (ns === "solana") return "solana";
  if (ns === "bip122") return "bip122";
  if (ns === "tron") return "tron";
  if (ns === "sui") return "sui";
  return "other";
}

function pushAddress(
  result: MultichainAccounts,
  address: string,
  ecosystem: Ecosystem,
  scope: string,
  caip10: string,
) {
  const key = `${scope}:${address}`;
  if (result.all.some((a) => `${a.scope}:${a.address}` === key)) return;

  result.all.push({ ecosystem, scope, address, caip10 });
  const list = result.byScope[scope] ?? [];
  if (!list.includes(address)) result.byScope[scope] = [...list, address];

  if (ecosystem === "eip155") {
    const lower = address.toLowerCase();
    if (isValidEvmAddress(lower) && !result.evm.includes(lower)) {
      result.evm.push(lower);
    }
  } else if (ecosystem === "solana") {
    if (isValidSolanaAddress(address) && !result.solana.includes(address)) {
      result.solana.push(address);
    }
  } else if (ecosystem === "bip122") {
    if (!result.bitcoin.includes(address)) result.bitcoin.push(address);
  } else if (ecosystem === "tron") {
    if (!result.tron.includes(address)) result.tron.push(address);
  } else if (ecosystem === "sui") {
    if (!result.sui.includes(address)) result.sui.push(address);
  }
}

function ingestSlice(
  result: MultichainAccounts,
  slice: AppKitAccountSlice | undefined,
  fallbackNs: string,
  fallbackScope: string,
) {
  if (!slice?.isConnected && !slice?.address && !slice?.allAccounts?.length) {
    return;
  }

  const rows =
    slice.allAccounts && slice.allAccounts.length > 0
      ? slice.allAccounts
      : slice.address
        ? [
            {
              address: slice.address,
              caipAddress: slice.caipAddress,
              namespace: fallbackNs,
            },
          ]
        : [];

  for (const row of rows) {
    const parsed = row.caipAddress ? parseCaip10(row.caipAddress) : null;
    const scope = parsed?.scope || fallbackScope;
    const address = parsed?.address || row.address;
    if (!address) continue;
    const ns = row.namespace || scope.split(":")[0] || fallbackNs;
    const ecosystem = ecosystemFromNamespace(ns);
    const caip10 = row.caipAddress || `${scope}:${address}`;
    pushAddress(result, address, ecosystem, scope, caip10);
  }
}

export function accountsFromAppKit(slices: {
  evm?: AppKitAccountSlice;
  solana?: AppKitAccountSlice;
  bitcoin?: AppKitAccountSlice;
  tron?: AppKitAccountSlice;
}): MultichainAccounts {
  const result = emptyAccounts();
  result.source = "multichain";
  ingestSlice(result, slices.evm, "eip155", "eip155:1");
  ingestSlice(
    result,
    slices.solana,
    "solana",
    "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  );
  ingestSlice(
    result,
    slices.bitcoin,
    "bip122",
    "bip122:000000000019d6689c085ae165831e93",
  );
  ingestSlice(result, slices.tron, "tron", "tron:0x2b6653dc");
  return result;
}

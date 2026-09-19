/** Monad Testnet — product + tip constants (Metropolis) */

export const MONAD_CHAIN_ID = 10143;
export const MONAD_CHAIN_ID_HEX = "0x279f";

export const MONAD_RPC_URL = "https://testnet-rpc.monad.xyz";
export const MONAD_EXPLORER_URL = "https://testnet.monadexplorer.com";
export const MONAD_FAUCET_URL = "https://faucet.monad.xyz";
export const MONAD_WS_URL = "wss://testnet-rpc.monad.xyz";
export const MONAD_DOCS_URL = "https://docs.monad.xyz";

export const MONAD_NATIVE = {
  symbol: "MON",
  name: "Monad",
  decimals: 18,
} as const;

/** Where Find Hidden Money collects reveal tips (native MON). */
export const MONAD_REVEAL_PASS =
  "0x0FF14768c7598e6F287bfC6451B888c406dfD5Bd" as const;

/**
 * RevealPass on Monad Testnet — records unlocks. All tips go here.
 * https://testnet.monadexplorer.com/address/0x0FF14768c7598e6F287bfC6451B888c406dfD5Bd
 * https://testnet.monadvision.com/address/0x0FF14768c7598e6F287bfC6451B888c406dfD5Bd
 */
export const MONAD_TIP_RECIPIENT = MONAD_REVEAL_PASS;

/** Tip required to unlock token holdings. */
export const MONAD_TIP_AMOUNT = "0.3";
export const MONAD_TIP_AMOUNT_WEI = 300_000_000_000_000_000n; // 0.3 * 1e18

export function monadRpcUrl(): string {
  return process.env.MONAD_RPC_URL?.trim() || MONAD_RPC_URL;
}

export function monadExplorerTx(hash: string): string {
  return `${MONAD_EXPLORER_URL}/tx/${hash}`;
}

export function monadExplorerAddress(address: string): string {
  return `${MONAD_EXPLORER_URL}/address/${address}`;
}

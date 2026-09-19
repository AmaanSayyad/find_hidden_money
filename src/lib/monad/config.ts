/** Monad Mainnet — product + tip constants */

export const MONAD_CHAIN_ID = 143;
export const MONAD_CHAIN_ID_HEX = "0x8f";
export const MONAD_NETWORK_NAME = "Monad";

export const MONAD_RPC_URL = "https://rpc.monad.xyz";
export const MONAD_EXPLORER_URL = "https://monadscan.com";
export const MONAD_FAUCET_URL = "https://monadscan.com";
export const MONAD_WS_URL = "wss://rpc.monad.xyz";
export const MONAD_DOCS_URL = "https://docs.monad.xyz";
export const MONAD_LIVE_URL = "https://www.find-hidden-money.fun";

export const MONAD_NATIVE = {
  symbol: "MON",
  name: "Monad",
  decimals: 18,
} as const;

/** Where Find Hidden Money collects reveal tips (native MON). */
export const MONAD_REVEAL_PASS =
  "0xb8171c4E2002Deea048477D8B337ff27F9a36687" as const;

/**
 * RevealPass on Monad Mainnet — records unlocks. All tips go here.
 * https://monadscan.com/address/0xb8171c4E2002Deea048477D8B337ff27F9a36687
 * https://monadvision.com/address/0xb8171c4E2002Deea048477D8B337ff27F9a36687
 */
export const MONAD_TIP_RECIPIENT = MONAD_REVEAL_PASS;

/** Tip required to unlock token holdings. */
export const MONAD_TIP_AMOUNT = "1";
export const MONAD_TIP_AMOUNT_WEI = 1_000_000_000_000_000_000n; // 1 * 1e18

export function monadRpcUrl(): string {
  return process.env.MONAD_RPC_URL?.trim() || MONAD_RPC_URL;
}

export function monadExplorerTx(hash: string): string {
  return `${MONAD_EXPLORER_URL}/tx/${hash}`;
}

export function monadExplorerAddress(address: string): string {
  return `${MONAD_EXPLORER_URL}/address/${address}`;
}

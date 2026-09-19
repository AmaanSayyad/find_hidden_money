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
export const MONAD_PITCH_DECK_URL =
  "https://docs.google.com/presentation/d/1WE8YuD3uMiGvezz_mtdHm6U-1meZ1P-hcsS65NjVbYY/edit?usp=sharing";
export const MONAD_DEMO_VIDEO_URL =
  "https://x.com/amaanbiz/status/2101301008991441350?s=20";

export const MONAD_NATIVE = {
  symbol: "MON",
  name: "Monad",
  decimals: 18,
} as const;

/** Where Find Hidden Money collects reveal tips (native MON). */
export const MONAD_REVEAL_PASS =
  "0x19F82072e6612156eC5F8b43fa404c3e3Eef9957" as const;

/**
 * RevealPass on Monad Mainnet — records unlocks. 1 MON tips stay on this contract.
 * https://monadscan.com/address/0x19F82072e6612156eC5F8b43fa404c3e3Eef9957
 * https://monadvision.com/address/0x19F82072e6612156eC5F8b43fa404c3e3Eef9957
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

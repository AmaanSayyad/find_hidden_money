import { defineChain } from "viem";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  MONAD_NATIVE,
  MONAD_NETWORK_NAME,
  MONAD_RPC_URL,
} from "./config";

export const monadMainnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: MONAD_NETWORK_NAME,
  nativeCurrency: {
    name: MONAD_NATIVE.name,
    symbol: MONAD_NATIVE.symbol,
    decimals: MONAD_NATIVE.decimals,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Monadscan", url: MONAD_EXPLORER_URL },
  },
  testnet: false,
});

/** @deprecated Use monadMainnet — kept so existing imports keep compiling. */
export const monadTestnet = monadMainnet;

/** EIP-3085 payload for wallet_addEthereumChain */
export function monadAddEthereumParams() {
  return {
    chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
    chainName: MONAD_NETWORK_NAME,
    nativeCurrency: {
      name: MONAD_NATIVE.name,
      symbol: MONAD_NATIVE.symbol,
      decimals: MONAD_NATIVE.decimals,
    },
    rpcUrls: [MONAD_RPC_URL],
    blockExplorerUrls: [MONAD_EXPLORER_URL],
  };
}

/** @deprecated Use monadAddEthereumParams */
export const monadTestnetAddEthereumParams = monadAddEthereumParams;

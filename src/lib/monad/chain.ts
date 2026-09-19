import { defineChain } from "viem";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  MONAD_NATIVE,
  MONAD_RPC_URL,
} from "./config";

export const monadTestnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: MONAD_NATIVE.name,
    symbol: MONAD_NATIVE.symbol,
    decimals: MONAD_NATIVE.decimals,
  },
  rpcUrls: {
    default: { http: [MONAD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: MONAD_EXPLORER_URL },
  },
  testnet: true,
});

/** EIP-3085 payload for wallet_addEthereumChain */
export function monadTestnetAddEthereumParams() {
  return {
    chainId: `0x${MONAD_CHAIN_ID.toString(16)}`,
    chainName: "Monad Testnet",
    nativeCurrency: {
      name: MONAD_NATIVE.name,
      symbol: MONAD_NATIVE.symbol,
      decimals: MONAD_NATIVE.decimals,
    },
    rpcUrls: [MONAD_RPC_URL],
    blockExplorerUrls: [MONAD_EXPLORER_URL],
  };
}

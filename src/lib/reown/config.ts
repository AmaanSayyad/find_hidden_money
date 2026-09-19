import { BitcoinAdapter } from "@reown/appkit-adapter-bitcoin";
import { SolanaAdapter } from "@reown/appkit-adapter-solana";
import { TronAdapter } from "@reown/appkit-adapter-tron";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  arbitrum,
  aurora,
  avalanche,
  base,
  bitcoin,
  blast,
  bsc,
  celo,
  cronos,
  fantom,
  gnosis,
  linea,
  mainnet,
  mantle,
  monadTestnet,
  moonbeam,
  optimism,
  polygon,
  polygonZkEvm,
  scroll,
  sei,
  solana,
  tronMainnet,
  zkSync,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { MONAD_RPC_URL } from "@/lib/monad/config";

/** Reown Cloud project ID — required for WalletConnect’s 500+ wallet catalog. */
export const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_PROJECT_ID ||
  // Official Reown docs localhost project ID. Replace for production.
  "b56e18d47c72ab683b10814fe9495694";

export const appKitNetworks = [
  monadTestnet,
  mainnet,
  polygon,
  arbitrum,
  optimism,
  base,
  bsc,
  avalanche,
  fantom,
  zkSync,
  polygonZkEvm,
  linea,
  scroll,
  blast,
  mantle,
  gnosis,
  celo,
  moonbeam,
  aurora,
  cronos,
  sei,
  solana,
  bitcoin,
  tronMainnet,
] as [AppKitNetwork, ...AppKitNetwork[]];

export const customRpcUrls = {
  "eip155:10143": [{ url: MONAD_RPC_URL }],
};

export const wagmiAdapter = new WagmiAdapter({
  ssr: true,
  projectId,
  networks: appKitNetworks,
  customRpcUrls,
});

export const solanaAdapter = new SolanaAdapter();
export const bitcoinAdapter = new BitcoinAdapter();
export const tronAdapter = new TronAdapter();

export const appKitAdapters = [
  wagmiAdapter,
  solanaAdapter,
  bitcoinAdapter,
  tronAdapter,
];

export const appKitMetadata = {
  name: "Find Hidden Money",
  description:
    "Read-only portfolio scan across EVM, Solana, Bitcoin, Tron, and Sui.",
  url: "http://localhost:3000",
  icons: ["/brand/apple-touch.png"],
};

export const featuredWalletIds = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
  "d0ca99ff52b99abc48743dad0f7fc891e041be73574f7fac4afe5d4bb83845c8", // Coinbase Wallet
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust
  "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709", // OKX
];

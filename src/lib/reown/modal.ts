"use client";

import { createAppKit } from "@reown/appkit/react";
import {
  appKitAdapters,
  appKitMetadata,
  appKitNetworks,
  customRpcUrls,
  featuredWalletIds,
  projectId,
} from "./config";

createAppKit({
  adapters: appKitAdapters,
  projectId,
  networks: appKitNetworks,
  defaultNetwork: appKitNetworks[0],
  metadata: appKitMetadata,
  customRpcUrls,
  featuredWalletIds,
  allWallets: "SHOW",
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: true,
  enableWalletConnect: true,
  enableWalletGuide: true,
  themeMode: "dark",
  themeVariables: {
    "--apkt-accent": "#e5fe00",
    "--w3m-accent": "#e5fe00",
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
    onramp: false,
  },
});

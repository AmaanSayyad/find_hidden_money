import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@reown/appkit",
    "@reown/appkit-adapter-wagmi",
    "@reown/appkit-adapter-solana",
    "@reown/appkit-adapter-bitcoin",
    "@reown/appkit-adapter-tron",
    "@wagmi/core",
    "@wagmi/connectors",
  ],
  turbopack: {
    resolveAlias: {
      "@wagmi/core": "./node_modules/@wagmi/core",
      "@wagmi/connectors": "./node_modules/@wagmi/connectors",
    },
  },
};

export default nextConfig;

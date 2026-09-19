"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { MultichainWalletProvider } from "@/context/MultichainWallet";
import { wagmiAdapter } from "@/lib/reown/config";
import "@/lib/reown/modal";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MultichainWalletProvider>{children}</MultichainWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

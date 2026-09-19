"use client";

import { useEffect, useRef } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useDisconnect,
} from "@reown/appkit/react";
import { accountsFromAppKit } from "@/lib/reown/accounts";
import type { MultichainAccounts } from "@/lib/multichain/scopes";

type AppKitApi = {
  openConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

export type AppKitBridgeProps = {
  active: boolean;
  onAccounts: (accounts: MultichainAccounts) => void;
  onDisconnected: () => void;
  apiRef: React.MutableRefObject<AppKitApi | null>;
};

export function AppKitBridge({
  active,
  onAccounts,
  onDisconnected,
  apiRef,
}: AppKitBridgeProps) {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const evm = useAppKitAccount({ namespace: "eip155" });
  const solana = useAppKitAccount({ namespace: "solana" });
  const bitcoin = useAppKitAccount({ namespace: "bip122" });
  const tron = useAppKitAccount({ namespace: "tron" });
  const hadAccounts = useRef(false);

  apiRef.current = {
    openConnect: async () => {
      await open({ view: "Connect" });
    },
    disconnect: async () => {
      await disconnect();
    },
  };

  const fingerprint = [
    evm.isConnected,
    evm.address,
    solana.isConnected,
    solana.address,
    bitcoin.isConnected,
    bitcoin.address,
    tron.isConnected,
    tron.address,
    evm.allAccounts?.length,
    solana.allAccounts?.length,
  ].join("|");

  useEffect(() => {
    const next = accountsFromAppKit({ evm, solana, bitcoin, tron });
    if (next.all.length > 0) {
      hadAccounts.current = true;
      onAccounts(next);
      return;
    }
    if (active && hadAccounts.current) {
      hadAccounts.current = false;
      onDisconnected();
    }
    // Fingerprint is the connection key; callbacks are stable enough for this bridge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, active]);

  return null;
}

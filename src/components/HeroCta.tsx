"use client";

import { useMultichainWallet } from "@/context/MultichainWallet";
import { ConnectButton } from "./ConnectButton";

export function HeroCta({ onViewScan }: { onViewScan?: () => void }) {
  const { isConnected } = useMultichainWallet();

  if (isConnected) {
    return (
      <div className="hero-cta">
        <a
          className="btn-primary"
          href="#portfolio"
          onClick={(event) => {
            event.preventDefault();
            onViewScan?.();
          }}
        >
          View scan results
        </a>
        <a className="btn-ghost" href="#how">
          How it works
        </a>
      </div>
    );
  }

  return (
    <div className="hero-cta">
      <ConnectButton />
    </div>
  );
}

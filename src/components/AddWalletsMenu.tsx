"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMultichainWallet } from "@/context/MultichainWallet";

type Props = {
  buttonClassName?: string;
  align?: "start" | "end";
  showPaste?: boolean;
  pasteOpen?: boolean;
  onPaste?: () => void;
  onMessage?: (message: string) => void;
};

export function AddWalletsMenu({
  buttonClassName = "btn-ghost",
  align = "start",
  showPaste = false,
  pasteOpen = false,
  onPaste,
  onMessage,
}: Props) {
  const {
    walletKind,
    isPending,
    connect,
    connectAllAddresses,
    addActivePhantomSolana,
    maxSolanaWallets,
  } = useMultichainWallet();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onThisWallet = async () => {
    setOpen(false);
    const result = await connectAllAddresses();
    const parts: string[] = [];
    if (result.evmTotal > 0) {
      parts.push(
        `${result.evmTotal} EVM account${result.evmTotal === 1 ? "" : "s"}`,
      );
    }
    if (result.solTotal > 0) {
      parts.push(
        `${result.solTotal} Solana account${result.solTotal === 1 ? "" : "s"}`,
      );
    }
    onMessage?.(
      parts.length > 0
        ? `Connected ${parts.join(" and ")}. Select every account in the wallet prompt, then confirm.`
        : "In the wallet prompt, open the account list, select all, then confirm.",
    );
  };

  const onAnotherWallet = async () => {
    setOpen(false);
    onMessage?.(
      "Pick another wallet or account. Addresses already in the roster stay.",
    );
    await connect().catch(() => undefined);
  };

  const onPhantomActive = async () => {
    setOpen(false);
    const added = await addActivePhantomSolana();
    onMessage?.(
      added > 0
        ? `Added the active Phantom Solana account. Switch accounts in Phantom to collect more (up to ${maxSolanaWallets}).`
        : "That account is already in the roster. Switch to another account in Phantom, then add again.",
    );
  };

  return (
    <div className="wallet-menu add-wallets-menu" ref={rootRef}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={isPending}
        onClick={() => setOpen((value) => !value)}
      >
        {isPending ? "Connecting…" : "Add wallets"}
      </button>
      {open ? (
        <div
          id={menuId}
          className={
            align === "end"
              ? "wallet-menu-panel"
              : "wallet-menu-panel wallet-menu-panel-start"
          }
          role="menu"
        >
          <button
            type="button"
            className="wallet-menu-item wallet-menu-item-stack"
            role="menuitem"
            disabled={isPending}
            onClick={() => void onThisWallet()}
          >
            <span>This wallet’s accounts</span>
            <small>
              Approve every address inside the connected wallet
            </small>
          </button>
          <button
            type="button"
            className="wallet-menu-item wallet-menu-item-stack"
            role="menuitem"
            disabled={isPending}
            onClick={() => void onAnotherWallet()}
          >
            <span>Another wallet</span>
            <small>Connect a different wallet, then scan it too</small>
          </button>
          {walletKind === "phantom" ? (
            <button
              type="button"
              className="wallet-menu-item wallet-menu-item-stack"
              role="menuitem"
              disabled={isPending}
              onClick={() => void onPhantomActive()}
            >
              <span>Active Phantom account</span>
              <small>Add the Solana account currently selected in Phantom</small>
            </button>
          ) : null}
          {showPaste ? (
            <button
              type="button"
              className="wallet-menu-item wallet-menu-item-stack"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPaste?.();
              }}
            >
              <span>{pasteOpen ? "Hide pasted addresses" : "Paste addresses"}</span>
              <small>Add 0x or Solana addresses without opening a wallet</small>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

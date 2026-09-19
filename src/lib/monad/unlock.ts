"use client";

import { MONAD_TIP_AMOUNT, MONAD_TIP_RECIPIENT } from "@/lib/monad/config";

const UNLOCK_KEY = "fhm.monadTipUnlocks.v2.mainnet";

export type TipUnlockRecord = {
  address: string;
  txHash: string;
  at: number;
};

function loadAll(): Record<string, TipUnlockRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TipUnlockRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, TipUnlockRecord>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(UNLOCK_KEY, JSON.stringify(map));
}

export function isWalletTipUnlocked(address: string): boolean {
  const key = address.toLowerCase();
  return Boolean(loadAll()[key]?.txHash);
}

/** Addresses in this browser that already paid the Monad tip. */
export function storedUnlockAddresses(): string[] {
  const map = loadAll();
  return Object.keys(map).filter((key) => Boolean(map[key]?.txHash));
}

/** First address in the list that already paid the Monad tip. */
export function firstUnlockedAmong(addresses: Iterable<string>): string | null {
  const map = loadAll();
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (map[key]?.txHash) return key;
  }
  return null;
}

export function getTipUnlock(address: string): TipUnlockRecord | null {
  return loadAll()[address.toLowerCase()] ?? null;
}

export function markWalletTipUnlocked(address: string, txHash: string) {
  const map = loadAll();
  map[address.toLowerCase()] = {
    address: address.toLowerCase(),
    txHash,
    at: Date.now(),
  };
  saveAll(map);
}

export function clearTipUnlock(address: string) {
  const map = loadAll();
  delete map[address.toLowerCase()];
  saveAll(map);
}

export { MONAD_TIP_AMOUNT, MONAD_TIP_RECIPIENT };

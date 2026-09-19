import { isValidEvmAddress } from "@/lib/balances";

export type RosterWallet = {
  address: string;
  label: string;
  source: "metamask" | "phantom" | "appkit" | "manual";
  enabled: boolean;
};

const ROSTER_KEY = "fhm.walletRoster";
const MAX_WALLETS = 200;

export function shortenLabel(address: string, index: number): string {
  return `Wallet ${index + 1}`;
}

export function normalizeEvm(address: string): string {
  return address.trim().toLowerCase();
}

/** Parse pasted bulk text: newlines, commas, spaces, optional labels "Name 0x…" */
export function parseBulkEvmAddresses(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const found: string[] = [];
  for (const part of parts) {
    const match = part.match(/0x[a-fA-F0-9]{40}/);
    if (match && isValidEvmAddress(match[0])) {
      found.push(normalizeEvm(match[0]));
    } else if (isValidEvmAddress(part)) {
      found.push(normalizeEvm(part));
    }
  }
  return [...new Set(found)].slice(0, MAX_WALLETS);
}

export function mergeRoster(
  existing: RosterWallet[],
  incoming: Array<Pick<RosterWallet, "address" | "source" | "label">>,
): RosterWallet[] {
  const map = new Map<string, RosterWallet>();
  for (const w of existing) map.set(w.address, w);
  for (const w of incoming) {
    const addr = normalizeEvm(w.address);
    if (!isValidEvmAddress(addr)) continue;
    const prev = map.get(addr);
    if (prev) {
      map.set(addr, {
        ...prev,
        source: prev.source === "metamask" ? "metamask" : w.source,
        label: prev.label || w.label,
      });
    } else if (map.size < MAX_WALLETS) {
      map.set(addr, {
        address: addr,
        label: w.label,
        source: w.source,
        enabled: true,
      });
    }
  }
  return [...map.values()];
}

export function loadRoster(): RosterWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(ROSTER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (w): w is RosterWallet =>
          !!w &&
          typeof w === "object" &&
          typeof (w as RosterWallet).address === "string" &&
          isValidEvmAddress((w as RosterWallet).address),
      )
      .map((w, i): RosterWallet => ({
        address: normalizeEvm(w.address),
        label: w.label || shortenLabel(w.address, i),
        source:
          w.source === "metamask"
            ? "metamask"
            : w.source === "phantom"
              ? "phantom"
              : w.source === "appkit"
                ? "appkit"
                : "manual",
        enabled: w.enabled !== false,
      }))
      .slice(0, MAX_WALLETS);
  } catch {
    return [];
  }
}

export function persistRoster(roster: RosterWallet[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ROSTER_KEY, JSON.stringify(roster.slice(0, MAX_WALLETS)));
}

export { MAX_WALLETS };

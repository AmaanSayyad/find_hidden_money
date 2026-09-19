import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
} from "@/lib/solana-address";

export type SolanaRosterWallet = {
  address: string;
  label: string;
  source: "phantom" | "metamask" | "appkit" | "manual";
  enabled: boolean;
};

const SOL_ROSTER_KEY = "fhm.solanaRoster";
/** Survives disconnect so collecting ~60 Phantom accounts is not lost. */
const SOL_ROSTER_LOCAL_KEY = "fhm.solanaRoster.v1";
export const MAX_SOLANA_WALLETS = 100;

export function shortenSolLabel(address: string, index: number): string {
  return `Sol ${index + 1}`;
}

export function mergeSolanaRoster(
  existing: SolanaRosterWallet[],
  incoming: Array<Pick<SolanaRosterWallet, "address" | "source" | "label">>,
): SolanaRosterWallet[] {
  const map = new Map<string, SolanaRosterWallet>();
  for (const w of existing) map.set(w.address, w);
  for (const w of incoming) {
    const addr = normalizeSolanaAddress(w.address);
    if (!isValidSolanaAddress(addr)) continue;
    const prev = map.get(addr);
    if (prev) {
      map.set(addr, {
        ...prev,
        source: prev.source === "phantom" ? "phantom" : w.source,
        label: prev.label || w.label,
        enabled: true,
      });
    } else if (map.size < MAX_SOLANA_WALLETS) {
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

/** Parse pasted bulk text: Solana base58 addresses, commas or newlines. */
export function parseBulkSolanaAddresses(raw: string): string[] {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const found: string[] = [];
  for (const part of parts) {
    const normalized = normalizeSolanaAddress(part);
    if (isValidSolanaAddress(normalized)) {
      found.push(normalized);
      continue;
    }
    const match = part.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (match && isValidSolanaAddress(match[0])) {
      found.push(normalizeSolanaAddress(match[0]));
    }
  }
  return [...new Set(found)].slice(0, MAX_SOLANA_WALLETS);
}

/** True when pasted text looks like Solana but uses illegal base58 characters. */
export function pastedTextLooksLikeBrokenSolana(raw: string): boolean {
  return raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .some((part) => {
      const normalized = normalizeSolanaAddress(part);
      if (isValidSolanaAddress(normalized)) return false;
      return /^[1-9A-HJ-NP-Za-km-z0OIl]{32,44}$/.test(normalized);
    });
}

function parseRoster(raw: string | null): SolanaRosterWallet[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (w): w is SolanaRosterWallet =>
        !!w &&
        typeof w === "object" &&
        typeof (w as SolanaRosterWallet).address === "string" &&
        isValidSolanaAddress((w as SolanaRosterWallet).address),
    )
    .map((w, i): SolanaRosterWallet => ({
      address: normalizeSolanaAddress(w.address),
      label: w.label || shortenSolLabel(w.address, i),
      source:
        w.source === "phantom" ||
        w.source === "metamask" ||
        w.source === "appkit"
          ? w.source
          : "manual",
      enabled: w.enabled !== false,
    }))
    .slice(0, MAX_SOLANA_WALLETS);
}

export function loadSolanaRoster(): SolanaRosterWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const local = parseRoster(localStorage.getItem(SOL_ROSTER_LOCAL_KEY));
    if (local.length > 0) return local;
    // Migrate older session-only roster once.
    const session = parseRoster(sessionStorage.getItem(SOL_ROSTER_KEY));
    if (session.length > 0) {
      persistSolanaRoster(session);
      return session;
    }
    return [];
  } catch {
    return [];
  }
}

export function persistSolanaRoster(roster: SolanaRosterWallet[]) {
  if (typeof window === "undefined") return;
  const trimmed = roster.slice(0, MAX_SOLANA_WALLETS);
  localStorage.setItem(SOL_ROSTER_LOCAL_KEY, JSON.stringify(trimmed));
  sessionStorage.setItem(SOL_ROSTER_KEY, JSON.stringify(trimmed));
}

export function clearPersistedSolanaRoster() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SOL_ROSTER_LOCAL_KEY);
  sessionStorage.removeItem(SOL_ROSTER_KEY);
}

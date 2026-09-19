/** Loose base58 Solana address check (32–44 chars, no 0/O/I/l). */
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Strip whitespace, zero-width chars, and optional solana: CAIP-10 prefix. */
export function normalizeSolanaAddress(value: string): string {
  let trimmed = value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "");

  if (/^solana:/i.test(trimmed)) {
    const parts = trimmed.split(":");
    // solana:<genesis>:<address>  or  solana:<address>
    trimmed = parts.length >= 3 ? parts.slice(2).join(":") : (parts[1] ?? "");
  }

  return trimmed;
}

export function isValidSolanaAddress(value: string): boolean {
  const trimmed = normalizeSolanaAddress(value);
  if (!SOLANA_RE.test(trimmed)) return false;
  // Reject hex EVM addresses that can slip past length checks.
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) return false;
  return true;
}

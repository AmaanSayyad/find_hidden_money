/**
 * Process-wide Ankr throttle so multi-wallet sweeps don't get silent empty results.
 */
let active = 0;
const waiters: Array<() => void> = [];
const MAX_CONCURRENT = 1;
const GAP_MS = 600;

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function withAnkrQueue<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }
  active += 1;
  try {
    await delay(GAP_MS);
    return await fn();
  } finally {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  }
}

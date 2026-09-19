import { NextResponse } from "next/server";
import {
  isValidEvmAddress,
  scanMultiPortfolio,
} from "@/lib/balances";
import { isValidSolanaAddress } from "@/lib/solana-address";
import type { PortfolioResult } from "@/lib/balances/types";

export const maxDuration = 300;

const MAX_BATCH = 12;

type BatchBody = {
  evm?: string[];
  /** When set, also scan Robinhood Chain for the same 0x (automatic, no paste). */
  robinhood?: string[];
  /** Solana addresses (Phantom multi-wallet). */
  solana?: string[];
  mode?: "quick" | "indexed" | "full";
};

/**
 * Scan up to 12 EVM and/or Solana wallets per request.
 */
export async function POST(request: Request) {
  let body: BatchBody;
  try {
    body = (await request.json()) as BatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode =
    body.mode === "full"
      ? "full"
      : body.mode === "indexed"
        ? "indexed"
        : "quick";
  const evm = [...new Set((body.evm ?? []).map((a) => a.toLowerCase()))].filter(
    isValidEvmAddress,
  );
  const robinhoodSet = new Set(
    [...new Set((body.robinhood ?? []).map((a) => a.toLowerCase()))].filter(
      isValidEvmAddress,
    ),
  );
  const solana = [...new Set(body.solana ?? [])].filter(isValidSolanaAddress);

  if (evm.length === 0 && solana.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one valid address in evm[] or solana[]" },
      { status: 400 },
    );
  }
  if (evm.length + solana.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_BATCH} addresses per batch` },
      { status: 400 },
    );
  }

  if (mode === "full" && evm.length + solana.length > 1) {
    return NextResponse.json(
      { error: "Full/deep scan supports one wallet at a time" },
      { status: 400 },
    );
  }

  type Row = {
    address: string;
    ok: boolean;
    portfolio?: PortfolioResult;
    error?: string;
    ecosystem: "evm" | "solana";
  };

  const jobs: Array<{ address: string; ecosystem: "evm" | "solana" }> = [
    ...evm.map((address) => ({ address, ecosystem: "evm" as const })),
    ...solana.map((address) => ({ address, ecosystem: "solana" as const })),
  ];

  const results: Row[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      const job = jobs[idx]!;
      try {
        const portfolio = await scanMultiPortfolio(
          job.ecosystem === "evm"
            ? {
                evm: [job.address],
                robinhood: robinhoodSet.has(job.address)
                  ? [job.address]
                  : undefined,
                mode,
              }
            : { solana: [job.address], mode: "indexed" },
        );
        results[idx] = {
          address: job.address,
          ok: true,
          portfolio,
          ecosystem: job.ecosystem,
        };
      } catch (err) {
        results[idx] = {
          address: job.address,
          ok: false,
          error: err instanceof Error ? err.message : "Scan failed",
          ecosystem: job.ecosystem,
        };
      }
    }
  }

  // Serial — avoids Ankr / RPC stampedes across multi-wallet rosters.
  await worker();

  return NextResponse.json({
    mode,
    count: results.length,
    results,
    scannedAt: new Date().toISOString(),
  });
}

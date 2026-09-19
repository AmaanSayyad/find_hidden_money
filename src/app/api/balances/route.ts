import { NextResponse } from "next/server";
import {
  isValidEvmAddress,
  scanMultiPortfolio,
  type ScanRequest,
} from "@/lib/balances";

/** Chainlist mega-sweep can take 1–3 minutes across 2000+ RPCs */
export const maxDuration = 300;

function parseRequest(body: unknown, searchParams: URLSearchParams): ScanRequest {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    return {
      evm: Array.isArray(b.evm)
        ? b.evm.filter((x): x is string => typeof x === "string")
        : typeof b.address === "string"
          ? [b.address]
          : [],
      robinhood: Array.isArray(b.robinhood)
        ? b.robinhood.filter((x): x is string => typeof x === "string")
        : [],
      solana: Array.isArray(b.solana)
        ? b.solana.filter((x): x is string => typeof x === "string")
        : [],
      bitcoin: Array.isArray(b.bitcoin)
        ? b.bitcoin.filter((x): x is string => typeof x === "string")
        : [],
      tron: Array.isArray(b.tron)
        ? b.tron.filter((x): x is string => typeof x === "string")
        : [],
      sui: Array.isArray(b.sui)
        ? b.sui.filter((x): x is string => typeof x === "string")
        : [],
      mode: b.mode === "full" ? "full" : "indexed",
    };
  }

  const address = searchParams.get("address")?.trim();
  return {
    evm: address ? [address] : [],
    robinhood: searchParams.getAll("robinhood"),
    solana: searchParams.getAll("solana"),
    bitcoin: searchParams.getAll("bitcoin"),
    tron: searchParams.getAll("tron"),
    sui: searchParams.getAll("sui"),
    mode: searchParams.get("mode") === "full" ? "full" : "indexed",
  };
}

async function handle(request: ScanRequest) {
  const hasAny =
    (request.evm?.length ?? 0) > 0 ||
    (request.robinhood?.length ?? 0) > 0 ||
    (request.solana?.length ?? 0) > 0 ||
    (request.bitcoin?.length ?? 0) > 0 ||
    (request.tron?.length ?? 0) > 0 ||
    (request.sui?.length ?? 0) > 0;

  if (!hasAny) {
    return NextResponse.json(
      {
        error:
          "Provide at least one address (evm / solana / bitcoin / tron / sui)",
      },
      { status: 400 },
    );
  }

  for (const addr of request.evm ?? []) {
    if (!isValidEvmAddress(addr)) {
      return NextResponse.json(
        { error: `Invalid EVM address: ${addr}` },
        { status: 400 },
      );
    }
  }

  try {
    const portfolio = await scanMultiPortfolio(request);
    return NextResponse.json(portfolio);
  } catch (err) {
    console.error("Balance scan failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to scan wallet balances",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return handle(parseRequest(null, searchParams));
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return handle(parseRequest(body, new URL(request.url).searchParams));
}

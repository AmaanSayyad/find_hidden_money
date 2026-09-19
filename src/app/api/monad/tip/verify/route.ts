import { NextResponse } from "next/server";
import { isValidEvmAddress } from "@/lib/balances";
import { isAddressRevealed, verifyMonadTipTx } from "@/lib/monad/tip";
import {
  MONAD_CHAIN_ID,
  MONAD_REVEAL_PASS,
  MONAD_TIP_AMOUNT,
  MONAD_TIP_RECIPIENT,
} from "@/lib/monad/config";

export const maxDuration = 60;

type Body = {
  txHash?: string;
  from?: string;
};

/**
 * Verify a RevealPass tip on Monad Testnet (10143).
 * POST { txHash, from? } — check a transaction.
 * GET ?address=0x… — read on-chain unlock state.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const txHash = body.txHash?.trim();
  if (!txHash) {
    return NextResponse.json({ error: "txHash required" }, { status: 400 });
  }
  const from =
    body.from && isValidEvmAddress(body.from) ? body.from.toLowerCase() : undefined;

  const result = await verifyMonadTipTx(txHash, from);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        tipAmount: MONAD_TIP_AMOUNT,
        tipRecipient: MONAD_TIP_RECIPIENT,
        contract: MONAD_REVEAL_PASS,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    unlocked: true,
    tipAmount: MONAD_TIP_AMOUNT,
    tipRecipient: MONAD_TIP_RECIPIENT,
    contract: MONAD_REVEAL_PASS,
    ...result,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim();

  if (address && isValidEvmAddress(address)) {
    const unlocked = await isAddressRevealed(address);
    return NextResponse.json({
      unlocked,
      address: address.toLowerCase(),
      tipAmount: MONAD_TIP_AMOUNT,
      tipRecipient: MONAD_TIP_RECIPIENT,
      contract: MONAD_REVEAL_PASS,
      chainId: MONAD_CHAIN_ID,
      symbol: "MON",
      network: "Monad Testnet",
    });
  }

  return NextResponse.json({
    tipAmount: MONAD_TIP_AMOUNT,
    tipRecipient: MONAD_TIP_RECIPIENT,
    contract: MONAD_REVEAL_PASS,
    chainId: MONAD_CHAIN_ID,
    symbol: "MON",
    network: "Monad Testnet",
  });
}

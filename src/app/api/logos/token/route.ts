import { NextResponse } from "next/server";

export const revalidate = 86400;

/**
 * Resolve a long-tail token image via GeckoTerminal (CoinGecko-backed).
 * TokenIcon uses this as a last-resort candidate.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get("network")?.trim();
  const address = url.searchParams.get("address")?.trim();
  if (!network || !address) {
    return NextResponse.json({ error: "network and address required" }, { status: 400 });
  }
  if (!/^[a-z0-9_-]{2,32}$/i.test(network)) {
    return NextResponse.json({ error: "invalid network" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(address)}`,
      {
        headers: { accept: "application/json" },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }
    const data = (await res.json()) as {
      data?: { attributes?: { image_url?: string | null } };
    };
    const image = data.data?.attributes?.image_url;
    if (!image || !/^https?:\/\//i.test(image)) {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.redirect(image, 302);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

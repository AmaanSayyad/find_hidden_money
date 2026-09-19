"use client";

import { useEffect, useMemo, useState } from "react";

const FALLBACK_TOKENS = [
  "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png",
  "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  "https://coin-images.coingecko.com/coins/images/325/small/Tether.png",
  "https://coin-images.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
  "https://coin-images.coingecko.com/coins/images/6319/small/usdc.png",
  "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png",
  "https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  "https://coin-images.coingecko.com/coins/images/25244/small/Optimism.png",
  "https://coin-images.coingecko.com/coins/images/16547/small/arb.jpg",
  "https://coin-images.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  "https://coin-images.coingecko.com/coins/images/12504/small/uniswap-logo.png",
  "https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png",
  "https://coin-images.coingecko.com/coins/images/4713/small/polygon.png",
  "https://coin-images.coingecko.com/coins/images/1094/small/tron-logo.png",
  "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png",
  "https://coin-images.coingecko.com/coins/images/975/small/cardano.png",
  "https://coin-images.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
  "https://coin-images.coingecko.com/coins/images/11939/small/shiba.png",
  "https://coin-images.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  "/monad/mark.png",
];

function LogoRow({
  urls,
  duration,
  reverse,
}: {
  urls: string[];
  duration: string;
  reverse?: boolean;
}) {
  const loop = [...urls, ...urls];
  return (
    <div className="logo-cloud-mask">
      <div
        className={`logo-cloud-track${reverse ? " reverse" : ""}`}
        style={{ animationDuration: duration }}
      >
        {loop.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${i}`}
            src={src}
            alt=""
            width={28}
            height={28}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function LogoCloud() {
  const [tokens, setTokens] = useState<string[]>(FALLBACK_TOKENS);
  const [chains, setChains] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/logos/cloud")
      .then((res) => res.json())
      .then((data: { tokens?: string[]; chains?: string[] }) => {
        if (cancelled) return;
        if (data.tokens && data.tokens.length > 0) setTokens(data.tokens);
        if (data.chains && data.chains.length > 0) setChains(data.chains);
      })
      .catch(() => {
        /* keep fallback strip */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rowA = useMemo(() => tokens.slice(0, 48), [tokens]);
  const rowB = useMemo(() => {
    const more = tokens.slice(48, 80);
    return [...more, ...chains.slice(0, 28)];
  }, [tokens, chains]);

  return (
    <section className="logo-cloud" aria-label="Token and chain logos">
      <LogoRow urls={rowA.length ? rowA : FALLBACK_TOKENS} duration="90s" />
      <LogoRow
        urls={rowB.length ? rowB : FALLBACK_TOKENS.slice().reverse()}
        duration="110s"
        reverse
      />
    </section>
  );
}

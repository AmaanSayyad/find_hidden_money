"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const LINE =
  "WALLETS ARE BEING SCANNED  —  DO NOT CROSS  —  SCANNING EVERY CHAIN  —  ";

export function ScanTape({ active }: { active: boolean }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("scan-tape-slot"));
  }, [active]);

  if (!active || !slot) return null;

  const copies = Array.from({ length: 8 }, (_, i) => (
    <span key={i}>{LINE}</span>
  ));

  return createPortal(
    <div
      className="scan-tape"
      role="status"
      aria-live="polite"
      aria-label="Wallets are being scanned"
    >
      <div className="scan-tape-track">
        {copies}
        {copies}
      </div>
    </div>,
    slot,
  );
}

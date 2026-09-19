"use client";

import NumberFlow from "@number-flow/react";

type Props = {
  value: number | null | undefined;
  className?: string;
};

export function AnimatedUsd({ value, className }: Props) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={className}>—</span>;
  }

  if (value > 0 && value < 0.01) {
    return <span className={className}>&lt;$0.01</span>;
  }

  return (
    <NumberFlow
      className={className}
      value={value}
      locales="en-US"
      format={{
        style: "currency",
        currency: "USD",
        maximumFractionDigits: value < 1 ? 4 : 2,
      }}
      spinTiming={{ duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      transformTiming={{
        duration: 550,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      opacityTiming={{ duration: 200, easing: "ease-out" }}
    />
  );
}

"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { formatMoney, formatSignedMoney } from "@/lib/money";

/**
 * Counts up to an amount. The animated value is always a whole number of cents
 * (§2.1) and every frame is rendered through `formatMoney` (§13), so the number
 * on screen is never a float and never formatted any other way.
 */
export function AnimatedMoney({
  cents,
  currency,
  signed = false,
  className = "",
}: {
  cents: number;
  currency: string;
  signed?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? cents : 0);
  const previous = useRef(reduce ? cents : 0);

  useEffect(() => {
    if (reduce) {
      previous.current = cents;
      return;
    }
    const controls = animate(previous.current, cents, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => setShown(Math.round(value)),
      onComplete: () => {
        previous.current = cents;
        setShown(cents);
      },
    });
    return () => controls.stop();
  }, [cents, reduce]);

  const value = reduce ? cents : shown;
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {signed ? formatSignedMoney(value, currency) : formatMoney(value, currency)}
    </span>
  );
}

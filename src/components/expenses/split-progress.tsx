"use client";

import { motion } from "motion/react";

/**
 * One segment per participant: green once settled, amber once accepted, grey
 * while still waiting. Reads at a glance as "how far along is this expense".
 */
export function SplitProgress({
  total,
  accepted,
  settled,
}: {
  total: number;
  accepted: number;
  settled: number;
}) {
  if (total <= 0) {
    return null;
  }
  return (
    <div
      className="mt-1.5 flex gap-0.5"
      role="img"
      aria-label={`${settled} of ${total} paid, ${accepted} accepted`}
    >
      {Array.from({ length: total }, (_, i) => {
        const color =
          i < settled
            ? "bg-emerald-500"
            : i < settled + accepted
              ? "bg-amber-400"
              : "bg-slate-200 dark:bg-slate-700";
        return (
          <motion.span
            key={i}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.04 * i, duration: 0.3 }}
            style={{ originX: 0 }}
            className={`h-1 flex-1 rounded-full ${color}`}
          />
        );
      })}
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import { ArrowDownLeft, Clock, ArrowUpRight } from "lucide-react";

import { AnimatedMoney } from "@/components/ui/animated-money";

/**
 * Three tiles for money moving between people: confirmed income received, income
 * still to come in, and what you owe. They are three different numbers on
 * purpose — "pending" is what the household owes you, not what has been paid.
 */
export function IncomeTiles({
  currency,
  receivedCents,
  pendingCents,
  oweCents,
}: {
  currency: string;
  receivedCents: number;
  pendingCents: number;
  oweCents: number;
}) {
  const tiles = [
    {
      label: "Income received",
      hint: "Confirmed payments",
      cents: receivedCents,
      icon: ArrowDownLeft,
      tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      label: "Not received yet",
      hint: "Owed to you",
      cents: pendingCents,
      icon: Clock,
      tone: "text-amber-600 bg-amber-50 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      label: "You owe",
      hint: "Still to pay",
      cents: oweCents,
      icon: ArrowUpRight,
      tone: "text-rose-600 bg-rose-50 dark:bg-rose-950 dark:text-rose-300",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.label}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.08 * index,
            type: "spring",
            stiffness: 300,
            damping: 26,
          }}
          className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <span
            className={`flex size-8 items-center justify-center rounded-full ${tile.tone}`}
          >
            <tile.icon className="size-4" aria-hidden="true" />
          </span>
          <AnimatedMoney
            cents={tile.cents}
            currency={currency}
            className="mt-2 block text-sm font-semibold"
          />
          <p className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400">
            {tile.label}
          </p>
        </motion.div>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { AnimatedMoney } from "@/components/ui/animated-money";
import { Press } from "@/components/ui/press";
import { Balance } from "@/components/ui/money";
import type { HouseholdOverview } from "@/lib/overview/queries";

const COLORS = [
  "#059669",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
  "#64748b",
];

/**
 * Organisation-wise spend: a donut of this month's share, then a card per
 * organisation with an animated bar for its slice and your net position there.
 */
export function OrgBreakdown({
  households,
  currency,
  combined = true,
}: {
  households: HouseholdOverview[];
  currency: string;
  /** False when the groups use different currencies, so slices cannot be compared. */
  combined?: boolean;
}) {
  const monthTotal = households.reduce((sum, h) => sum + h.monthSpendCents, 0);
  const pie = households
    .filter((h) => h.monthSpendCents > 0)
    .map((h) => ({ name: h.name, value: h.monthSpendCents }));

  return (
    <div className="space-y-3">
      {combined && pie.length > 0 ? (
        <div className="relative h-44 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pie}
                dataKey="value"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={3}
                animationDuration={900}
                stroke="none"
              >
                {pie.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              This month
            </span>
            <AnimatedMoney
              cents={monthTotal}
              currency={currency}
              className="text-sm font-semibold"
            />
          </div>
        </div>
      ) : null}

      <ul className="space-y-2.5">
        {households.map((h, index) => {
          const share =
            combined && monthTotal > 0 ? (h.monthSpendCents / monthTotal) * 100 : 0;
          return (
            <motion.li
              key={h.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index, duration: 0.3 }}
            >
              <Press>
                <Link
                  href={`/households/${h.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: COLORS[index % COLORS.length] }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {h.memberCount} {h.memberCount === 1 ? "member" : "members"} ·{" "}
                          {h.role.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <Balance
                      cents={h.netCents}
                      currency={h.currency}
                      className="text-sm"
                    />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${share}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.1 + 0.05 * index,
                        ease: "easeOut",
                      }}
                      className="h-full rounded-full"
                      style={{ background: COLORS[index % COLORS.length] }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      <AnimatedMoney cents={h.weekSpendCents} currency={h.currency} />{" "}
                      this week
                    </span>
                    <span className="font-mono tabular-nums">
                      <AnimatedMoney cents={h.monthSpendCents} currency={h.currency} />{" "}
                      this month
                    </span>
                  </div>
                </Link>
              </Press>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

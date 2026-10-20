"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { AnimatedMoney } from "@/components/ui/animated-money";
import type { PeriodSpend } from "@/lib/overview/queries";
import { formatMoney } from "@/lib/money";

type Period = "week" | "month";

function label(period: string, kind: Period): string {
  const date = new Date(`${period}T00:00:00Z`);
  return kind === "week"
    ? date.toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : date.toLocaleDateString("en-NZ", { month: "short", timeZone: "UTC" });
}

/**
 * The headline card: your spend this week or month as an animated counter, over
 * a bar chart of recent periods whose latest bar is highlighted. The toggle is
 * a sliding segmented control.
 */
export function SpendHero({
  currency,
  weekCents,
  monthCents,
  weekly,
  monthly,
}: {
  currency: string;
  weekCents: number;
  monthCents: number;
  weekly: PeriodSpend[];
  monthly: PeriodSpend[];
}) {
  const [period, setPeriod] = useState<Period>("month");
  const series = period === "week" ? weekly : monthly;
  const total = period === "week" ? weekCents : monthCents;
  const data = series.map((row) => ({
    name: label(row.period, period),
    cents: row.cents,
  }));

  return (
    <div className="from-brand relative overflow-hidden rounded-3xl bg-gradient-to-br to-emerald-800 p-5 text-white shadow-lg shadow-emerald-900/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-emerald-100">
            Your spending {period === "week" ? "this week" : "this month"}
          </p>
          <AnimatedMoney
            cents={total}
            currency={currency}
            className="mt-1 block text-4xl font-semibold tracking-tight"
          />
        </div>
        <div
          role="tablist"
          aria-label="Period"
          className="relative flex rounded-full bg-black/20 p-1"
        >
          {(["week", "month"] as const).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={period === value}
              onClick={() => setPeriod(value)}
              className="relative z-10 rounded-full px-3 py-1 text-xs font-medium"
            >
              {period === value ? (
                <motion.span
                  layoutId="period-pill"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full bg-white/90"
                />
              ) : null}
              <span className={period === value ? "text-emerald-900" : "text-emerald-50"}>
                {value === "week" ? "Weekly" : "Monthly"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-36">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-emerald-100">
            No spending recorded yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#d1fae5", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.08)" }}
                formatter={(value) => formatMoney(Number(value), currency)}
                contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }}
              />
              <Bar dataKey="cents" radius={[8, 8, 0, 0]} animationDuration={800}>
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={
                      index === data.length - 1 ? "#ffffff" : "rgba(255,255,255,0.45)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

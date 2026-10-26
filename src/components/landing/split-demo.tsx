"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";

import { AnimatedMoney } from "@/components/ui/animated-money";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { computeSplits, type SplitMethod } from "@/lib/splits/engine";

import { SectionHeading } from "./reveal";

type DemoMethod = Exclude<SplitMethod, "EXACT">;

const CURRENCY = "NZD";
// Ids sort Ann < Bob < Cal, so the §2.6 tie-break is visible with an odd total.
const PEOPLE = [
  { id: "ann", name: "Ann", bar: "bg-emerald-500" },
  { id: "bob", name: "Bob", bar: "bg-sky-500" },
  { id: "cal", name: "Cal", bar: "bg-violet-500" },
] as const;

const METHODS: Array<{ id: DemoMethod; label: string; hint: string }> = [
  { id: "EQUAL", label: "Equal", hint: "Everyone pays the same." },
  { id: "SHARES", label: "Shares", hint: "Bigger room, more shares." },
  { id: "PERCENTAGE", label: "Percent", hint: "Agree a percentage each." },
];

/**
 * A live split calculator. It calls the very same `computeSplits` the server
 * uses (§2.5), so what a visitor drags around here is what the app would
 * compute, penny rule included.
 */
export function SplitDemo() {
  const [amountText, setAmountText] = useState("100.00");
  const [method, setMethod] = useState<DemoMethod>("EQUAL");
  const [shares, setShares] = useState([2, 1, 1]);
  const [percent, setPercent] = useState([50, 30]); // Cal takes the rest

  const totalCents = parseMoneyInput(amountText, CURRENCY);
  const valid = totalCents !== null && totalCents > 0;

  const rows = useMemo(() => {
    if (!valid) {
      return null;
    }
    const calPercent = 100 - percent[0] - percent[1];
    const bps = [percent[0] * 100, percent[1] * 100, calPercent * 100];
    try {
      const computed = computeSplits({
        method,
        totalCents,
        participants: PEOPLE.map((p, i) => ({
          userId: p.id,
          shares: method === "SHARES" ? shares[i] : undefined,
          percentBps: method === "PERCENTAGE" ? bps[i] : undefined,
        })),
      });
      const weights = method === "EQUAL" ? [1, 1, 1] : method === "SHARES" ? shares : bps;
      const weightSum = weights.reduce((a, b) => a + b, 0);
      return computed.map((c, i) => ({
        ...PEOPLE[i],
        cents: c.amountCents,
        // Over the plain floor means this person absorbed a leftover cent.
        gotPenny: c.amountCents > Math.floor((totalCents * weights[i]) / weightSum),
      }));
    } catch {
      return null;
    }
  }, [valid, totalCents, method, shares, percent]);

  const calPercent = 100 - percent[0] - percent[1];

  return (
    <section id="demo" className="scroll-mt-20 px-4 py-20">
      <SectionHeading eyebrow="Try it" title="Split anything, to the exact cent">
        Change the amount or the method. Try $100.01 split three ways and watch who
        absorbs the spare cent.
      </SectionHeading>

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <label htmlFor="demo-amount" className="text-sm font-medium">
            Total bill
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:border-emerald-600 dark:border-slate-700">
            <span className="text-slate-500">$</span>
            <input
              id="demo-amount"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              aria-invalid={!valid}
              className="min-h-12 w-full bg-transparent font-mono text-xl tabular-nums outline-none"
            />
          </div>
          <div className="mt-2 flex gap-2">
            {["60.00", "100.01", "250.00"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountText(preset)}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                ${preset}
              </button>
            ))}
          </div>
          {!valid ? (
            <p role="alert" className="mt-2 text-xs text-red-600">
              Enter an amount like 45.50.
            </p>
          ) : null}

          <div
            role="tablist"
            aria-label="Split method"
            className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
          >
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={method === m.id}
                onClick={() => setMethod(m.id)}
                className="relative min-h-10 rounded-lg text-sm font-medium"
              >
                {method === m.id ? (
                  <motion.span
                    layoutId="split-method"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-slate-600"
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                ) : null}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {METHODS.find((m) => m.id === method)?.hint}
          </p>

          <div className="mt-4 space-y-3">
            {method === "SHARES"
              ? PEOPLE.map((p, i) => (
                  <label key={p.id} className="flex items-center gap-3 text-sm">
                    <span className="w-8">{p.name}</span>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={shares[i]}
                      onChange={(e) =>
                        setShares((s) =>
                          s.map((v, j) => (j === i ? Number(e.target.value) : v)),
                        )
                      }
                      className="accent-brand flex-1"
                    />
                    <span className="w-14 text-right font-mono text-xs">
                      {shares[i]} share{shares[i] === 1 ? "" : "s"}
                    </span>
                  </label>
                ))
              : null}
            {method === "PERCENTAGE" ? (
              <>
                {[0, 1].map((i) => (
                  <label key={PEOPLE[i].id} className="flex items-center gap-3 text-sm">
                    <span className="w-8">{PEOPLE[i].name}</span>
                    <input
                      type="range"
                      min={5}
                      max={90}
                      value={percent[i]}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        const other = percent[1 - i];
                        // Cal keeps at least 5%, so the three always total 100.
                        setPercent(
                          i === 0
                            ? [Math.min(next, 95 - other), other]
                            : [other, Math.min(next, 95 - other)],
                        );
                      }}
                      className="accent-brand flex-1"
                    />
                    <span className="w-14 text-right font-mono text-xs">
                      {percent[i]}%
                    </span>
                  </label>
                ))}
                <p className="text-xs text-slate-500">
                  Cal covers the remaining {calPercent}%.
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold">Who owes what</h3>
          {rows ? (
            <ul className="mt-4 space-y-4">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="flex items-center gap-2">
                      {r.gotPenny ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          +1¢ spare cent
                        </span>
                      ) : null}
                      <AnimatedMoney
                        cents={r.cents}
                        currency={CURRENCY}
                        className="font-semibold"
                      />
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <motion.div
                      className={`h-full rounded-full ${r.bar}`}
                      initial={false}
                      animate={{ width: `${(r.cents / (totalCents ?? 1)) * 100}%` }}
                      transition={{ type: "spring", stiffness: 160, damping: 22 }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Enter a valid amount to see the split.
            </p>
          )}

          {rows && totalCents !== null ? (
            <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950">
              <span className="text-emerald-900 dark:text-emerald-100">
                Parts add up to exactly {formatMoney(totalCents, CURRENCY)}
              </span>
              <span aria-hidden="true">✓</span>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            Spare cents go to the largest shares first, ties broken by member id, so the
            same bill always splits the same way.
          </p>
        </div>
      </div>
    </section>
  );
}

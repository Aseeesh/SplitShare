"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { AnimatedMoney } from "@/components/ui/animated-money";

import { Reveal, SectionHeading } from "./reveal";

const CURRENCY = "NZD";

// The §12 worked example: Ann pays 9000, Bob pays 6000, Cal pays nothing,
// everything split three ways. Nets are derived below, not hard-coded.
const PAID = { Ann: 9000, Bob: 6000, Cal: 0 } as const;
const OWED_EACH = (9000 + 6000) / 3;

const PEOPLE = (Object.keys(PAID) as Array<keyof typeof PAID>).map((name) => ({
  name,
  paid: PAID[name],
  net: PAID[name] - OWED_EACH,
}));

const TRANSFERS = [
  { from: "Cal", to: "Ann", cents: 4000 },
  { from: "Cal", to: "Bob", cents: 1000 },
] as const;

type Phase = "before" | "plan" | "settled";
const NEXT: Record<Phase, Phase> = { before: "plan", plan: "settled", settled: "before" };
const LABEL: Record<Phase, string> = {
  before: "Show the cheapest way to settle",
  plan: "Mark everything paid",
  settled: "Start over",
};

/** Interactive version of the three-flatmates example from the spec. */
export function BalancesDemo() {
  const [phase, setPhase] = useState<Phase>("before");

  return (
    <section id="balances" className="scroll-mt-20 px-4 py-20">
      <SectionHeading eyebrow="Settling up" title="Fewer payments, zero arguments">
        Balances are calculated from the record every time. SplitHome then finds the
        smallest set of transfers that squares everyone up.
      </SectionHeading>

      <Reveal className="mx-auto mt-10 w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Three flatmates split everything equally. Ann paid $90 for groceries, Bob paid
          $60 for power, Cal paid nothing.
        </p>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {PEOPLE.map((p) => {
            const net = phase === "settled" ? 0 : p.net;
            return (
              <li key={p.name} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-slate-500">
                  paid <AnimatedMoney cents={p.paid} currency={CURRENCY} /> · owes{" "}
                  <AnimatedMoney cents={OWED_EACH} currency={CURRENCY} />
                </p>
                <p
                  className={`mt-3 text-xl font-semibold transition-colors ${
                    net > 0
                      ? "text-emerald-600"
                      : net < 0
                        ? "text-red-600"
                        : "text-slate-500"
                  }`}
                >
                  <AnimatedMoney cents={net} currency={CURRENCY} signed />
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 min-h-24">
          <AnimatePresence mode="wait">
            {phase === "before" ? (
              <motion.p
                key="before"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-slate-500"
              >
                Add the nets up and you always get exactly $0.00. Someone’s gain is
                someone else’s debt.
              </motion.p>
            ) : (
              <motion.ul
                key="plan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {TRANSFERS.map((t, i) => (
                  <motion.li
                    key={t.to}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                      phase === "settled"
                        ? "bg-emerald-50 dark:bg-emerald-950"
                        : "bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <span className="font-medium">{t.from}</span>
                    <ArrowRight className="text-brand size-4" />
                    <span className="font-medium">{t.to}</span>
                    <AnimatedMoney
                      cents={t.cents}
                      currency={CURRENCY}
                      className="ml-auto font-semibold"
                    />
                    {phase === "settled" ? <span aria-label="paid">✓</span> : null}
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={() => setPhase((p) => NEXT[p])}
          className="bg-brand hover:bg-brand-strong mt-4 min-h-11 w-full rounded-xl px-5 text-sm font-medium text-white transition-[colors,transform] active:scale-[0.99] sm:w-auto"
        >
          {LABEL[phase]}
        </button>
      </Reveal>
    </section>
  );
}

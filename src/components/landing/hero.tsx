"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { SignInButton } from "@/components/auth/sign-in-sheet";
import { AnimatedMoney } from "@/components/ui/animated-money";

/**
 * The hero loops through one expense's life: created, accepted, paid,
 * confirmed. It mirrors the §7 state machine so the first thing a visitor sees
 * is the product's actual model, not a stock illustration.
 */
const STAGES = [
  {
    status: "Pending acceptance",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    bob: "Awaiting Bob",
    owes: 4500,
  },
  {
    status: "Accepted",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    bob: "Bob accepted",
    owes: 4500,
  },
  {
    status: "Payment sent",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    bob: "Waiting for Ann to confirm",
    owes: 4500,
  },
  {
    status: "Paid",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    bob: "Settled",
    owes: 0,
  },
] as const;

function PhoneDemo() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(reduce ? STAGES.length - 1 : 0);

  useEffect(() => {
    if (reduce) {
      return;
    }
    const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2600);
    return () => clearInterval(id);
  }, [reduce]);

  const current = STAGES[stage];

  return (
    <div className="relative mx-auto w-full max-w-[19rem]">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-tr from-emerald-400/30 via-sky-400/20 to-indigo-500/30 blur-2xl"
      />
      <div className="rounded-[2.5rem] border-[10px] border-slate-900 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />

        <p className="text-xs font-medium text-slate-500">Flat 3 · NZD</p>
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Groceries</p>
              <p className="text-xs text-slate-500">Ann paid · split equally</p>
            </div>
            <AnimatedMoney
              cents={9000}
              currency="NZD"
              className="text-sm font-semibold"
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.span
              key={current.status}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${current.tone}`}
            >
              {current.status}
            </motion.span>
          </AnimatePresence>

          <ul className="mt-3 space-y-2 text-xs">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" /> Ann
              </span>
              <span className="font-mono tabular-nums">$45.00</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                {stage === STAGES.length - 1 ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Clock className="size-3.5 text-amber-600" />
                )}
                <AnimatePresence mode="wait">
                  <motion.span
                    key={current.bob}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {current.bob}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="font-mono tabular-nums">$45.00</span>
            </li>
          </ul>
        </div>

        <div className="mt-3 rounded-2xl bg-emerald-600 p-3 text-white">
          <p className="text-xs opacity-80">Bob owes Ann</p>
          <AnimatedMoney
            cents={current.owes}
            currency="NZD"
            className="text-2xl font-semibold"
          />
        </div>

        <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
          {STAGES.map((s, i) => (
            <span
              key={s.status}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stage
                  ? "w-6 bg-emerald-600"
                  : "w-1.5 bg-slate-300 dark:bg-slate-600"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="landing-blob absolute -top-24 -left-24 size-96 rounded-full bg-emerald-400/25 blur-3xl" />
        <div className="landing-blob absolute top-40 -right-24 size-96 rounded-full bg-indigo-400/20 blur-3xl [animation-delay:-6s]" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-10 pb-20 md:grid-cols-2 md:pt-20 md:pb-28">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" /> Built for people who
            share a home
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl"
          >
            Split the bills.
            <br />
            <span className="from-brand bg-gradient-to-r to-sky-500 bg-clip-text text-transparent">
              Keep the peace.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-5 max-w-lg text-lg text-slate-600 dark:text-slate-400"
          >
            SplitHome tracks every shared expense to the cent. Everyone agrees to their
            share, payments are confirmed by the person who is paid, and balances are
            always worked out from the record, never typed in.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <SignInButton className="bg-brand hover:bg-brand-strong focus-visible:outline-brand group inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition-[colors,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]">
              Get started with Google
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </SignInButton>
            <a
              href="#demo"
              className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-6 text-sm font-medium transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Try a split
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <PhoneDemo />
        </motion.div>
      </div>
    </section>
  );
}

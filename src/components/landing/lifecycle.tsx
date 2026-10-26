"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  BadgeCheck,
  CreditCard,
  FilePlus2,
  Lock,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { SectionHeading } from "./reveal";

interface Step {
  icon: LucideIcon;
  title: string;
  status: string;
  tone: string;
  body: string;
  detail: string[];
}

const STEPS: Step[] = [
  {
    icon: FilePlus2,
    title: "Add an expense",
    status: "Pending acceptance",
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    body: "Whoever paid enters it once: amount, category, receipt photo, and who shares it.",
    detail: [
      "Groceries · $90.00",
      "Receipt attached",
      "Split equally: Ann $45.00, Bob $45.00",
    ],
  },
  {
    icon: ThumbsUp,
    title: "Everyone agrees",
    status: "Accepted",
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    body: "Each person accepts only their own share. Disagree and the expense is flagged as disputed.",
    detail: [
      "Bob accepts his $45.00",
      "Payers accept their own share automatically",
      "A rejection notifies the creator",
    ],
  },
  {
    icon: CreditCard,
    title: "Pay back",
    status: "Partially paid",
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    body: "Bob records the payment he made. Nothing counts until the person he paid says it arrived.",
    detail: [
      "Bob records $45.00 to Ann",
      "Status: pending confirmation",
      "Ann gets a notification",
    ],
  },
  {
    icon: BadgeCheck,
    title: "Confirm receipt",
    status: "Paid",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    body: "Only the recipient can confirm. Balances update instantly because they are derived, not stored.",
    detail: ["Ann confirms $45.00", "Bob's share is settled", "Both balances read $0.00"],
  },
  {
    icon: Lock,
    title: "Lock it",
    status: "Locked",
    tone: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    body: "An admin can lock a finished expense. Mistakes after that are fixed with a reversal, never an edit.",
    detail: [
      "Admin locks the expense",
      "Every change is audit logged",
      "Corrections create a new reversal row",
    ],
  },
];

const ADVANCE_MS = 4200;

/** Click-through (and auto-playing) walkthrough of the expense state machine. */
export function Lifecycle() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || reduce) {
      return;
    }
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), ADVANCE_MS);
    return () => clearInterval(id);
  }, [playing, reduce]);

  const step = STEPS[active];
  const Icon = step.icon;

  return (
    <section
      id="how"
      className="scroll-mt-20 bg-slate-50 px-4 py-20 dark:bg-slate-900/50"
    >
      <SectionHeading eyebrow="How it works" title="From “who paid?” to “all square”">
        Every expense follows the same five steps, so nobody has to remember or argue
        about what was agreed.
      </SectionHeading>

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 md:grid-cols-[18rem_1fr]">
        <div
          role="tablist"
          aria-label="Expense lifecycle"
          className="flex gap-2 overflow-x-auto md:flex-col"
        >
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const on = i === active;
            return (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setActive(i);
                  setPlaying(false);
                }}
                className={`relative flex min-h-14 shrink-0 items-center gap-3 overflow-hidden rounded-2xl border px-4 text-left text-sm font-medium transition-colors ${
                  on
                    ? "border-emerald-600 bg-white dark:bg-slate-800"
                    : "border-slate-200 hover:bg-white dark:border-slate-800 dark:hover:bg-slate-800"
                }`}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-lg ${
                    on ? "bg-brand text-white" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <StepIcon className="size-4" />
                </span>
                <span>
                  <span className="block text-[10px] text-slate-500">Step {i + 1}</span>
                  {s.title}
                </span>
                {on && playing && !reduce ? (
                  <motion.span
                    key={`${active}-progress`}
                    className="bg-brand absolute bottom-0 left-0 h-0.5"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: ADVANCE_MS / 1000, ease: "linear" }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="min-h-72 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center gap-3">
                <span className="bg-brand flex size-11 items-center justify-center rounded-xl text-white">
                  <Icon className="size-5" />
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${step.tone}`}
                >
                  {step.status}
                </span>
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-400">{step.body}</p>
              <ul className="mt-5 space-y-2">
                {step.detail.map((line, i) => (
                  <motion.li
                    key={line}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800"
                  >
                    <span className="bg-brand size-1.5 rounded-full" />
                    {line}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

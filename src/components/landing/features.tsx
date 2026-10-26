"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  BellRing,
  Building2,
  Coins,
  ScrollText,
  ShieldCheck,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { SectionHeading } from "./reveal";

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Coins,
    title: "Exact to the cent",
    body: "Money is stored as whole cents, never floats, so totals always match and nothing drifts.",
  },
  {
    icon: ShieldCheck,
    title: "A record nobody can rewrite",
    body: "Expenses and payments are append-only. Fix a mistake with a reversal and the history stays honest.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    body: "Every accepted share, payment and lock is logged with who did it and when.",
  },
  {
    icon: Building2,
    title: "Many households, one login",
    body: "Flat, trip, family: create as many groups as you need, each with its own admin and roles.",
  },
  {
    icon: UserRound,
    title: "Track people without accounts",
    body: "The flatmate who never signs up still owes for groceries. Someone manages their share for them.",
  },
  {
    icon: BellRing,
    title: "Gentle reminders",
    body: "In-app notifications and scheduled nudges chase unpaid shares so you do not have to.",
  },
  {
    icon: Smartphone,
    title: "Feels like a native app",
    body: "Install it to your home screen: bottom tabs, pull to refresh, offline banner, dark mode.",
  },
];

/** Grid of feature cards that stagger in and lift on hover. */
export function Features() {
  const reduce = useReducedMotion();
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-slate-50 px-4 py-20 dark:bg-slate-900/50"
    >
      <SectionHeading eyebrow="Features" title="Everything a shared home needs">
        Built for a handful of people who trust each other and want the numbers to be
        right anyway.
      </SectionHeading>

      <ul className="mx-auto mt-10 grid w-full max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.li
              key={f.title}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.45,
                delay: (i % 3) * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={reduce ? undefined : { y: -4 }}
              className="group rounded-3xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-950 dark:text-emerald-300">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                {f.body}
              </p>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

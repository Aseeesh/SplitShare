"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

export interface TabItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only this exact path rather than anything beneath it. */
  exact?: boolean;
}

/**
 * The shared bottom tab bar: an animated pill slides between tabs
 * (`layoutId`), icons spring on tap, and the bar clears the home-indicator
 * inset. `group` keeps two bars' pills independent.
 */
export function TabBar({
  items,
  pathname,
  group,
  label,
}: {
  items: TabItem[];
  pathname: string;
  group: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden dark:border-slate-800 dark:bg-slate-950/90"
    >
      <ul className="mx-auto flex w-full max-w-2xl px-2">
        {items.map(({ href, label: text, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  // A light tick where supported (Android; iOS ignores it).
                  try {
                    navigator.vibrate?.(8);
                  } catch {
                    /* haptics are a nicety */
                  }
                }}
                className="relative flex min-h-14 flex-col items-center justify-center gap-0.5 select-none"
              >
                {active ? (
                  <motion.span
                    layoutId={`tab-pill-${group}`}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="bg-brand/12 absolute inset-x-3 top-1.5 bottom-1.5 rounded-2xl"
                  />
                ) : null}
                <motion.span
                  whileTap={{ scale: 0.85 }}
                  animate={{ y: active ? -1 : 0, scale: active ? 1.08 : 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 26 }}
                  className={`relative ${active ? "text-brand-strong" : "text-slate-500 dark:text-slate-400"}`}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </motion.span>
                <span
                  className={`relative text-[11px] font-medium ${
                    active ? "text-brand-strong" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {text}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

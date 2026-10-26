"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "#demo", label: "Try a split" },
  { href: "#how", label: "How it works" },
  { href: "#balances", label: "Settle up" },
  { href: "#features", label: "Features" },
];

/** Sticky top bar; gains a blurred background once the page scrolls. */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-200 ${
        scrolled
          ? "bg-white/80 shadow-sm backdrop-blur-md dark:bg-slate-950/80"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="bg-brand flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
          >
            S
          </span>
          SplitHome
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-6 text-sm md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Link
          href="/signin"
          className="bg-brand hover:bg-brand-strong focus-visible:outline-brand inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-white transition-[colors,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

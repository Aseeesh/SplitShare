"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Home, Menu, ShieldCheck, User, Users, X, type LucideIcon } from "lucide-react";

import { SignOutButton } from "@/components/pwa/sign-out-button";

import { GlobalTabs } from "./global-tabs";
import { PullToRefresh } from "./pull-to-refresh";

interface ShellUser {
  name: string | null;
  email: string | null;
  image: string | null;
  isSuperUser?: boolean;
}

const NAV: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/households", label: "Households", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

const ADMIN_NAV: (typeof NAV)[number] = {
  href: "/admin",
  label: "Console",
  icon: ShieldCheck,
};

function isActive(href: string, pathname: string, exact = false): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

/**
 * The app chrome: a top bar on desktop (logo + inline nav + account), and on
 * mobile a slim bar whose hamburger opens a slide-out drawer. The household
 * bottom tab bar is mobile-only, so desktop uses the top menu and mobile uses
 * the bottom menu. Signed-out visitors get the landing page with no chrome, so
 * nothing here throws for them.
 */
export function AppShell({
  user,
  signOutAction,
  children,
}: {
  user: ShellUser | null;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Signed out: render the landing page with no navigation chrome.
  if (!user) {
    return <div className="flex min-h-dvh flex-col">{children}</div>;
  }

  const navItems: typeof NAV = user.isSuperUser ? [...NAV, ADMIN_NAV] : NAV;
  const drawerNav = navItems.map(({ href, label, icon: Icon, exact }) => {
    const active = isActive(href, pathname, exact);
    return (
      <li key={href}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            active
              ? "bg-brand/10 text-brand-strong"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </Link>
      </li>
    );
  });

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar — desktop shows the full menu; mobile shows the hamburger. */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="bg-brand flex size-7 items-center justify-center rounded-lg text-sm font-bold text-white"
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              SplitHome
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="App">
            {navItems.map(({ href, label, exact }) => {
              const active = isActive(href, pathname, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand/10 text-brand-strong"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-3 lg:flex">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                className="size-8 rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
              />
            ) : (
              <span className="bg-brand/15 text-brand-strong flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="[&_button]:text-sm [&_button]:text-slate-600 dark:[&_button]:text-slate-300">
              <SignOutButton action={signOutAction} />
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
              className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm dark:bg-black/50"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold tracking-tight">Menu</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>

              <div className="border-b border-slate-200 px-4 pb-4 dark:border-slate-800">
                <p className="truncate text-sm font-medium">{user.name ?? "Signed in"}</p>
                {user.email && (
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.email}
                  </p>
                )}
              </div>

              <nav className="flex-1 px-2 py-2" aria-label="App">
                <ul className="space-y-1">{drawerNav}</ul>
              </nav>

              <div
                className="border-t border-slate-200 p-4 dark:border-slate-800"
                onClick={() => setOpen(false)}
              >
                <SignOutButton action={signOutAction} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <PullToRefresh>{children}</PullToRefresh>
      </div>
      <GlobalTabs isSuperUser={Boolean(user.isSuperUser)} />
    </div>
  );
}

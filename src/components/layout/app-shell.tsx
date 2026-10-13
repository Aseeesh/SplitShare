"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Home, Menu, Users, X } from "lucide-react";

import { SignOutButton } from "@/components/pwa/sign-out-button";

interface ShellUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/households", label: "Households", icon: Users },
];

function isActive(href: string, pathname: string, exact = false): boolean {
  return exact ? pathname === href : pathname.startsWith(href);
}

/**
 * The authenticated app chrome: a thin top bar with a hamburger that opens a
 * slide-out app menu. The household pages keep their own header and bottom tabs
 * inside `children`; this shell is only the global layer above them.
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

  // Lock scroll while the drawer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
          >
            SplitHome
          </Link>
        </div>
      </header>

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
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950"
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

              {user && (
                <div className="border-b border-slate-200 px-4 pb-4 dark:border-slate-800">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt=""
                      className="size-10 rounded-full ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="mt-2 truncate text-sm font-medium">
                    {user.name ?? "Signed in"}
                  </p>
                  {user.email && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                  )}
                </div>
              )}

              <nav className="flex-1 px-2 py-2" aria-label="App">
                <ul className="space-y-1">
                  {NAV.map(({ href, label, icon: Icon, exact }) => {
                    const active = isActive(href, pathname, exact);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900"
                          }`}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
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

      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

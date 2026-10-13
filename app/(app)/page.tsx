import Link from "next/link";

import { FadeIn, StaggerItem } from "@/components/ui/motion";
import { getOptionalUser } from "@/lib/auth/guards";

/**
 * The landing page / signed-in home.
 *
 * Signed out, this is the marketing-style hero with a sign-in CTA (no shell
 * chrome — the AppShell renders children bare when there is no user). Signed
 * in, it becomes a short "back to your households" home.
 */
export default async function Home() {
  const user = await getOptionalUser();

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl text-center">
        <FadeIn>
          <span
            aria-hidden="true"
            className="bg-brand mx-auto flex size-16 items-center justify-center rounded-2xl text-3xl font-bold text-white shadow-lg shadow-emerald-500/20"
          >
            S
          </span>
        </FadeIn>

        <StaggerItem index={1}>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
            SplitHome
          </h1>
        </StaggerItem>

        <StaggerItem index={2}>
          <p className="mx-auto mt-4 max-w-md text-lg text-slate-600 dark:text-slate-400">
            Share household expenses without the spreadsheet. Every amount tracked to the
            cent, every split agreed by the people paying it, and balances always derived
            from the record.
          </p>
        </StaggerItem>

        <StaggerItem index={3}>
          <div className="mt-8">
            {user ? (
              <Link
                href="/households"
                className="bg-brand hover:bg-brand-strong focus-visible:outline-brand inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-medium text-white transition-[colors,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
              >
                Open your households
              </Link>
            ) : (
              <Link
                href="/signin"
                className="bg-brand hover:bg-brand-strong focus-visible:outline-brand inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-medium text-white transition-[colors,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98]"
              >
                Sign in with Google
              </Link>
            )}
          </div>
        </StaggerItem>
      </div>
    </main>
  );
}

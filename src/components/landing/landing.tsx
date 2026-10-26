import Link from "next/link";

import { BalancesDemo } from "./balances-demo";
import { Features } from "./features";
import { Hero } from "./hero";
import { Lifecycle } from "./lifecycle";
import { LandingNav } from "./nav";
import { Reveal } from "./reveal";
import { SplitDemo } from "./split-demo";

/** The signed-out home page: a scrolling tour of what the app does. */
export function Landing() {
  return (
    <div className="flex-1">
      <LandingNav />
      <main>
        <Hero />
        <SplitDemo />
        <Lifecycle />
        <BalancesDemo />
        <Features />

        <section className="px-4 py-24">
          <Reveal className="bg-navy mx-auto max-w-4xl rounded-[2rem] px-6 py-14 text-center text-white sm:px-12">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to stop keeping score?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-white/80">
              Create a household in under a minute, invite your flatmates by email, and
              add your first expense.
            </p>
            <Link
              href="/signin"
              className="mt-8 inline-flex min-h-12 items-center rounded-xl bg-white px-7 text-sm font-semibold text-slate-900 transition-[transform,background-color] hover:bg-slate-100 active:scale-[0.98]"
            >
              Sign in with Google
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-4 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
        SplitHome · Share household expenses without the spreadsheet.
      </footer>
    </div>
  );
}

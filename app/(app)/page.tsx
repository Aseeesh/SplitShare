import Link from "next/link";

import { ActivityFeed } from "@/components/overview/activity-feed";
import { IncomeTiles } from "@/components/overview/income-tiles";
import { OrgBreakdown } from "@/components/overview/org-breakdown";
import { SpendHero } from "@/components/overview/spend-hero";
import { getOverview, listRecentActivity } from "@/lib/overview/queries";

import { Landing } from "@/components/landing/landing";
import { FadeIn } from "@/components/ui/motion";
import { getOptionalUser } from "@/lib/auth/guards";

/**
 * The landing page / signed-in home.
 *
 * Signed out, this is the animated marketing landing page (no shell chrome —
 * the AppShell renders children bare when there is no user). Signed
 * in, it becomes a short "back to your households" home.
 */
export default async function Home() {
  const user = await getOptionalUser();

  if (user) {
    const [overview, activity] = await Promise.all([getOverview(), listRecentActivity()]);
    const first = (user.name ?? user.email ?? "there").split(/[ @]/)[0];

    if (overview.households.length === 0) {
      return (
        <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
          <h1 className="text-2xl font-semibold tracking-tight">Hi {first}</h1>
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            You are not in any household yet.{" "}
            <Link href="/households" className="font-medium underline">
              Create one
            </Link>{" "}
            to become its admin, or open an invitation link to join.
          </p>
        </main>
      );
    }

    return (
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 p-4">
        <FadeIn>
          <h1 className="text-2xl font-semibold tracking-tight">Hi {first}</h1>
        </FadeIn>

        {overview.currency ? (
          <>
            <SpendHero
              currency={overview.currency}
              weekCents={overview.weekSpendCents}
              monthCents={overview.monthSpendCents}
              weekly={overview.weekly}
              monthly={overview.monthly}
            />
            <IncomeTiles
              currency={overview.currency}
              receivedCents={overview.incomeReceivedCents}
              pendingCents={overview.incomePendingCents}
              oweCents={overview.youOweCents}
            />
          </>
        ) : (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Your groups use different currencies, so combined totals are hidden. Each
            group below shows its own figures.
          </p>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">Your groups</h2>
          <OrgBreakdown
            households={overview.households}
            currency={overview.currency ?? overview.households[0]!.currency}
            combined={overview.currency !== null}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">Recent activity</h2>
          <ActivityFeed items={activity} />
        </section>
      </main>
    );
  }

  return <Landing />;
}

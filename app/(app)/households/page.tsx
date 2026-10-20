import type { Metadata } from "next";
import Link from "next/link";

import { listHouseholds } from "@/lib/households/queries";
import { formatSignedMoney } from "@/lib/money";
import { balanceToneClass, ROLE_TONES, STATUS_BADGE_BASE } from "@/lib/ui/status";
import { StaggerItem } from "@/components/ui/motion";
import { CreateHousehold } from "@/components/households/create-household";

export const metadata: Metadata = {
  title: "Your households",
};

/**
 * The list an accepted invitation lands on.
 *
 * Minimal on purpose: enough to confirm membership took effect and to show each
 * household's net position. The per-household dashboard is not built yet, so
 * nothing here links into one.
 */
export default async function HouseholdsPage() {
  const households = await listHouseholds();
  const totalCents = households.reduce(
    (sum, household) => sum + household.yourNetCents,
    0,
  );
  const singleCurrency =
    new Set(households.map((household) => household.currency)).size === 1
      ? (households[0]?.currency ?? null)
      : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your households</h1>

      <div className="mt-4">
        <CreateHousehold />
      </div>

      {households.length > 0 && singleCurrency ? (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-medium">Across all groups</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Combined net position
            </p>
          </div>
          <p
            className={`font-mono text-lg font-semibold ${balanceToneClass(totalCents)}`}
          >
            {formatSignedMoney(totalCents, singleCurrency)}
          </p>
        </div>
      ) : null}

      {households.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          You are not a member of any household yet. Create one above to become its admin,
          or open the link in an invitation email to join someone else&apos;s.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {households.map((household, i) => {
            const tone = ROLE_TONES[household.role];
            return (
              <StaggerItem key={household.id} index={i}>
                <Link
                  href={`/households/${household.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{household.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`${STATUS_BADGE_BASE} ${tone.className}`}>
                        {tone.label}
                      </span>
                      {household.memberCount}{" "}
                      {household.memberCount === 1 ? "member" : "members"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-mono text-sm font-medium ${balanceToneClass(household.yourNetCents)}`}
                    >
                      {formatSignedMoney(household.yourNetCents, household.currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {household.yourNetCents > 0
                        ? "owed to you"
                        : household.yourNetCents < 0
                          ? "you owe"
                          : "settled"}
                    </p>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </div>
      )}
    </main>
  );
}

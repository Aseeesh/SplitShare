import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HistoryTimeline } from "@/components/history/history-timeline";
import { AppHeader } from "@/components/layout/app-header";
import { HouseholdNav } from "@/components/layout/household-nav";
import { NotAMemberError } from "@/lib/auth/errors";
import { listHouseholdHistory } from "@/lib/history/queries";
import { getHousehold } from "@/lib/households/queries";

export const metadata: Metadata = {
  title: "History",
};

/**
 * The combined activity feed: every expense and payment in the household,
 * newest first, with status and receipt indicators.
 */
export default async function HistoryPage({
  params,
}: PageProps<"/households/[householdId]/history">) {
  const { householdId } = await params;

  let household;
  try {
    household = await getHousehold(householdId);
  } catch (error) {
    // A household the viewer is not in must look missing, not forbidden (§2.4d).
    if (error instanceof NotAMemberError) {
      notFound();
    }
    throw error;
  }

  const entries = await listHouseholdHistory(householdId);

  return (
    <>
      <AppHeader householdName={household.name} role={household.yourRole} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 pb-24">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">History</h1>
          <a
            href={`/api/households/${householdId}/export`}
            className="text-brand-strong hover:text-brand text-sm font-medium underline underline-offset-4"
          >
            Export CSV
          </a>
        </div>
        <HistoryTimeline householdId={householdId} entries={entries} />
      </main>
      <HouseholdNav householdId={householdId} />
    </>
  );
}

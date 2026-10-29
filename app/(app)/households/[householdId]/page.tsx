import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AwaitingActionList } from "@/components/expenses/awaiting-action";
import { ExpenseList } from "@/components/expenses/expense-list";
import { RecurringSection } from "@/components/expenses/recurring";
import { SpendingCharts } from "@/components/expenses/spending-charts";
import { AppHeader } from "@/components/layout/app-header";
import { HouseholdNav } from "@/components/layout/household-nav";
import { BalanceSummary, SettleUpPlan } from "@/components/dashboard/balance-summary";
import { AcceptanceSetting } from "@/components/households/acceptance-setting";
import { DefaultSplitSetting } from "@/components/households/default-split-setting";
import { Card, CardHeader } from "@/components/ui/card";
import { Fab } from "@/components/ui/fab";
import { NotAMemberError } from "@/lib/auth/errors";
import { requirePageUser } from "@/lib/auth/guards";
import { getMonthlySpending, getSpendingByCategory } from "@/lib/expenses/analytics";
import { listAwaitingYourAction, listExpenses } from "@/lib/expenses/queries";
import { getHousehold } from "@/lib/households/queries";
import { listRecurringExpenses } from "@/lib/recurring/queries";

export const metadata: Metadata = {
  title: "Household",
};

/**
 * The household dashboard.
 *
 * Everything on it is derived: balances come from the §12 views, and the
 * settle-up plan from the pure minimiser. Nothing here stores or recomputes
 * money.
 */
export default async function HouseholdPage({
  params,
}: PageProps<"/households/[householdId]">) {
  const { householdId } = await params;
  const viewer = await requirePageUser();

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

  // A super user who is not a member can read but not add, and the add page 404s for them.
  const canAddExpense =
    household.capabilities.includes("CREATE_EXPENSE") && !household.viaSuperUser;

  const [awaiting, expenses, byCategory, byMonth, recurring] = await Promise.all([
    listAwaitingYourAction(householdId),
    listExpenses(householdId, { limit: 20 }),
    getSpendingByCategory(householdId),
    getMonthlySpending(householdId),
    listRecurringExpenses(householdId),
  ]);

  return (
    <>
      <AppHeader
        householdId={household.id}
        householdName={household.name}
        role={household.yourRole}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4 pb-24">
        <BalanceSummary
          members={household.members}
          currency={household.currency}
          viewerUserId={viewer.id}
        />

        {household.capabilities.includes("ACCEPT_OWN_SPLIT") ? (
          <AwaitingActionList householdId={householdId} items={awaiting} />
        ) : null}

        <SettleUpPlan
          members={household.members}
          currency={household.currency}
          viewerUserId={viewer.id}
        />

        <SpendingCharts
          byCategory={byCategory}
          byMonth={byMonth}
          currency={household.currency}
        />

        {household.capabilities.includes("MANAGE_SETTINGS") ? (
          <Card>
            <CardHeader title="Settings" />
            <DefaultSplitSetting
              householdId={householdId}
              current={household.defaultSplitMethod}
              canManage
            />
            <AcceptanceSetting
              householdId={householdId}
              requireAcceptance={household.requireAcceptance}
            />
          </Card>
        ) : null}

        <RecurringSection
          householdId={householdId}
          currency={household.currency}
          members={household.members.map((member) => ({
            userId: member.userId,
            name: member.name ?? member.email,
          }))}
          items={recurring}
          canCreate={household.capabilities.includes("CREATE_EXPENSE")}
        />

        <ExpenseList
          householdId={householdId}
          expenses={expenses}
          canAdd={canAddExpense}
        />
      </main>
      {canAddExpense ? (
        <Fab href={`/households/${householdId}/expenses/new`} label="Add an expense" />
      ) : null}
      <HouseholdNav householdId={householdId} />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExpenseForm, type CorrectionSeed } from "@/components/expenses/expense-form";
import { AppHeader } from "@/components/layout/app-header";
import { HouseholdNav } from "@/components/layout/household-nav";
import { InsufficientRoleError, NotAMemberError } from "@/lib/auth/errors";
import { requireAuth, requireCapability } from "@/lib/auth/guards";
import { getExpense } from "@/lib/expenses/queries";
import { toMoneyInput } from "@/lib/money";
import { prisma } from "@/lib/db/client";
import { getHousehold } from "@/lib/households/queries";

export const metadata: Metadata = { title: "Add an expense" };

export default async function NewExpensePage({
  params,
  searchParams,
}: PageProps<"/households/[householdId]/expenses/new">) {
  const { householdId } = await params;
  const { correct } = await searchParams;
  const viewer = await requireAuth();

  try {
    // §5 — a VIEWER has no business on this page at all, so it is refused here
    // rather than only when the form is submitted. A correction is authorised by
    // the edit right instead (checked below, per expense).
    if (typeof correct !== "string") {
      await requireCapability(householdId, "CREATE_EXPENSE");
    } else {
      await requireCapability(householdId, "VIEW_HOUSEHOLD");
    }
  } catch (error) {
    if (error instanceof NotAMemberError || error instanceof InsufficientRoleError) {
      notFound();
    }
    throw error;
  }

  const [household, categories] = await Promise.all([
    getHousehold(householdId),
    prisma.category.findMany({
      where: { householdId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // "Edit" is a correction: pre-fill from the original, which is reversed once
  // the replacement is saved. Needs the edit right for that specific expense.
  let seed: CorrectionSeed | undefined;
  if (typeof correct === "string") {
    const original = await getExpense(householdId, correct);
    if (!original || original.status === "LOCKED" || original.status === "REVERSED") {
      notFound();
    }
    try {
      await requireCapability(
        householdId,
        original.createdByUserId === viewer.id ? "EDIT_OWN_EXPENSE" : "EDIT_ANY_EXPENSE",
      );
    } catch {
      notFound();
    }
    // Keep the original method, so a percentage or shares split stays one.
    const weightOf = (split: (typeof original.splits)[number]): string => {
      switch (original.splitMethod) {
        case "EXACT":
          return toMoneyInput(split.amountCents, original.currency);
        case "PERCENTAGE":
          return split.percentBps === null ? "" : toMoneyInput(split.percentBps, "XXX");
        case "SHARES":
          return split.shares === null ? "" : String(split.shares);
        default:
          return "";
      }
    };
    seed = {
      expenseId: original.id,
      description: original.description,
      amountText: toMoneyInput(original.amountCents, original.currency),
      date: original.date.toISOString().slice(0, 10),
      categoryId: original.categoryId ?? "",
      paidByUserId: original.paidByUserId,
      method: original.splitMethod,
      selected: original.splits.map((split) => split.userId),
      weights: Object.fromEntries(
        original.splits.map((split) => [split.userId, weightOf(split)]),
      ),
    };
  }

  return (
    <>
      <AppHeader householdName={household.name} role={household.yourRole} />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-24">
        <h1 className="mb-4 text-xl font-semibold tracking-tight">
          {seed ? "Correct expense" : "Add an expense"}
        </h1>
        <ExpenseForm
          householdId={householdId}
          currency={household.currency}
          viewerUserId={viewer.id}
          defaultMethod={household.defaultSplitMethod}
          categories={categories}
          correcting={seed}
          members={household.members.map((member) => ({
            userId: member.userId,
            name: member.name ?? member.email,
            // The form labels these "(tracked)", since nobody will accept for
            // them — their share counts straight away (§8a).
            isPlaceholder: member.email.endsWith("@splithome.invalid"),
          }))}
        />
      </main>
      <HouseholdNav householdId={householdId} />
    </>
  );
}

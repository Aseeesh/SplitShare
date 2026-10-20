"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth, requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { loadReversible, reverseInTransaction } from "@/lib/expenses/reverse-core";
import { reverseExpenseSchema } from "@/lib/expenses/schema";

/**
 * Deletes an expense by reversing it (§2.2, §7): the original stays on the
 * record and a negating entry cancels it in the balances.
 */
export async function reverseExpense(
  input: unknown,
): Promise<ActionResult<{ reversalExpenseId: string }>> {
  try {
    const data = reverseExpenseSchema.parse(input);
    // Entry guard (a)-(c). Which delete right applies depends on who created
    // the expense, so that is checked below once it has been loaded.
    await requireCapability(data.householdId, "VIEW_HOUSEHOLD");
    const actor = await requireAuth();

    const expense = await loadReversible(data.expenseId);
    if (!expense || expense.householdId !== data.householdId) {
      return fail("WRONG_HOUSEHOLD", "Not found");
    }
    await requireCapability(
      data.householdId,
      expense.createdByUserId === actor.id ? "DELETE_OWN_EXPENSE" : "DELETE_ANY_EXPENSE",
    );
    if (expense.alreadyReversed) {
      return fail("CONFLICT", "That expense has already been reversed.");
    }

    const reversalExpenseId = await prisma.$transaction((tx) =>
      reverseInTransaction(tx, expense, { actorUserId: actor.id, reason: data.reason }),
    );

    revalidatePath(`/households/${data.householdId}`);
    return ok({ reversalExpenseId });
  } catch (error) {
    return toActionResult(error);
  }
}

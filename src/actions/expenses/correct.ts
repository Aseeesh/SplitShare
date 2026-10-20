"use server";

import { z } from "zod";

import { fail, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth, requireCapability } from "@/lib/auth/guards";
import { createExpenseCore } from "@/lib/expenses/create-core";
import { loadReversible, reverseInTransaction } from "@/lib/expenses/reverse-core";
import { statusAfterReversal } from "@/lib/expenses/state";

const envelope = z.object({ householdId: z.uuid(), correctsExpenseId: z.uuid() });

/**
 * Edits an expense the only way an immutable ledger allows: the corrected
 * expense is created and the original is reversed in ONE transaction, so a
 * failure can never leave the old figures deleted without their replacement, or
 * both counted at once.
 *
 * The replacement goes through exactly the same validation and split maths as a
 * brand-new expense (§2.5); the caller sends the full corrected input, and
 * `correctsExpenseId` says which expense it replaces.
 */
export async function correctExpense(
  input: unknown,
): Promise<ActionResult<{ expenseId: string; status: string }>> {
  try {
    const { householdId, correctsExpenseId } = envelope.parse(input);
    await requireCapability(householdId, "VIEW_HOUSEHOLD");
    const actor = await requireAuth();

    const original = await loadReversible(correctsExpenseId);
    if (!original || original.householdId !== householdId) {
      return fail("WRONG_HOUSEHOLD", "Not found");
    }
    const editRight =
      original.createdByUserId === actor.id ? "EDIT_OWN_EXPENSE" : "EDIT_ANY_EXPENSE";
    await requireCapability(householdId, editRight);
    if (original.alreadyReversed) {
      return fail("CONFLICT", "That expense has already been replaced or deleted.");
    }
    statusAfterReversal(original.status); // refuses a LOCKED expense before any work

    return await createExpenseCore(input, {
      // The edit right is what authorises writing the replacement, so a super
      // user who is not a member (and so cannot "create") can still correct.
      capability: editRight,
      inTransaction: async (tx, newExpenseId) => {
        await reverseInTransaction(tx, original, {
          actorUserId: actor.id,
          reason: "Corrected",
          replacementExpenseId: newExpenseId,
        });
      },
    });
  } catch (error) {
    return toActionResult(error);
  }
}

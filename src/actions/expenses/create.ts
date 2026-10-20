"use server";

import { type ActionResult } from "@/lib/actions/result";
import { createExpenseCore } from "@/lib/expenses/create-core";

/**
 * Creates an expense (§6, §40 step 3). The work lives in `createExpenseCore` so
 * that `correctExpense` can run the very same code, plus a reversal, in one
 * transaction.
 */
export async function createExpense(
  input: unknown,
): Promise<ActionResult<{ expenseId: string; status: string }>> {
  return createExpenseCore(input);
}

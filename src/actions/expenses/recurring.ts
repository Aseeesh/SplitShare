"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { toDbCents } from "@/lib/money";

const createRecurringExpenseSchema = z.object({
  householdId: z.uuid(),
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().nonnegative(),
  categoryId: z.uuid().nullable(),
  paidByUserId: z.uuid(),
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY", "YEARLY"]),
  startAt: z.string().min(1),
});

const toggleRecurringExpenseSchema = z.object({
  householdId: z.uuid(),
  id: z.uuid(),
  active: z.boolean(),
});

/** Creates a recurring expense template (always split EQUAL among all members). */
export async function createRecurringExpense(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createRecurringExpenseSchema.parse(input);
    const membership = await requireCapability(data.householdId, "CREATE_EXPENSE");

    const recurring = await prisma.recurringExpense.create({
      data: {
        householdId: data.householdId,
        createdByUserId: membership.userId,
        description: data.description,
        amountCents: toDbCents(data.amountCents),
        currency: membership.currency,
        categoryId: data.categoryId,
        paidByUserId: data.paidByUserId,
        splitMethod: "EQUAL",
        frequency: data.frequency,
        nextRunAt: new Date(data.startAt),
      },
      select: { id: true },
    });

    revalidatePath(`/households/${data.householdId}`);
    return ok({ id: recurring.id });
  } catch (error) {
    return toActionResult(error);
  }
}

/** Pauses or resumes a recurring expense. */
export async function toggleRecurringExpense(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const data = toggleRecurringExpenseSchema.parse(input);
    await requireCapability(data.householdId, "CREATE_EXPENSE");

    await prisma.recurringExpense.update({
      where: { id: data.id },
      data: { active: data.active },
    });

    revalidatePath(`/households/${data.householdId}`);
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

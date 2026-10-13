"use server";

import { revalidatePath } from "next/cache";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireCapability } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

import { updateDefaultSplitMethodSchema } from "./schema";

/**
 * §5 — ADMIN only. Sets the split method the expense form pre-selects for new
 * expenses in this household.
 */
export async function updateDefaultSplitMethod(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const data = updateDefaultSplitMethodSchema.parse(input);
    await requireCapability(data.householdId, "MANAGE_SETTINGS");

    await prisma.household.update({
      where: { id: data.householdId },
      data: { defaultSplitMethod: data.method },
    });

    revalidatePath(`/households/${data.householdId}`);
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

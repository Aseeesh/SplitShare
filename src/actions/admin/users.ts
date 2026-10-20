"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { writePlatformAudit } from "@/lib/audit/platform";
import { writeAuditLog } from "@/lib/audit/write";
import { requireSuperUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

const setUserDisabledSchema = z.object({
  userId: z.uuid(),
  disabled: z.boolean(),
});

/**
 * Suspends or reinstates an account (super user only).
 *
 * Suspension, not deletion: the user's expenses, splits and payments are
 * immutable financial facts (§2.2). Their sessions are deleted so access ends
 * immediately, and `requireAuth` re-checks the flag on every request.
 */
export async function setUserDisabled(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = setUserDisabledSchema.parse(input);

    if (data.userId === actor.id) {
      return fail("CONFLICT", "You cannot suspend your own account.");
    }

    const target = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, isSuperUser: true, disabledAt: true },
    });
    if (!target) {
      return fail("WRONG_HOUSEHOLD", "Not found");
    }
    if (target.isSuperUser) {
      return fail("CONFLICT", "Super users cannot be suspended from the console.");
    }
    if ((target.disabledAt !== null) === data.disabled) {
      return ok(null);
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { disabledAt: data.disabled ? new Date() : null },
      });
      if (data.disabled) {
        await tx.session.deleteMany({ where: { userId: target.id } });
      }

      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: data.disabled ? "USER_DISABLED" : "USER_ENABLED",
        entityType: "user",
        entityId: target.id,
        before: { disabled: !data.disabled },
        after: { disabled: data.disabled },
      });

      // §11 — audit rows are household-scoped, so record one per household
      // the user belongs to.
      const memberships = await tx.householdMember.findMany({
        where: { userId: target.id, removedAt: null },
        select: { householdId: true },
      });
      for (const { householdId } of memberships) {
        await writeAuditLog(tx, {
          householdId,
          actorUserId: actor.id,
          action: data.disabled ? "USER_DISABLED" : "USER_ENABLED",
          entityType: "user",
          entityId: target.id,
          before: { disabled: !data.disabled },
          after: { disabled: data.disabled },
        });
      }
    });

    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

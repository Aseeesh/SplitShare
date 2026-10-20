"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { writeAuditLog } from "@/lib/audit/write";
import {
  requireAuth,
  requireCapability,
  requireHouseholdMember,
} from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

const householdIdSchema = z.object({ householdId: z.uuid() });

/**
 * Deactivates a household (ADMIN, or a role the super user granted).
 *
 * It becomes ARCHIVED: invisible and read-only to everyone but a super user,
 * and permanently deleted by the cron 30 days later. Nothing is deleted here —
 * an admin can still restore it inside the window.
 */
export async function archiveHousehold(input: unknown): Promise<ActionResult<null>> {
  try {
    const data = householdIdSchema.parse(input);
    const membership = await requireCapability(data.householdId, "ARCHIVE_HOUSEHOLD");
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const updated = await tx.household.updateMany({
        where: { id: data.householdId, status: "ACTIVE" },
        data: { status: "ARCHIVED", archivedAt: now },
      });
      if (updated.count === 0) {
        return;
      }
      await writeAuditLog(tx, {
        householdId: data.householdId,
        actorUserId: membership.userId,
        action: "HOUSEHOLD_ARCHIVED",
        entityType: "household",
        entityId: data.householdId,
        before: { status: "ACTIVE" },
        after: { status: "ARCHIVED", archivedAt: now.toISOString() },
      });
    });

    revalidatePath("/households");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * Restores an ARCHIVED household. The guard chain hides archived households
 * from members, so this checks the admin role directly: it must be an ADMIN of
 * that household (§2.4 b, c), or a super user.
 */
export async function restoreHousehold(input: unknown): Promise<ActionResult<null>> {
  try {
    const user = await requireAuth();
    const data = householdIdSchema.parse(input);

    const household = await prisma.household.findUnique({
      where: { id: data.householdId },
      select: {
        status: true,
        members: {
          where: { userId: user.id, removedAt: null, role: "ADMIN" },
          select: { id: true },
        },
      },
    });
    const allowed = household && (user.isSuperUser || household.members.length > 0);
    if (!household || !allowed) {
      return fail("NOT_A_MEMBER", "Not found");
    }
    if (household.status !== "ARCHIVED") {
      return fail("CONFLICT", "That household is not archived.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: data.householdId },
        data: { status: "ACTIVE", archivedAt: null },
      });
      await writeAuditLog(tx, {
        householdId: data.householdId,
        actorUserId: user.id,
        action: "HOUSEHOLD_RESTORED",
        entityType: "household",
        entityId: data.householdId,
        before: { status: "ARCHIVED" },
        after: { status: "ACTIVE" },
      });
    });

    revalidatePath("/households");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

/**
 * A member leaves a household. Soft removal, like an admin removing them, so
 * their expenses and splits keep pointing at a real membership (§2.2).
 *
 * Refused while they carry an unsettled balance would be kinder to everyone
 * else, but the household still owes them (or vice versa) after they leave, so
 * it is allowed and the balance stays on the books. The last admin cannot
 * leave: that would orphan the household.
 */
export async function leaveHousehold(input: unknown): Promise<ActionResult<null>> {
  try {
    const data = householdIdSchema.parse(input);
    const membership = await requireHouseholdMember(data.householdId);
    if (membership.viaSuperUser) {
      return fail("CONFLICT", "You are not a member of this household.");
    }

    if (membership.role === "ADMIN") {
      const others = await prisma.householdMember.count({
        where: {
          householdId: data.householdId,
          removedAt: null,
          role: "ADMIN",
          userId: { not: membership.userId },
        },
      });
      if (others === 0) {
        return fail(
          "CONFLICT",
          "You are the only admin. Promote someone else, or deactivate the household.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const member = await tx.householdMember.update({
        where: {
          householdId_userId: {
            householdId: data.householdId,
            userId: membership.userId,
          },
        },
        data: { removedAt: new Date() },
        select: { id: true },
      });
      await writeAuditLog(tx, {
        householdId: data.householdId,
        actorUserId: membership.userId,
        action: "MEMBER_LEFT",
        entityType: "household_member",
        entityId: member.id,
        before: { userId: membership.userId, role: membership.role },
        after: { userId: membership.userId, left: true },
      });
    });

    revalidatePath("/households");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

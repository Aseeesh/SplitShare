"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { writePlatformAudit } from "@/lib/audit/platform";
import { writeAuditLog } from "@/lib/audit/write";
import { requireSuperUser } from "@/lib/auth/guards";
import { ALL_CAPABILITIES, type Capability } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { notifyHouseholdMembers } from "@/lib/notifications/members";
import { getPlatformLimits } from "@/lib/platform/limits";
import { SETTING_KEYS } from "@/lib/platform/limits-core";

const limit = z.number().int().min(1).max(1000);

const platformLimitsSchema = z.object({
  maxHouseholdsPerAdmin: limit,
  maxMembersPerHousehold: limit,
});

/** Sets the platform-wide defaults (super user only). */
export async function setPlatformLimits(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = platformLimitsSchema.parse(input);
    const before = await getPlatformLimits();
    await prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key: SETTING_KEYS.maxHouseholds },
        create: { key: SETTING_KEYS.maxHouseholds, value: data.maxHouseholdsPerAdmin },
        update: { value: data.maxHouseholdsPerAdmin },
      });
      await tx.platformSetting.upsert({
        where: { key: SETTING_KEYS.maxMembers },
        create: { key: SETTING_KEYS.maxMembers, value: data.maxMembersPerHousehold },
        update: { value: data.maxMembersPerHousehold },
      });
      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: "PLATFORM_LIMITS_CHANGED",
        entityType: "platform_settings",
        before,
        after: data,
      });
    });
    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

const userLimitSchema = z.object({
  userId: z.uuid(),
  /** Null clears the override and returns the user to the platform default. */
  maxHouseholds: limit.nullable(),
});

export async function setUserHouseholdLimit(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = userLimitSchema.parse(input);
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: data.userId },
        select: { maxHouseholdsOverride: true },
      });
      await tx.user.update({
        where: { id: data.userId },
        data: { maxHouseholdsOverride: data.maxHouseholds },
      });
      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: "USER_LIMIT_CHANGED",
        entityType: "user",
        entityId: data.userId,
        before: { maxHouseholds: before.maxHouseholdsOverride },
        after: { maxHouseholds: data.maxHouseholds },
      });
    });
    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

const householdLimitSchema = z.object({
  householdId: z.uuid(),
  maxMembers: limit.nullable(),
});

export async function setHouseholdMemberLimit(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = householdLimitSchema.parse(input);
    await prisma.$transaction(async (tx) => {
      const before = await tx.household.findUniqueOrThrow({
        where: { id: data.householdId },
        select: { maxMembersOverride: true },
      });
      await tx.household.update({
        where: { id: data.householdId },
        data: { maxMembersOverride: data.maxMembers },
      });
      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: "HOUSEHOLD_LIMIT_CHANGED",
        entityType: "household",
        entityId: data.householdId,
        before: { maxMembers: before.maxMembersOverride },
        after: { maxMembers: data.maxMembers },
      });
    });
    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

const suspendSchema = z.object({ householdId: z.uuid(), suspended: z.boolean() });

/**
 * Deactivates or reactivates a household as a super user. SUSPENDED is distinct
 * from ARCHIVED: it is never purged, and only a super user can lift it.
 */
export async function setHouseholdSuspended(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = suspendSchema.parse(input);

    const household = await prisma.household.findUnique({
      where: { id: data.householdId },
      select: { status: true },
    });
    if (!household) {
      return fail("WRONG_HOUSEHOLD", "Not found");
    }
    const next = data.suspended ? "SUSPENDED" : "ACTIVE";
    if (household.status === next) {
      return ok(null);
    }

    await prisma.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: data.householdId },
        data: { status: next, archivedAt: null },
      });
      await writeAuditLog(tx, {
        householdId: data.householdId,
        actorUserId: actor.id,
        action: data.suspended ? "HOUSEHOLD_SUSPENDED" : "HOUSEHOLD_REACTIVATED",
        entityType: "household",
        entityId: data.householdId,
        before: { status: household.status },
        after: { status: next },
      });
      await notifyHouseholdMembers(tx, {
        householdId: data.householdId,
        actorUserId: actor.id,
        actorName: "A platform administrator",
        type: data.suspended ? "HOUSEHOLD_DEACTIVATED" : "HOUSEHOLD_RESTORED",
      });
      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: data.suspended ? "HOUSEHOLD_SUSPENDED" : "HOUSEHOLD_REACTIVATED",
        entityType: "household",
        entityId: data.householdId,
        before: { status: household.status },
        after: { status: next },
      });
    });

    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

const permissionSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
  capability: z.enum(ALL_CAPABILITIES as unknown as [Capability, ...Capability[]]),
  /** Null removes the override, restoring the built-in default. */
  allowed: z.boolean().nullable(),
});

/** Edits one cell of the role matrix (super user only). */
export async function setPermissionOverride(input: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await requireSuperUser();
    const data = permissionSchema.parse(input);

    if (
      data.role === "ADMIN" &&
      ["VIEW_HOUSEHOLD", "MANAGE_MEMBERS"].includes(data.capability)
    ) {
      return fail("CONFLICT", "An admin must always keep this permission.");
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.permissionOverride.findUnique({
        where: { role_capability: { role: data.role, capability: data.capability } },
        select: { allowed: true },
      });
      if (data.allowed === null) {
        await tx.permissionOverride.deleteMany({
          where: { role: data.role, capability: data.capability },
        });
      } else {
        await tx.permissionOverride.upsert({
          where: { role_capability: { role: data.role, capability: data.capability } },
          create: { role: data.role, capability: data.capability, allowed: data.allowed },
          update: { allowed: data.allowed },
        });
      }
      await writePlatformAudit(tx, {
        actorUserId: actor.id,
        action: "PERMISSION_CHANGED",
        entityType: "permission",
        entityId: `${data.role}:${data.capability}`,
        before: { override: existing?.allowed ?? null },
        after: { override: data.allowed },
      });
    });
    revalidatePath("/admin");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

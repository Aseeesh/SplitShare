import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import {
  setHouseholdSuspended,
  setPermissionOverride,
  setPlatformLimits,
} from "@/actions/admin/platform";
import { setUserDisabled } from "@/actions/admin/users";
import { createHousehold } from "@/actions/households/create";
import type { ActionResult } from "@/lib/actions/result";

const db = await connectIntegrationDatabase();
const describeDb = db ? describe : describe.skip;

afterAll(async () => {
  await db?.prisma.$disconnect();
});

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

async function user(name: string, isSuperUser = false) {
  const email = `${name.toLowerCase()}@example.test`;
  const row = await db!.prisma.user.upsert({
    where: { email },
    update: { isSuperUser },
    create: { name, email, emailVerified: new Date(), isSuperUser },
    select: { id: true, name: true, email: true },
  });
  return { id: row.id, name: row.name!, email: row.email };
}

describeDb("platform changes", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  afterEach(async () => {
    await db!.reset();
  });

  it("are refused for anyone who is not a super user", async () => {
    const bob = await user("Bob");
    actAs(bob);
    expect(
      (await setPlatformLimits({ maxHouseholdsPerAdmin: 5, maxMembersPerHousehold: 5 }))
        .ok,
    ).toBe(false);
    expect(
      (
        await setPermissionOverride({
          role: "MEMBER",
          capability: "LOCK_EXPENSE",
          allowed: true,
        })
      ).ok,
    ).toBe(false);
    expect(await db!.prisma.platformAuditLog.count()).toBe(0);
  });

  it("each leave an audit row, written with the change", async () => {
    const { prisma } = db!;
    const root = await user("Root", true);
    const bob = await user("Bob");
    actAs(bob);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );

    actAs(root);
    expectOk(
      await setPlatformLimits({ maxHouseholdsPerAdmin: 5, maxMembersPerHousehold: 6 }),
    );
    expectOk(
      await setPermissionOverride({
        role: "MEMBER",
        capability: "LOCK_EXPENSE",
        allowed: true,
      }),
    );
    expectOk(await setHouseholdSuspended({ householdId, suspended: true }));
    expectOk(await setUserDisabled({ userId: bob.id, disabled: true }));

    const actions = (
      await prisma.platformAuditLog.findMany({ orderBy: { createdAt: "asc" } })
    ).map((row) => row.action);
    expect(actions).toEqual([
      "PLATFORM_LIMITS_CHANGED",
      "PERMISSION_CHANGED",
      "HOUSEHOLD_SUSPENDED",
      "USER_DISABLED",
    ]);

    const limits = await prisma.platformAuditLog.findFirstOrThrow({
      where: { action: "PLATFORM_LIMITS_CHANGED" },
    });
    expect(limits.actorUserId).toBe(root.id);
    expect(limits.afterJson).toEqual({
      maxHouseholdsPerAdmin: 5,
      maxMembersPerHousehold: 6,
    });
  });

  it("cannot be edited or deleted afterwards", async () => {
    const root = await user("Root", true);
    actAs(root);
    expectOk(
      await setPlatformLimits({ maxHouseholdsPerAdmin: 5, maxMembersPerHousehold: 6 }),
    );
    await expect(
      db!.prisma.$executeRawUnsafe('DELETE FROM "platform_audit_logs"'),
    ).rejects.toThrow();
  });
});

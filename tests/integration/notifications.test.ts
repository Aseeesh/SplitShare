import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createHousehold } from "@/actions/households/create";
import {
  archiveHousehold,
  leaveHousehold,
  restoreHousehold,
} from "@/actions/households/lifecycle";
import { markNotificationsRead } from "@/actions/notifications/read";
import type { ActionResult } from "@/lib/actions/result";
import { countMyUnread, listMyNotifications } from "@/lib/notifications/queries";

const db = await connectIntegrationDatabase();
const describeDb = db ? describe : describe.skip;

afterAll(async () => {
  await db?.prisma.$disconnect();
});

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  return result.data;
}

async function user(name: string) {
  const email = `${name.toLowerCase()}@example.test`;
  const row = await db!.prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, emailVerified: new Date() },
    select: { id: true, name: true, email: true },
  });
  return { id: row.id, name: row.name!, email: row.email };
}

describeDb("household lifecycle notifications", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  it("tells the others when someone leaves, and when the group is deactivated and restored", async () => {
    const { prisma } = db!;
    const [ann, bob, cal] = await Promise.all(["Ann", "Bob", "Cal"].map(user));
    actAs(ann!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    for (const m of [bob!, cal!]) {
      await prisma.householdMember.create({
        data: { householdId, userId: m.id, role: "MEMBER" },
      });
    }

    // Cal leaves: Ann and Bob are told, Cal is not.
    actAs(cal!);
    expectOk(await leaveHousehold({ householdId }));
    const types = async (who: typeof ann) =>
      (await prisma.notification.findMany({ where: { userId: who!.id } })).map(
        (n) => n.type,
      );
    expect(await types(ann)).toEqual(["MEMBER_LEFT"]);
    expect(await types(bob)).toEqual(["MEMBER_LEFT"]);
    expect(await types(cal)).toEqual([]);

    // Ann deactivates: Bob is told, and can still read it although the group is now hidden.
    actAs(ann!);
    expectOk(await archiveHousehold({ householdId }));
    actAs(bob!);
    const mine = await listMyNotifications();
    expect(mine.map((n) => n.type)).toContain("HOUSEHOLD_DEACTIVATED");
    expect(await countMyUnread()).toBe(2);

    // Restoring tells Bob again.
    actAs(ann!);
    expectOk(await restoreHousehold({ householdId }));
    expect(await types(bob)).toContain("HOUSEHOLD_RESTORED");
  });

  it("only ever marks the caller's own notifications as read", async () => {
    const { prisma } = db!;
    const [ann, bob] = await Promise.all(["Ann", "Bob"].map(user));
    actAs(ann!);
    const { householdId } = expectOk(
      await createHousehold({ name: "Flat", currency: "NZD" }),
    );
    await prisma.householdMember.create({
      data: { householdId, userId: bob!.id, role: "MEMBER" },
    });
    actAs(bob!);
    expectOk(await leaveHousehold({ householdId })); // notifies Ann only

    const annsNotification = await prisma.notification.findFirstOrThrow({
      where: { userId: ann!.id },
    });

    actAs(bob!);
    expectOk(await markNotificationsRead({ ids: [annsNotification.id] }));
    expect(
      (
        await prisma.notification.findUniqueOrThrow({
          where: { id: annsNotification.id },
        })
      ).readAt,
    ).toBeNull();

    actAs(ann!);
    expect(await countMyUnread()).toBe(1);
    expect(expectOk(await markNotificationsRead({})).unread).toBe(0);
  });
});

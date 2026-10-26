import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createHousehold } from "@/actions/households/create";
import type { ActionResult } from "@/lib/actions/result";
import { getHousehold } from "@/lib/households/queries";

/**
 * The UI renders controls from `household.capabilities`, so it has to follow
 * the super user's role matrix: a switch flipped there must change what people
 * see, not only what the server accepts.
 */

const db = await connectIntegrationDatabase();
const describeDb = db ? describe : describe.skip;

afterAll(async () => {
  await db?.prisma.$disconnect();
});

function expectOk<T>(result: ActionResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.code}: ${result.message}`);
  }
  return result.data;
}

async function createUser(name: string) {
  const email = `${name.toLowerCase()}@example.test`;
  const user = await db!.prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, emailVerified: new Date() },
    select: { id: true, name: true, email: true },
  });
  return { id: user.id, name: user.name!, email: user.email };
}

async function setup() {
  const ann = await createUser("Ann");
  const bob = await createUser("Bob");
  const vic = await createUser("Vic");
  actAs(ann);
  const { householdId } = expectOk(
    await createHousehold({ name: "Flat", currency: "NZD" }),
  );
  await db!.prisma.householdMember.createMany({
    data: [
      { householdId, userId: bob.id, role: "MEMBER" },
      { householdId, userId: vic.id, role: "VIEWER" },
    ],
  });
  return { householdId, ann, bob, vic };
}

describeDb("household capabilities follow the permission matrix", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  it("matches the built-in matrix when nothing is overridden", async () => {
    const { householdId, bob, vic } = await setup();
    actAs(bob);
    const member = (await getHousehold(householdId)).capabilities;
    expect(member).toContain("CREATE_EXPENSE");
    expect(member).not.toContain("LOCK_EXPENSE");
    actAs(vic);
    expect((await getHousehold(householdId)).capabilities).not.toContain(
      "CREATE_EXPENSE",
    );
  });

  it("grants and removes capabilities when the super user flips a switch", async () => {
    const { householdId, bob, vic } = await setup();
    await db!.prisma.permissionOverride.createMany({
      data: [
        { role: "VIEWER", capability: "CREATE_EXPENSE", allowed: true },
        { role: "MEMBER", capability: "CREATE_EXPENSE", allowed: false },
        { role: "MEMBER", capability: "LOCK_EXPENSE", allowed: true },
      ],
    });

    actAs(vic);
    expect((await getHousehold(householdId)).capabilities).toContain("CREATE_EXPENSE");
    actAs(bob);
    const member = (await getHousehold(householdId)).capabilities;
    expect(member).not.toContain("CREATE_EXPENSE");
    expect(member).toContain("LOCK_EXPENSE");
  });

  it("gives a super user looking in the narrower set, read-only when archived", async () => {
    const { householdId } = await setup();
    const root = await createUser("Root");
    await db!.prisma.user.update({ where: { id: root.id }, data: { isSuperUser: true } });
    actAs(root);

    const active = (await getHousehold(householdId)).capabilities;
    expect(active).toContain("MANAGE_MEMBERS");
    expect(active).not.toContain("CREATE_EXPENSE");

    await db!.prisma.household.update({
      where: { id: householdId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    const archived = (await getHousehold(householdId)).capabilities;
    expect(archived).toContain("VIEW_HOUSEHOLD");
    expect(archived).not.toContain("MANAGE_MEMBERS");
  });
});

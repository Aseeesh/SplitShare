import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import { createHousehold } from "@/actions/households/create";
import { loadSwitcher } from "@/actions/households/switcher";
import { listKnownPeople, listSuggestedPeople } from "@/lib/overview/queries";
import type { ActionResult } from "@/lib/actions/result";

/**
 * The autocomplete shows names and emails, so who it may reveal is a privacy
 * boundary: only people who share a current, active group with the viewer.
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

async function makeGroup(
  owner: { id: string; name: string; email: string },
  name: string,
  members: Array<{ id: string }>,
) {
  actAs(owner);
  const { householdId } = expectOk(await createHousehold({ name, currency: "NZD" }));
  for (const member of members) {
    await db!.prisma.householdMember.create({
      data: { householdId, userId: member.id, role: "MEMBER" },
    });
  }
  return householdId;
}

const names = (people: Array<{ name: string | null }>) =>
  people.map((p) => p.name).sort();

describeDb("known people autocomplete", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  it("only reveals people from groups the viewer is in", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    const cal = await createUser("Cal");
    const dan = await createUser("Dan");
    const eve = await createUser("Eve");

    await makeGroup(ann, "Flat", [bob]);
    await makeGroup(ann, "Trip", [cal]);
    // Ann is not in this one, so Dan and Eve must stay invisible to her.
    await makeGroup(dan, "Strangers", [eve]);

    actAs(ann);
    expect(names(await listKnownPeople())).toEqual(["Bob", "Cal"]);

    const { people } = expectOk(await loadSwitcher());
    expect(names(people)).toEqual(["Bob", "Cal"]);
  });

  it("names the groups shared and ranks by how many", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    const cal = await createUser("Cal");
    await makeGroup(ann, "Flat", [bob, cal]);
    await makeGroup(ann, "Trip", [bob]);

    actAs(ann);
    const people = await listKnownPeople();
    expect(people[0].name).toBe("Bob");
    expect([...people[0].sharedHouseholds].sort()).toEqual(["Flat", "Trip"]);
  });

  it("hides people from a group the viewer has left, and from archived groups", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    const cal = await createUser("Cal");
    const left = await makeGroup(ann, "Left", [bob]);
    const archived = await makeGroup(ann, "Archived", [cal]);

    await db!.prisma.householdMember.updateMany({
      where: { householdId: left, userId: ann.id },
      data: { removedAt: new Date() },
    });
    await db!.prisma.household.update({
      where: { id: archived },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    actAs(ann);
    expect(await listKnownPeople()).toEqual([]);
  });

  it("leaves out people already in the group being invited into", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    const cal = await createUser("Cal");
    await makeGroup(ann, "Flat", [bob, cal]);
    const target = await makeGroup(ann, "New", [bob]);

    actAs(ann);
    expect(names(await listSuggestedPeople(target))).toEqual(["Cal"]);
  });

  it("keeps the invite-side list admin-only", async () => {
    const ann = await createUser("Ann");
    const bob = await createUser("Bob");
    const flat = await makeGroup(ann, "Flat", [bob]);

    actAs(bob);
    await expect(listSuggestedPeople(flat)).rejects.toBeDefined();
    // But a member can still see the people they already sit alongside.
    expect(names(await listKnownPeople())).toEqual(["Ann"]);
  });
});

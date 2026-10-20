import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { connectIntegrationDatabase } from "./db";
import { actAs } from "./session";

import {
  setHouseholdMemberLimit,
  setPermissionOverride,
  setPlatformLimits,
  setUserHouseholdLimit,
} from "@/actions/admin/platform";
import { setUserDisabled } from "@/actions/admin/users";
import { correctExpense } from "@/actions/expenses/correct";
import { createExpense } from "@/actions/expenses/create";
import { createHousehold } from "@/actions/households/create";
import { inviteMember } from "@/actions/households/invite";
import {
  archiveHousehold,
  leaveHousehold,
  restoreHousehold,
} from "@/actions/households/lifecycle";
import { changeRole } from "@/actions/households/members";
import { NotAMemberError, UnauthenticatedError } from "@/lib/auth/errors";
import { requireAuth } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/actions/result";
import { getHousehold, listHouseholds } from "@/lib/households/queries";

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

describeDb("organisation rules, through the actions", () => {
  beforeEach(async () => {
    await db!.reset();
  });

  // reset() also clears platform configuration, so nothing these tests change
  // can reach another test file.
  afterEach(async () => {
    await db!.reset();
  });

  describe("limits", () => {
    it("stops an admin creating more households than the limit, and a super user can raise it", async () => {
      const root = await user("Root", true);
      const ann = await user("Ann");
      actAs(root);
      expectOk(
        await setPlatformLimits({ maxHouseholdsPerAdmin: 2, maxMembersPerHousehold: 10 }),
      );

      actAs(ann);
      expectOk(await createHousehold({ name: "One", currency: "NZD" }));
      expectOk(await createHousehold({ name: "Two", currency: "NZD" }));
      const third = await createHousehold({ name: "Three", currency: "NZD" });
      expect(third.ok).toBe(false);

      // An override for just this admin lifts it without touching anyone else.
      actAs(root);
      expectOk(await setUserHouseholdLimit({ userId: ann.id, maxHouseholds: 3 }));
      actAs(ann);
      expectOk(await createHousehold({ name: "Three", currency: "NZD" }));
    });

    it("counts members and pending invitations against the member limit", async () => {
      const root = await user("Root", true);
      const ann = await user("Ann");
      const bob = await user("Bob");
      actAs(root);
      expectOk(
        await setPlatformLimits({ maxHouseholdsPerAdmin: 20, maxMembersPerHousehold: 3 }),
      );

      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      await db!.prisma.householdMember.create({
        data: { householdId, userId: bob.id, role: "MEMBER" },
      });

      // Ann + Bob = 2 members, so one invitation fits and the next does not.
      expectOk(await inviteMember({ householdId, email: "carl@example.test" }));
      expect((await inviteMember({ householdId, email: "dee@example.test" })).ok).toBe(
        false,
      );

      // Raising it for this one household is enough.
      actAs(root);
      expectOk(await setHouseholdMemberLimit({ householdId, maxMembers: 4 }));
      actAs(ann);
      expectOk(await inviteMember({ householdId, email: "dee@example.test" }));
    });
  });

  describe("deactivating an organisation", () => {
    it("hides it from members and makes it read-only, but a super user can still see it", async () => {
      const root = await user("Root", true);
      const ann = await user("Ann");
      const bob = await user("Bob");
      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      await db!.prisma.householdMember.create({
        data: { householdId, userId: bob.id, role: "MEMBER" },
      });

      actAs(bob);
      expect((await listHouseholds()).map((h) => h.id)).toContain(householdId);

      actAs(ann);
      expectOk(await archiveHousehold({ householdId }));

      // Members no longer see it, and cannot act in it.
      actAs(bob);
      expect(await listHouseholds()).toEqual([]);
      await expect(getHousehold(householdId)).rejects.toBeInstanceOf(NotAMemberError);
      const write = await createExpense({
        householdId,
        paidByUserId: bob.id,
        categoryId: null,
        description: "x",
        amountCents: 100,
        currency: "NZD",
        date: new Date(),
        splitMethod: "EQUAL",
        participants: [{ userId: bob.id }],
      });
      expect(write.ok).toBe(false);

      // A super user can still open it.
      actAs(root);
      expect((await getHousehold(householdId)).viaSuperUser).toBe(true);

      // The admin restores it within the window, and members are back.
      actAs(ann);
      expectOk(await restoreHousehold({ householdId }));
      actAs(bob);
      expect((await listHouseholds()).map((h) => h.id)).toContain(householdId);
    });

    it("lets only an admin archive it, and only an admin restore it", async () => {
      const ann = await user("Ann");
      const bob = await user("Bob");
      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      await db!.prisma.householdMember.create({
        data: { householdId, userId: bob.id, role: "MEMBER" },
      });

      actAs(bob);
      expect((await archiveHousehold({ householdId })).ok).toBe(false);
      actAs(ann);
      expectOk(await archiveHousehold({ householdId }));
      actAs(bob);
      expect((await restoreHousehold({ householdId })).ok).toBe(false);
    });
  });

  describe("leaving", () => {
    it("lets a member leave, but not the only admin", async () => {
      const ann = await user("Ann");
      const bob = await user("Bob");
      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      await db!.prisma.householdMember.create({
        data: { householdId, userId: bob.id, role: "MEMBER" },
      });

      actAs(ann);
      expect((await leaveHousehold({ householdId })).ok).toBe(false); // the only admin

      actAs(bob);
      expectOk(await leaveHousehold({ householdId }));
      await expect(getHousehold(householdId)).rejects.toBeInstanceOf(NotAMemberError);

      // Once someone else is an admin, Ann may leave too.
      await db!.prisma.householdMember.update({
        where: { householdId_userId: { householdId, userId: bob.id } },
        data: { removedAt: null, role: "ADMIN" },
      });
      actAs(ann);
      expectOk(await leaveHousehold({ householdId }));
    });

    it("never lets the last admin be demoted", async () => {
      const ann = await user("Ann");
      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      expect((await changeRole({ householdId, userId: ann.id, role: "MEMBER" })).ok).toBe(
        false,
      );
    });
  });

  describe("suspended accounts", () => {
    it("lose access immediately and cannot act", async () => {
      const root = await user("Root", true);
      const bob = await user("Bob");
      actAs(bob);
      await expect(requireAuth()).resolves.toMatchObject({ id: bob.id });

      actAs(root);
      expectOk(await setUserDisabled({ userId: bob.id, disabled: true }));
      actAs(bob);
      await expect(requireAuth()).rejects.toBeInstanceOf(UnauthenticatedError);
      expect((await createHousehold({ name: "Nope", currency: "NZD" })).ok).toBe(false);

      actAs(root);
      expectOk(await setUserDisabled({ userId: bob.id, disabled: false }));
      actAs(bob);
      await expect(requireAuth()).resolves.toMatchObject({ id: bob.id });
    });

    it("cannot be a super user suspended from the console, nor can you suspend yourself", async () => {
      const root = await user("Root", true);
      const other = await user("Other", true);
      actAs(root);
      expect((await setUserDisabled({ userId: root.id, disabled: true })).ok).toBe(false);
      expect((await setUserDisabled({ userId: other.id, disabled: true })).ok).toBe(
        false,
      );
    });
  });

  describe("the permission matrix", () => {
    it("takes effect everywhere as soon as a super user changes it", async () => {
      const root = await user("Root", true);
      const ann = await user("Ann");
      const bob = await user("Bob");
      actAs(ann);
      const { householdId } = expectOk(
        await createHousehold({ name: "Flat", currency: "NZD" }),
      );
      await db!.prisma.householdMember.create({
        data: { householdId, userId: bob.id, role: "MEMBER" },
      });

      const base = {
        householdId,
        paidByUserId: ann.id,
        categoryId: null,
        description: "Power",
        currency: "NZD",
        date: new Date("2026-10-07T00:00:00.000Z"),
        splitMethod: "EQUAL" as const,
        participants: [{ userId: ann.id }, { userId: bob.id }],
      };
      const original = expectOk(await createExpense({ ...base, amountCents: 10000 }));

      // By default a member cannot edit somebody else's expense.
      actAs(bob);
      expect(
        (
          await correctExpense({
            ...base,
            amountCents: 9000,
            correctsExpenseId: original.expenseId,
          })
        ).ok,
      ).toBe(false);

      // The super user grants members "edit any expense"; now Bob can.
      actAs(root);
      expectOk(
        await setPermissionOverride({
          role: "MEMBER",
          capability: "EDIT_ANY_EXPENSE",
          allowed: true,
        }),
      );
      actAs(bob);
      expectOk(
        await correctExpense({
          ...base,
          amountCents: 9000,
          correctsExpenseId: original.expenseId,
        }),
      );

      // Revoking a default (members creating expenses) stops them just as quickly.
      actAs(root);
      expectOk(
        await setPermissionOverride({
          role: "MEMBER",
          capability: "CREATE_EXPENSE",
          allowed: false,
        }),
      );
      actAs(bob);
      expect(
        (await createExpense({ ...base, paidByUserId: bob.id, amountCents: 500 })).ok,
      ).toBe(false);

      // An admin can never be locked out of managing people.
      actAs(root);
      expect(
        (
          await setPermissionOverride({
            role: "ADMIN",
            capability: "MANAGE_MEMBERS",
            allowed: false,
          })
        ).ok,
      ).toBe(false);
    });
  });
});

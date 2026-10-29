/**
 * Seeds a realistic dataset for the E2E run, and gives each person a database
 * session so tests can sign in without Google.
 *
 * Run by playwright's globalSetup against TEST_DATABASE_URL only. It wipes that
 * database first, so it refuses to run against anything that does not look like
 * a throwaway one.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma-node/client";

import { SESSION_TOKENS } from "./tokens";

const TABLES = [
  "reminders",
  "notifications",
  "audit_logs",
  "settlement_transfers",
  "payment_confirmations",
  "payments",
  "settlements",
  "expense_splits",
  "expense_funders",
  "expenses",
  "recurring_expenses",
  "categories",
  "invitations",
  "file_uploads",
  "household_members",
  "households",
  "sessions",
  "accounts",
  "users",
  "permission_overrides",
  "platform_settings",
];

export async function seed(connectionString: string): Promise<void> {
  if (!/test|e2e|localhost|127\.0\.0\.1/.test(connectionString)) {
    throw new Error("Refusing to seed a database that does not look like a test one");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
    );

    const user = (name: string, extra: object = {}) =>
      prisma.user.create({
        data: {
          name,
          email: `${name.toLowerCase()}@example.test`,
          emailVerified: new Date(),
          ...extra,
        },
      });
    const ann = await user("Ann", { isSuperUser: true });
    const bob = await user("Bob");
    const cal = await user("Cal");
    const dee = await user("Dee");
    const eve = await user("Eve");
    const fay = await user("Fay");
    const gus = await user("Gus");

    const flat = await prisma.household.create({
      data: {
        name: "Flat 3",
        currency: "NZD",
        createdByUserId: ann.id,
        members: {
          create: [ann, bob, cal, dee].map((u, i) => ({
            userId: u.id,
            role: i === 0 ? "ADMIN" : "MEMBER",
          })),
        },
        categories: {
          create: [
            { name: "Groceries", icon: "shopping-cart", colorHex: "#16a34a" },
            { name: "Rent", icon: "home", colorHex: "#4f46e5" },
            { name: "Utilities", icon: "zap", colorHex: "#f59e0b" },
          ],
        },
      },
    });
    const beach = await prisma.household.create({
      data: {
        name: "Beach House",
        currency: "NZD",
        createdByUserId: bob.id,
        members: {
          create: [
            { userId: bob.id, role: "ADMIN" },
            { userId: ann.id, role: "MEMBER" },
          ],
        },
      },
    });

    // A clean two-person household for the §40 acceptance scenario, which
    // mutates it, so nothing else reads from it.
    await prisma.household.create({
      data: {
        name: "Acceptance flat",
        currency: "NZD",
        createdByUserId: ann.id,
        members: {
          create: [
            { userId: ann.id, role: "ADMIN" },
            { userId: bob.id, role: "MEMBER" },
          ],
        },
      },
    });

    // One group per access situation, so the role/lifecycle specs can sign in as
    // each kind of person and see exactly what that person is allowed to do.
    await prisma.household.create({
      data: {
        name: "Roles house",
        currency: "NZD",
        createdByUserId: ann.id,
        members: {
          create: [
            { userId: ann.id, role: "ADMIN" },
            { userId: bob.id, role: "MEMBER" },
            { userId: eve.id, role: "VIEWER" },
            { userId: gus.id, role: "MEMBER", removedAt: new Date() },
          ],
        },
      },
    });
    await prisma.household.create({
      data: {
        name: "Frozen flat",
        currency: "NZD",
        status: "ARCHIVED",
        archivedAt: new Date(),
        createdByUserId: ann.id,
        members: {
          create: [
            { userId: ann.id, role: "ADMIN" },
            { userId: bob.id, role: "MEMBER" },
          ],
        },
      },
    });

    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    async function expense(opts: {
      householdId: string;
      payer: string;
      cents: number;
      description: string;
      people: string[];
      ago: number;
      status?: "ACCEPTED" | "PENDING_ACCEPTANCE";
    }) {
      const each = Math.floor(opts.cents / opts.people.length);
      const rest = opts.cents - each * opts.people.length;
      const accepted = (opts.status ?? "ACCEPTED") === "ACCEPTED";
      await prisma.expense.create({
        data: {
          householdId: opts.householdId,
          paidByUserId: opts.payer,
          createdByUserId: opts.payer,
          description: opts.description,
          amountCents: BigInt(opts.cents),
          currency: "NZD",
          date: daysAgo(opts.ago),
          splitMethod: "EQUAL",
          status: opts.status ?? "ACCEPTED",
          funders: { create: [{ userId: opts.payer, amountCents: BigInt(opts.cents) }] },
          splits: {
            create: opts.people.map((userId, i) => ({
              userId,
              amountCents: BigInt(each + (i === 0 ? rest : 0)),
              acceptance: accepted || userId === opts.payer ? "ACCEPTED" : "PENDING",
              acceptedAt: accepted ? new Date() : null,
              settledAt: userId === opts.payer ? new Date() : null,
            })),
          },
        },
      });
    }

    const all = [ann.id, bob.id, cal.id, dee.id];
    for (const [i, [payer, cents, description]] of (
      [
        [ann.id, 18600, "Weekly groceries"],
        [bob.id, 9000, "Power bill"],
        [cal.id, 4200, "Takeaways"],
        [ann.id, 26000, "Internet + phone"],
        [dee.id, 7350, "Cleaning supplies"],
        [bob.id, 12000, "Dinner out"],
      ] as const
    ).entries()) {
      await expense({
        householdId: flat.id,
        payer,
        cents,
        description,
        people: all,
        ago: i * 9 + 1,
      });
    }
    await expense({
      householdId: flat.id,
      payer: bob.id,
      cents: 6000,
      description: "Movie night",
      people: [ann.id, bob.id, cal.id],
      ago: 2,
      status: "PENDING_ACCEPTANCE",
    });
    await expense({
      householdId: beach.id,
      payer: bob.id,
      cents: 32000,
      description: "Weekend rental",
      people: [ann.id, bob.id],
      ago: 4,
    });

    await prisma.notification.createMany({
      data: [
        {
          householdId: flat.id,
          userId: ann.id,
          type: "EXPENSE_CREATED",
          title: "Bob added Movie night",
          body: "Your share is $20.00. Accept it to confirm.",
          entityType: "household",
          entityId: flat.id,
        },
        {
          householdId: flat.id,
          userId: ann.id,
          type: "MEMBER_JOINED",
          title: "Dee joined Flat 3",
          body: "They can now be included in expenses.",
          entityType: "household",
          entityId: flat.id,
        },
      ],
    });

    const sessionExpiry = new Date(Date.now() + 7 * 86_400_000);
    await prisma.session.createMany({
      data: [
        { sessionToken: SESSION_TOKENS.Ann, userId: ann.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Bob, userId: bob.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Cal, userId: cal.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Dee, userId: dee.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Eve, userId: eve.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Fay, userId: fay.id, expires: sessionExpiry },
        { sessionToken: SESSION_TOKENS.Gus, userId: gus.id, expires: sessionExpiry },
      ],
    });
    await prisma.$executeRaw`SELECT 1`;
    void beach;
  } finally {
    await prisma.$disconnect();
  }
}

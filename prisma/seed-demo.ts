/**
 * Demo seed — populates the signed-in user's own account with a household,
 * three tracked (placeholder) members, sample expenses and payments, so every
 * screen has real data to show.
 *
 * Unlike prisma/seed.ts (the §12 worked example), this targets a real account
 * by email and writes to whichever DATABASE_URL is set — including production,
 * because that is the whole point: make the deployed app testable.
 *
 * Idempotent: safe to re-run. Run with:
 *   pnpm tsx prisma/seed-demo.ts
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma-node/client";
import { toDbCents } from "@/lib/money";
import { computeSplits } from "@/lib/splits/engine";

const USER_EMAIL = process.env.SEED_USER_EMAIL ?? "ashishrijal1@gmail.com";
const HOUSEHOLD_NAME = "Demo Flat";
const CURRENCY = "NZD";

const DUMMIES = ["Alex", "Bailey", "Charlie"];

const DEFAULT_CATEGORIES = [
  { name: "Groceries", icon: "shopping-cart", colorHex: "#16a34a" },
  { name: "Rent", icon: "home", colorHex: "#4f46e5" },
  { name: "Utilities", icon: "zap", colorHex: "#f59e0b" },
  { name: "Internet", icon: "wifi", colorHex: "#0ea5e9" },
  { name: "Household", icon: "sofa", colorHex: "#a855f7" },
  { name: "Takeaway", icon: "utensils", colorHex: "#ef4444" },
  { name: "Transport", icon: "car", colorHex: "#64748b" },
  { name: "Other", icon: "circle-ellipsis", colorHex: "#94a3b8" },
];

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; nothing to seed");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function main(): Promise<void> {
  const prisma = createClient();

  try {
    const user = await prisma.user.findUnique({ where: { email: USER_EMAIL } });
    if (!user) {
      throw new Error(`User ${USER_EMAIL} not found — sign in once first.`);
    }

    // Household owned by the real user.
    let household = await prisma.household.findFirst({
      where: { name: HOUSEHOLD_NAME, createdByUserId: user.id },
      select: { id: true },
    });
    household ??= await prisma.household.create({
      data: { name: HOUSEHOLD_NAME, currency: CURRENCY, createdByUserId: user.id },
      select: { id: true },
    });

    await prisma.householdMember.upsert({
      where: { householdId_userId: { householdId: household.id, userId: user.id } },
      update: { role: "ADMIN", removedAt: null },
      create: { householdId: household.id, userId: user.id, role: "ADMIN" },
    });

    // Tracked (placeholder) members, managed by the real user (§8a).
    const dummyIds: string[] = [];
    for (const name of DUMMIES) {
      const email = `${name.toLowerCase()}.demo@example.invalid`;
      const dummy = await prisma.user.upsert({
        where: { email },
        update: { name, isPlaceholder: true, managedByUserId: user.id },
        create: { name, email, isPlaceholder: true, managedByUserId: user.id },
        select: { id: true },
      });
      dummyIds.push(dummy.id);
      await prisma.householdMember.upsert({
        where: { householdId_userId: { householdId: household.id, userId: dummy.id } },
        update: { role: "MEMBER", removedAt: null },
        create: { householdId: household.id, userId: dummy.id, role: "MEMBER" },
      });
    }

    for (const category of DEFAULT_CATEGORIES) {
      await prisma.category.upsert({
        where: { householdId_name: { householdId: household.id, name: category.name } },
        update: {},
        create: { householdId: household.id, ...category },
      });
    }

    const groceries = await prisma.category.findUnique({
      where: { householdId_name: { householdId: household.id, name: "Groceries" } },
      select: { id: true },
    });

    // Equal-split expenses, all accepted so balances read non-trivial.
    const scenarios = [
      { description: "Weekly shop", paidByUserId: user.id, amountCents: 12000 },
      { description: "Power bill", paidByUserId: dummyIds[0], amountCents: 9000 },
      { description: "Internet", paidByUserId: user.id, amountCents: 3000 },
    ];

    const participantIds = [user.id, ...dummyIds];
    for (const entry of scenarios) {
      const exists = await prisma.expense.findFirst({
        where: { householdId: household.id, description: entry.description },
        select: { id: true },
      });
      if (exists) continue;

      const splits = computeSplits({
        method: "EQUAL",
        totalCents: entry.amountCents,
        participants: participantIds.map((userId) => ({ userId })),
      });

      await prisma.$transaction(async (tx) => {
        await tx.expense.create({
          data: {
            householdId: household.id,
            paidByUserId: entry.paidByUserId,
            createdByUserId: entry.paidByUserId,
            categoryId: groceries?.id ?? null,
            description: entry.description,
            amountCents: toDbCents(entry.amountCents),
            currency: CURRENCY,
            date: new Date(),
            splitMethod: "EQUAL",
            status: "ACCEPTED",
            splits: {
              create: splits.map((split) => ({
                userId: split.userId,
                amountCents: toDbCents(split.amountCents),
                acceptance: "ACCEPTED",
                acceptedAt: new Date(),
              })),
            },
          },
        });
      });
    }

    // Payments from two dummies to the user — one confirmed, one waiting.
    const payments = [
      { fromUserId: dummyIds[0], amountCents: 4000, confirm: true },
      { fromUserId: dummyIds[1], amountCents: 2000, confirm: false },
    ];
    for (const payment of payments) {
      const exists = await prisma.payment.findFirst({
        where: {
          householdId: household.id,
          fromUserId: payment.fromUserId,
          toUserId: user.id,
          amountCents: toDbCents(payment.amountCents),
        },
        select: { id: true },
      });
      if (exists) continue;

      const created = await prisma.payment.create({
        data: {
          householdId: household.id,
          fromUserId: payment.fromUserId,
          toUserId: user.id,
          amountCents: toDbCents(payment.amountCents),
          currency: CURRENCY,
        },
        select: { id: true },
      });

      if (payment.confirm) {
        await prisma.paymentConfirmation.create({
          data: { paymentId: created.id, confirmedByUserId: user.id },
        });
      }
    }

    console.log(`Seeded "${HOUSEHOLD_NAME}" for ${USER_EMAIL} (${household.id})`);
    console.log(`Members: you + ${DUMMIES.join(", ")} · 3 expenses · 2 payments`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

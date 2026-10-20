import "server-only";

import { requireSuperUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { isPlaceholderEmail } from "@/lib/households/placeholders";

/** Platform-wide read models for the super-user console. */

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  isSuperUser: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  households: Array<{ id: string; name: string; role: string }>;
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  await requireSuperUser();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      isSuperUser: true,
      disabledAt: true,
      createdAt: true,
      memberships: {
        where: { removedAt: null },
        select: { role: true, household: { select: { id: true, name: true } } },
      },
    },
  });

  return users
    .filter((user) => !isPlaceholderEmail(user.email))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperUser: user.isSuperUser,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      households: user.memberships.map((m) => ({
        id: m.household.id,
        name: m.household.name,
        role: m.role,
      })),
    }));
}

export interface AdminHouseholdRow {
  id: string;
  name: string;
  currency: string;
  memberCount: number;
  expenseCount: number;
  createdAt: Date;
}

export async function listAllHouseholds(): Promise<AdminHouseholdRow[]> {
  await requireSuperUser();
  const households = await prisma.household.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      currency: true,
      createdAt: true,
      _count: {
        select: { members: { where: { removedAt: null } }, expenses: true },
      },
    },
  });
  return households.map((h) => ({
    id: h.id,
    name: h.name,
    currency: h.currency,
    createdAt: h.createdAt,
    memberCount: h._count.members,
    expenseCount: h._count.expenses,
  }));
}

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
  maxHouseholdsOverride: number | null;
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
      maxHouseholdsOverride: true,
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
      maxHouseholdsOverride: user.maxHouseholdsOverride,
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
  status: string;
  maxMembersOverride: number | null;
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
      status: true,
      maxMembersOverride: true,
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
    status: h.status,
    maxMembersOverride: h.maxMembersOverride,
    memberCount: h._count.members,
    expenseCount: h._count.expenses,
  }));
}

export async function listPermissionOverrides(): Promise<
  Array<{ role: string; capability: string; allowed: boolean }>
> {
  await requireSuperUser();
  return prisma.permissionOverride.findMany({
    select: { role: true, capability: true, allowed: true },
  });
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: Date;
  summary: string;
}

export async function listPlatformAudit(limit = 20): Promise<PlatformAuditRow[]> {
  await requireSuperUser();
  const rows = await prisma.platformAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      beforeJson: true,
      afterJson: true,
      actor: { select: { name: true, email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: row.actor ? (row.actor.name ?? row.actor.email) : null,
    createdAt: row.createdAt,
    summary: `${JSON.stringify(row.beforeJson ?? null)} → ${JSON.stringify(row.afterJson ?? null)}`,
  }));
}

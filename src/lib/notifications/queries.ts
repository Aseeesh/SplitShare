import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

/**
 * A user's own notifications. Scoped by the session's user id alone — not by
 * household membership — so a notification about a household that has since
 * been deactivated, or that the user has left, is still readable by them.
 */

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  householdId: string;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: Date;
}

export async function listMyNotifications(limit = 40): Promise<NotificationItem[]> {
  const user = await requireAuth();
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      type: true,
      householdId: true,
      entityType: true,
      entityId: true,
      readAt: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    householdId: row.householdId,
    entityType: row.entityType,
    entityId: row.entityId,
    read: row.readAt !== null,
    createdAt: row.createdAt,
  }));
}

export async function countMyUnread(): Promise<number> {
  const user = await requireAuth();
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

import "server-only";

import type { Prisma } from "@/generated/prisma-node/client";

import { toAuditJson } from "./json";

export type PlatformAuditAction =
  | "PLATFORM_LIMITS_CHANGED"
  | "USER_LIMIT_CHANGED"
  | "HOUSEHOLD_LIMIT_CHANGED"
  | "PERMISSION_CHANGED"
  | "USER_DISABLED"
  | "USER_ENABLED"
  | "HOUSEHOLD_SUSPENDED"
  | "HOUSEHOLD_REACTIVATED";

export interface PlatformAuditEntry {
  actorUserId: string | null;
  action: PlatformAuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Records a platform-level change. Like `writeAuditLog` it takes a transaction
 * client, so it cannot be called outside one: the change and its trail commit
 * or roll back together.
 */
export async function writePlatformAudit(
  tx: Prisma.TransactionClient,
  entry: PlatformAuditEntry,
): Promise<void> {
  await tx.platformAuditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeJson:
        entry.before === undefined
          ? undefined
          : (toAuditJson(entry.before) as Prisma.InputJsonValue),
      afterJson:
        entry.after === undefined
          ? undefined
          : (toAuditJson(entry.after) as Prisma.InputJsonValue),
    },
  });
}

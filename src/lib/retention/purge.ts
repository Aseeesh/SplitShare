import "server-only";

import { prisma } from "@/lib/db/client";

export const ARCHIVE_RETENTION_DAYS = 30;

/**
 * Permanently deletes households archived more than 30 days ago.
 *
 * All of the work, including the safety check, is in the SQL function
 * `purge_expired_households`: it is the only code path that switches off the
 * append-only triggers, and only for the length of its own transaction.
 */
export async function purgeExpiredHouseholds(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ purged: number }>>`
    SELECT purge_expired_households(${ARCHIVE_RETENTION_DAYS}::int) AS purged
  `;
  return Number(rows[0]?.purged ?? 0);
}

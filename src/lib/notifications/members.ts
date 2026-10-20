import "server-only";

import type { Prisma } from "@/generated/prisma-node/client";
import type { NotificationType } from "@/generated/prisma/enums";

import { createNotifications } from "./create";

/**
 * Tells every current member of a household (except the one who did it) about a
 * lifecycle event. Takes a transaction client, so the notification commits with
 * the change that caused it (§17). Placeholders have nobody to read it.
 */
export async function notifyHouseholdMembers(
  tx: Prisma.TransactionClient,
  options: {
    householdId: string;
    actorUserId: string;
    actorName: string;
    type: NotificationType;
  },
): Promise<void> {
  const [household, members] = await Promise.all([
    tx.household.findUniqueOrThrow({
      where: { id: options.householdId },
      select: { name: true },
    }),
    tx.householdMember.findMany({
      where: {
        householdId: options.householdId,
        removedAt: null,
        userId: { not: options.actorUserId },
        user: { isPlaceholder: false },
      },
      select: { userId: true },
    }),
  ]);

  await createNotifications(tx, {
    householdId: options.householdId,
    context: { actorName: options.actorName, householdName: household.name },
    targets: members.map((member) => ({
      userId: member.userId,
      type: options.type,
      entityType: "household",
      entityId: options.householdId,
    })),
  });
}

import "server-only";

import { prisma } from "@/lib/db/client";
import { getPlatformLimits } from "@/lib/platform/limits";
import { effectiveMaxHouseholds, effectiveMaxMembers } from "@/lib/platform/limits-core";

/**
 * Returns an error message when adding one more member would exceed the
 * household's limit, else null. Pending invitations count, so an admin cannot
 * get round the cap by issuing a pile of invites that all accept later.
 */
export async function memberLimitViolation(householdId: string): Promise<string | null> {
  const [household, platform, members, pending] = await Promise.all([
    prisma.household.findUniqueOrThrow({
      where: { id: householdId },
      select: { maxMembersOverride: true },
    }),
    getPlatformLimits(),
    prisma.householdMember.count({ where: { householdId, removedAt: null } }),
    prisma.invitation.count({
      where: { householdId, status: "PENDING", expiresAt: { gt: new Date() } },
    }),
  ]);
  const max = effectiveMaxMembers(platform, household.maxMembersOverride);
  return members + pending >= max
    ? `This household is limited to ${max} members. Ask a super user to raise the limit.`
    : null;
}

/** Error message when the user has created their allowance of households. */
export async function householdLimitViolation(userId: string): Promise<string | null> {
  const [user, platform, created] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { maxHouseholdsOverride: true },
    }),
    getPlatformLimits(),
    prisma.household.count({ where: { createdByUserId: userId } }),
  ]);
  const max = effectiveMaxHouseholds(platform, user.maxHouseholdsOverride);
  return created >= max
    ? `You can create up to ${max} households. Ask a super user to raise the limit.`
    : null;
}

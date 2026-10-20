import "server-only";

import { prisma } from "@/lib/db/client";

import {
  DEFAULT_MAX_HOUSEHOLDS_PER_ADMIN,
  DEFAULT_MAX_MEMBERS_PER_HOUSEHOLD,
  SETTING_KEYS,
  type PlatformLimits,
} from "./limits-core";

export async function getPlatformLimits(): Promise<PlatformLimits> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    maxHouseholdsPerAdmin:
      byKey.get(SETTING_KEYS.maxHouseholds) ?? DEFAULT_MAX_HOUSEHOLDS_PER_ADMIN,
    maxMembersPerHousehold:
      byKey.get(SETTING_KEYS.maxMembers) ?? DEFAULT_MAX_MEMBERS_PER_HOUSEHOLD,
  };
}

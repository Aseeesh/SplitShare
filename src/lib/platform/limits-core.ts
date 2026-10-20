/**
 * Organisation and member limits, as pure functions.
 *
 * The platform default applies unless the super user has set an override for a
 * specific admin (households) or household (members).
 */

export const DEFAULT_MAX_HOUSEHOLDS_PER_ADMIN = 20;
export const DEFAULT_MAX_MEMBERS_PER_HOUSEHOLD = 10;

export const SETTING_KEYS = {
  maxHouseholds: "max_households_per_admin",
  maxMembers: "max_members_per_household",
} as const;

export interface PlatformLimits {
  maxHouseholdsPerAdmin: number;
  maxMembersPerHousehold: number;
}

export const effectiveMaxHouseholds = (
  platform: PlatformLimits,
  userOverride: number | null,
): number => userOverride ?? platform.maxHouseholdsPerAdmin;

export const effectiveMaxMembers = (
  platform: PlatformLimits,
  householdOverride: number | null,
): number => householdOverride ?? platform.maxMembersPerHousehold;

/** A limit must be a whole number from 1 to 1000. */
export function isValidLimit(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 1000;
}

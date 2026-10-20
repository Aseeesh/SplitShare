import { describe, expect, it } from "vitest";

import {
  effectiveMaxHouseholds,
  effectiveMaxMembers,
  isValidLimit,
} from "@/lib/platform/limits-core";

const platform = { maxHouseholdsPerAdmin: 20, maxMembersPerHousehold: 10 };

describe("limits", () => {
  it("uses the platform default unless overridden", () => {
    expect(effectiveMaxHouseholds(platform, null)).toBe(20);
    expect(effectiveMaxHouseholds(platform, 50)).toBe(50);
    expect(effectiveMaxMembers(platform, null)).toBe(10);
    expect(effectiveMaxMembers(platform, 3)).toBe(3);
  });

  it("validates limits as whole numbers 1..1000", () => {
    expect([1, 20, 1000].every(isValidLimit)).toBe(true);
    expect([0, -1, 1.5, 1001, NaN].some(isValidLimit)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  decoyHash,
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "@/lib/auth/password";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("salts every hash and stores the parameters", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password-1"),
      hashPassword("same-password-1"),
    ]);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$32768$8$1$")).toBe(true);
  });

  it("treats unicode-equivalent passwords as equal", async () => {
    const hash = await hashPassword("café-password");
    expect(await verifyPassword("café-password", hash)).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("the decoy matches nothing a user could type", async () => {
    expect(await verifyPassword("password", await decoyHash())).toBe(false);
  });

  it("enforces length bounds", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("long enough pw").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "",
    "/a\r\nb",
    undefined,
    5,
  ])("falls back for %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});

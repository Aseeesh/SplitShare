"use server";

import { z } from "zod";

import { fail, ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth } from "@/lib/auth/guards";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/rate-limit";

const setPasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

/**
 * Sets or changes the caller's own password. Only a signed-in user can do this,
 * so every password belongs to an account whose email was already verified by
 * Google. Changing an existing password also requires the current one, so a
 * stolen session cannot lock the owner out.
 */
export async function setPassword(input: unknown): Promise<ActionResult<null>> {
  try {
    const user = await requireAuth();
    consumeRateLimit("SET_PASSWORD", user.id);
    const data = setPasswordSchema.parse(input);

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, isPlaceholder: true },
    });
    if (!row || row.isPlaceholder) {
      return fail("STATE", "This account cannot have a password.");
    }
    if (row.passwordHash) {
      const valid =
        data.currentPassword !== undefined &&
        (await verifyPassword(data.currentPassword, row.passwordHash));
      if (!valid) {
        return fail("VALIDATION", "Your current password is not correct.");
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword) },
    });
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

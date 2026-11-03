"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

const removePasskeySchema = z.object({ id: z.uuid() });

/** Removes one of the caller's own passkeys; the user id comes from the session. */
export async function removePasskey(input: unknown): Promise<ActionResult<null>> {
  try {
    const user = await requireAuth();
    const data = removePasskeySchema.parse(input);
    await prisma.authenticator.deleteMany({ where: { id: data.id, userId: user.id } });
    revalidatePath("/profile");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

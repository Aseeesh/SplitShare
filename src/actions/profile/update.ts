"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter your name" })
    .max(60, { error: "Name cannot exceed 60 characters" }),
});

/** Every user may edit their own profile — and only their own: the id comes from the session. */
export async function updateProfile(input: unknown): Promise<ActionResult<null>> {
  try {
    const user = await requireAuth();
    const data = updateProfileSchema.parse(input);
    await prisma.user.update({ where: { id: user.id }, data: { name: data.name } });
    revalidatePath("/profile");
    revalidatePath("/", "layout");
    return ok(null);
  } catch (error) {
    return toActionResult(error);
  }
}

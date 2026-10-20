"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ok, toActionResult, type ActionResult } from "@/lib/actions/result";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { countMyUnread } from "@/lib/notifications/queries";

/** Polled by the bell. Returns 0 rather than failing when signed out. */
export async function unreadNotificationCount(): Promise<number> {
  try {
    return await countMyUnread();
  } catch {
    return 0;
  }
}

const markSchema = z.object({ ids: z.array(z.uuid()).max(100).optional() });

/**
 * Marks the caller's notifications read — all of them, or the given ones. The
 * user id comes from the session and is part of the WHERE clause, so nobody can
 * mark somebody else's notification by guessing its id.
 */
export async function markNotificationsRead(
  input: unknown,
): Promise<ActionResult<{ unread: number }>> {
  try {
    const user = await requireAuth();
    const data = markSchema.parse(input ?? {});
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(data.ids ? { id: { in: data.ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return ok({ unread: await countMyUnread() });
  } catch (error) {
    return toActionResult(error);
  }
}

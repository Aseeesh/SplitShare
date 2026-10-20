"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";

import { markNotificationsRead } from "@/actions/notifications/read";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/notifications/queries";

function ago(date: Date): string {
  const minutes = Math.max(
    1,
    Math.round((Date.now() - new Date(date).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}

function hrefFor(item: NotificationItem): string | null {
  // A deactivated household is hidden from members, so there is nothing to open.
  if (item.type === "HOUSEHOLD_DEACTIVATED") return null;
  if (item.entityType === "expense" && item.entityId) {
    return `/households/${item.householdId}/expenses/${item.entityId}`;
  }
  return `/households/${item.householdId}`;
}

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.read).length;

  // Opening the screen is what "seeing" them means; the badge clears on the next poll.
  useEffect(() => {
    if (unread === 0) return;
    const timer = window.setTimeout(() => {
      void markNotificationsRead({}).then(() => router.refresh());
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [unread, router]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
        <Bell className="mx-auto size-8 text-slate-400" aria-hidden="true" />
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          You are all caught up. Activity in your groups shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await markNotificationsRead({});
                router.refresh();
              })
            }
          >
            <CheckCheck className="size-4" aria-hidden="true" /> Mark all read
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {items.map((item, index) => {
          const href = hrefFor(item);
          const content = (
            <div className="flex items-start gap-3 px-4 py-3">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-transparent" : "bg-brand"}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${item.read ? "" : "font-semibold"}`}>
                  {item.title}
                </p>
                {item.body ? (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {item.body}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {ago(item.createdAt)}
              </span>
            </div>
          );
          return (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.28 }}
            >
              {href ? (
                <Link
                  href={href}
                  className="block active:bg-slate-50 dark:active:bg-slate-800/50"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

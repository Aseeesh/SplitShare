"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { unreadNotificationCount } from "@/actions/notifications/read";

const POLL_MS = 30_000;

/**
 * The bell (§17). In-app only, no websockets: it polls every 30 seconds while
 * the window is focused and visible, and once more the moment it regains focus,
 * so an installed app returning from the background is up to date at once.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const count = await unreadNotificationCount();
      if (!cancelled) setUnread(count);
    };
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
      className="relative flex size-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <motion.span
        key={unread}
        animate={unread > 0 ? { rotate: [0, -14, 12, -8, 0] } : { rotate: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Bell className="size-5" aria-hidden="true" />
      </motion.span>
      <AnimatePresence>
        {unread > 0 ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </Link>
  );
}

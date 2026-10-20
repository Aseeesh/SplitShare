"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const THRESHOLD = 70;

/**
 * Pull down from the top of the page to refresh, the way a native list does.
 * Only engages when the page is scrolled to the very top, and only for a
 * vertical drag, so ordinary scrolling and horizontal gestures are untouched.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const pull = useMotionValue(0);
  const rotate = useTransform(pull, [0, THRESHOLD], [0, 270]);
  const opacity = useTransform(pull, [0, 20, THRESHOLD], [0, 0.5, 1]);
  const startY = useRef<number | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    startY.current = window.scrollY <= 0 ? event.touches[0]!.clientY : null;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const delta = event.touches[0]!.clientY - startY.current;
    if (delta > 0) {
      // Rubber-band: the further you pull, the more it resists.
      pull.set(Math.min(delta * 0.5, THRESHOLD * 1.5));
    }
  }

  function onTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull.get() >= THRESHOLD) {
      setRefreshing(true);
      animate(pull, THRESHOLD * 0.8, { type: "spring", stiffness: 300, damping: 30 });
      startTransition(() => router.refresh());
      window.setTimeout(() => {
        setRefreshing(false);
        animate(pull, 0, { type: "spring", stiffness: 300, damping: 30 });
      }, 700);
    } else {
      animate(pull, 0, { type: "spring", stiffness: 400, damping: 34 });
    }
  }

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="flex flex-1 flex-col"
    >
      <motion.div
        aria-hidden="true"
        style={{ height: pull, opacity }}
        className="flex items-center justify-center overflow-hidden"
      >
        <motion.span
          style={{ rotate }}
          className={refreshing || isPending ? "animate-spin" : ""}
        >
          <RefreshCw className="text-brand size-5" />
        </motion.span>
      </motion.div>
      {children}
    </div>
  );
}

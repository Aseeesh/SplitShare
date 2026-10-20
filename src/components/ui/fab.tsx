"use client";

import Link from "next/link";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { useState } from "react";
import { Plus } from "lucide-react";

/**
 * Floating "add" button: springs in after the screen settles, dips on press,
 * and sits above the bottom tab bar and the home-indicator inset.
 */
export function Fab({ href, label }: { href: string; label: string }) {
  // Tucks away while scrolling down, so it never sits on top of the amounts
  // being read, and returns as soon as the user scrolls back up.
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 80) setHidden(true);
    else if (latest < previous) setHidden(false);
  });

  return (
    <motion.div
      initial={{ scale: 0, rotate: -90, opacity: 0 }}
      animate={
        hidden
          ? { scale: 0.6, y: 90, opacity: 0, rotate: 0 }
          : { scale: 1, y: 0, opacity: 1, rotate: 0 }
      }
      transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.35 }}
      whileTap={{ scale: 0.9 }}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 lg:bottom-8"
    >
      <Link
        href={href}
        aria-label={label}
        className="bg-brand hover:bg-brand-strong flex size-14 items-center justify-center rounded-full text-white shadow-lg shadow-emerald-900/30"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Link>
    </motion.div>
  );
}

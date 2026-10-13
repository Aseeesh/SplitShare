"use client";

import { motion } from "motion/react";

/**
 * Reusable entrance animations.
 *
 * `FadeIn` is opacity-only on purpose: a transform on a page-level wrapper
 * would become the containing block for the `fixed` bottom tab bar and break
 * it. `StaggerItem` adds a slight rise + fade and is meant for list rows, where
 * nothing below is fixed.
 */

export function FadeIn({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** One row of a staggered list; `index` sets how far it trails the rest. */
export function StaggerItem({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.045, 0.4),
        duration: 0.28,
        ease: "easeOut",
      }}
    >
      {children}
    </motion.div>
  );
}

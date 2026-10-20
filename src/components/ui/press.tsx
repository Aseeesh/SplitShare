"use client";

import { motion } from "motion/react";

/** A tappable surface that dips slightly under the finger, like a native control. */
export function Press({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

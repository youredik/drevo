"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface AnimatedItemProps {
  children: ReactNode;
  index: number;
  className?: string;
}

export function AnimatedItem({ children, index, className }: AnimatedItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

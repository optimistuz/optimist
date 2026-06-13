"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { EASE, VIEWPORT } from "@/lib/motion";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";

/**
 * Надзаголовок секции: тонкая красная чёрточка + текст в разрядку.
 * Чёрточка вырастает слева направо при появлении секции;
 * при reduced-motion — статична.
 */
export function Eyebrow({
  children,
  onDark = false,
  className,
}: {
  children: ReactNode;
  onDark?: boolean;
  className?: string;
}) {
  // reduced-motion только после маунта — иначе класс origin-left расходится
  // между сервером и клиентом (hydration-mismatch). См. useReduceAfterMount.
  const reduce = useReduceAfterMount();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 text-xs font-medium uppercase tracking-eyebrow",
        onDark ? "text-paper/60" : "text-graphite",
        className
      )}
    >
      {reduce ? (
        <span aria-hidden className="h-px w-7 bg-brand" />
      ) : (
        <motion.span
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.5, ease: EASE }}
          className="h-px w-7 origin-left bg-brand"
        />
      )}
      {children}
    </span>
  );
}

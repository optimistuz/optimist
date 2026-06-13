"use client";

import { motion } from "motion/react";
import { EASE } from "@/lib/motion";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";

/**
 * Рисующаяся верхняя граница секции: волосяная линия проводится
 * слева направо (scaleX 0→1) при входе секции во вьюпорт, один раз.
 * Это пограничный ритм, НЕ непрерывная нить.
 * Reduced-motion: статичная линия.
 */
export function DrawnBorder() {
  const reduce = useReduceAfterMount();

  if (reduce) {
    return <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-line" />;
  }

  return (
    <motion.div
      aria-hidden
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.8, ease: EASE }}
      className="absolute inset-x-0 top-0 h-px origin-left bg-line"
    />
  );
}

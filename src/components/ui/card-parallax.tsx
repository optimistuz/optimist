"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Внутренний параллакс фотографии карточки: ДОПОЛНИТЕЛЬНЫЙ слой вокруг
 * Photo — отдельный от элемента, который масштабируется по hover
 * (иначе конфликт transform). Фото лежит с запасом inset-[-8%], чтобы
 * при сдвиге y −6%…6% края не оголялись. Reduced-motion: без параллакса.
 */
export function CardParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      <motion.div
        style={reduce ? undefined : { y }}
        className="absolute inset-[-8%]"
      >
        {children}
      </motion.div>
    </div>
  );
}

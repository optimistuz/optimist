"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  DURATION,
  EASE,
  VIEWPORT,
  fadeUp,
  maskLineChild,
  staggerParent,
} from "@/lib/motion";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";

/**
 * Появление одного блока при попадании в зону видимости.
 * variant="focus" (дефолт) — словарь «Наведение резкости»: текст проявляется
 * из лёгкого расфокуса (blur 8px → 0). Только для текстовых блоков!
 * variant="fade" — прежнее появление снизу без blur.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  variant = "focus",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  variant?: "fade" | "focus";
}) {
  const reduce = useReduceAfterMount();
  if (reduce) return <div className={className}>{children}</div>;

  const focus = variant === "focus";

  return (
    <motion.div
      className={className}
      initial={
        focus ? { opacity: 0, y: 24, filter: "blur(8px)" } : { opacity: 0, y }
      }
      whileInView={
        focus ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 1, y: 0 }
      }
      viewport={VIEWPORT}
      transition={{ duration: DURATION.slow, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Построчная маска для заголовков секций (глагол maskLine):
 * каждая строка выезжает y 110% → 0 внутри overflow-hidden — тот же приём,
 * что в hero. Принимает строку с \n, вкладывается внутрь h2/h3.
 */
export function RevealLines({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reduce = useReduceAfterMount();
  const lines = text.split("\n");

  if (reduce) {
    return (
      <span className={cn("block", className)}>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </span>
    );
  }

  return (
    <motion.span
      className={cn("block", className)}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.12 } },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {lines.map((line) => (
        <span key={line} className="block overflow-hidden">
          <motion.span
            variants={maskLineChild}
            // Оптическая «наводка» (B1): читает анимируемую --opsz; при
            // вариативном шрифте (Literata) строка оптически резкостится.
            // Фолбэк 72 — для статичной (reduced) ветки и до маунта.
            style={{ fontVariationSettings: '"opsz" var(--opsz, 72)' }}
            className="block"
          >
            {line}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** Родитель для «ступенчатого» (stagger) появления группы из RevealItem. */
export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReduceAfterMount();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

/**
 * Элемент внутри RevealGroup — появляется по очереди.
 * variants по умолчанию fadeUp; для карточек с изображениями передаётся
 * imageReveal (scale + opacity, без blur).
 */
export function RevealItem({
  children,
  className,
  variants = fadeUp,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  const reduce = useReduceAfterMount();
  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

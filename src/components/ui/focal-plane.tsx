"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useOpticalCapability } from "@/lib/use-optical-capability";

/**
 * Фокальная плоскость страницы: изображение резкое в центре вьюпорта
 * и мягчеет к кромкам (blur 0 → max ≤ 5px) — страница ведёт себя как
 * оптика с малой глубиной резкости.
 *
 * Активна на всех устройствах после маунта при выключенном reduced-motion
 * (единый гейт useOpticalCapability.full — desktopMatch снят этапом 2);
 * иначе прозрачный рендер без эффекта.
 *
 * ВАЖНО: это отдельный слой только вокруг изображения. Не вешать на
 * элементы с hover-скейлом, параллаксом или собственным filter
 * (Focus Cards, шторки симуляторов, чертёж анатомии).
 */
export function FocalPlane({
  children,
  className,
  max = 5,
}: {
  children: ReactNode;
  className?: string;
  /** Максимальный blur у кромок вьюпорта, px (бюджет: ≤ 5). */
  max?: number;
}) {
  const { full } = useOpticalCapability();
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // |p − 0.5| × 2: 0 — центр элемента в центре вьюпорта, 1 — у кромки
  const blur = useTransform(scrollYProgress, (p) => Math.abs(p - 0.5) * 2 * max);
  const smooth = useSpring(blur, { stiffness: 140, damping: 32 });
  const filter = useMotionTemplate`blur(${smooth}px)`;

  if (!full) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      style={{ filter, willChange: "filter" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

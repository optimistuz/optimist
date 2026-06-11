"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useScrollVelocity } from "@/components/smooth-scroll";

/**
 * Velocity-резкость: display-заголовок слегка «плывёт» (blur ≤ 2px)
 * при быстром скролле и мгновенно наводится на резкость при остановке —
 * сайт ведёт себя как зрение.
 *
 * Активен только при (pointer: fine) И ширине ≥1024px И выключенном
 * reduced-motion; во всех остальных случаях — прозрачный рендер без эффекта.
 *
 * Оборачивать ТОЛЬКО заголовки с масочным появлением:
 * не focusIn-элементы (конфликт по filter) и не изображения.
 */
export function MotionFocus({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setActive(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const velocity = useScrollVelocity();
  // |velocity| ≥ 30 → blur 2px; в покое → 0 (useTransform клампит диапазон)
  const blur = useTransform(velocity, [-30, 0, 30], [2, 0, 2]);
  const smooth = useSpring(blur, { stiffness: 250, damping: 40 });
  const filter = useMotionTemplate`blur(${smooth}px)`;

  if (reduce || !active) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div style={{ filter }} className={className}>
      {children}
    </motion.div>
  );
}

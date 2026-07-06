"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useScrollVelocity } from "@/components/smooth-scroll";
import { useOpticalCapability } from "@/lib/use-optical-capability";
import { EASE } from "@/lib/motion";

/**
 * Velocity-резкость: display-заголовок слегка «плывёт» (blur ≤ 2px)
 * при быстром скролле и мгновенно наводится на резкость при остановке —
 * сайт ведёт себя как зрение.
 *
 * Плюс якорный фокус-пульс: когда Lenis доехал до секции по якорю
 * (событие anchor-arrive из smooth-scroll), заголовок целевой секции
 * один раз наводится на резкость (blur 3px → 0, ~600 мс). Пульс идёт
 * через ТОТ ЖЕ MotionValue фильтра (берём максимум двух источников) —
 * второго filter на элементе не появляется, конфликта с velocity нет.
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
  const { full } = useOpticalCapability();
  const ref = useRef<HTMLDivElement>(null);

  const velocity = useScrollVelocity();
  // |velocity| ≥ 30 → blur 2px; в покое → 0 (useTransform клампит диапазон)
  const blur = useTransform(velocity, [-30, 0, 30], [2, 0, 2]);
  const smooth = useSpring(blur, { stiffness: 250, damping: 40 });

  // Якорный пульс: 3px → 0 (бюджет ночи: анимируемый blur ≤ 3px)
  const pulse = useMotionValue(0);
  const combined = useTransform([smooth, pulse] as const, (latest) =>
    Math.max(latest[0] as number, latest[1] as number)
  );
  const filter = useMotionTemplate`blur(${combined}px)`;

  useEffect(() => {
    if (!full) return;
    const onArrive = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const host = ref.current;
      if (!id || !host) return;
      const target = host.closest("section[id], div[id], footer[id]");
      if (target && target.id === id) {
        pulse.set(3);
        animate(pulse, 0, { duration: 0.6, ease: EASE });
      }
    };
    window.addEventListener("anchor-arrive", onArrive);
    return () => window.removeEventListener("anchor-arrive", onArrive);
  }, [full, pulse]);

  if (!full) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div ref={ref} style={{ filter }} className={className}>
      {children}
    </motion.div>
  );
}

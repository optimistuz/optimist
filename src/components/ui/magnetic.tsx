"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

// Максимальное смещение к курсору, px — едва заметный «магнит», не трюк
const MAX_SHIFT = 6;
const SPRING = { stiffness: 150, damping: 15 };

/**
 * Магнитная обёртка для primary-кнопок (hero, CTA-форма).
 * Активна ТОЛЬКО при точном указателе (мышь/трекпад) и выключенном
 * reduced-motion; на таче и при reduced-motion рендерит children как есть.
 */
export function Magnetic({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [finePointer, setFinePointer] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFinePointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setFinePointer(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (reduce || !finePointer) {
    return <div className={className}>{children}</div>;
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    // Смещение пропорционально удалению курсора от центра, максимум 6px
    const ratioX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ratioY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    x.set(Math.max(-1, Math.min(1, ratioX)) * MAX_SHIFT);
    y.set(Math.max(-1, Math.min(1, ratioY)) * MAX_SHIFT);
  };

  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ x: springX, y: springY }}
      className={className ?? "inline-block"}
    >
      {children}
    </motion.div>
  );
}

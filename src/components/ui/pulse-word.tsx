"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";

/* ------------------------------------------------------------------
   Слово-акцент манифеста: при ПЕРВОМ проходе через центр вьюпорта —
   однократный фокус-пульс (blur 2px → 0, 500 мс, once). Десктоп;
   reduced-motion и тач — без эффекта. Проп enabled — выключатель.
   ------------------------------------------------------------------ */
export function PulseWord({
  children,
  enabled = true,
  className,
}: {
  children: ReactNode;
  enabled?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const played = useRef(false);
  const [desktop, setDesktop] = useState(false);
  const blur = useMotionValue(0);
  const filter = useMotionTemplate`blur(${blur}px)`;

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled || reduce || !desktop) return;
    const el = ref.current;
    if (!el) return;
    // rootMargin −50%/−50% → «вьюпорт» сжат в линию по центру:
    // пересечение = слово проходит центр экрана
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !played.current) {
          played.current = true;
          blur.set(2);
          animate(blur, 0, { duration: 0.5, ease: EASE });
          io.disconnect();
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, reduce, desktop, blur]);

  return (
    <motion.em
      ref={ref}
      style={{ filter }}
      className={cn("not-italic text-brand", className)}
    >
      {children}
    </motion.em>
  );
}

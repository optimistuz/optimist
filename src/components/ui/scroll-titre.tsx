"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionTemplate, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Скролл-титр (этап 3, «Один дубль»): строка манифеста лежит в лёгком
 * расфокусе (blur 6px, opacity 0.4) и наводится на резкость по мере прохода
 * через центр вьюпорта — жест появления (≤8px по §3).
 *
 * ОСНОВНОЙ путь — CSS scroll-driven анимация из globals.css (`.scroll-titre`,
 * `animation-timeline: view()`), off-main-thread (Chrome 115+, целевой парк
 * A15/A54). ФОЛБЭК для старых браузеров — Motion `useScroll` на самой строке.
 * «Прочитано» ведёт общий хук useReadLines (класс `.line-read` + флаг `read`).
 * Reduce — строка сразу резкая (globals.css). Фильтр висит на самой строке,
 * НЕ на секции (там деко-FloatFrame) — закон «один владелец filter на узел».
 */
type TitreProps = {
  /** Стабильный callback-ref из useReadLines (наблюдение «прочитано»). */
  register: (el: HTMLElement | null) => void;
  /** Строка уже прочитана — фолбэк-ветка замораживает её резкой. */
  read: boolean;
  className?: string;
  children: ReactNode;
};

/** Поддержка scroll-driven анимаций (Chrome 115+). Детект один раз, post-mount. */
function useScrollTimelineSupported(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    setOk(
      typeof CSS !== "undefined" &&
        typeof CSS.supports === "function" &&
        CSS.supports("animation-timeline: view()")
    );
  }, []);
  return ok;
}

export function ScrollTitre({ register, read, className, children }: TitreProps) {
  const supported = useScrollTimelineSupported();
  const cls = cn("scroll-titre", className);
  // До детекта (null) и при поддержке — чистый <p>, наводит CSS.
  if (supported === false) {
    return (
      <TitreFallback register={register} read={read} className={cls}>
        {children}
      </TitreFallback>
    );
  }
  return (
    <p ref={register} className={cls}>
      {children}
    </p>
  );
}

/** Фолбэк без scroll-driven CSS: Motion useScroll наводит строку по скроллу. */
function TitreFallback({
  register,
  read,
  className,
  children,
}: TitreProps & { className: string }) {
  const localRef = useRef<HTMLParagraphElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: localRef,
    offset: ["start end", "center center"],
  });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.4, 1]);
  const blurPx = useTransform(scrollYProgress, [0, 1], [6, 0]);
  const filter = useMotionTemplate`blur(${blurPx}px)`;

  const setRef = (el: HTMLParagraphElement | null) => {
    localRef.current = el;
    register(el);
  };

  return (
    <motion.p
      ref={setRef}
      className={className}
      // Прочитанная строка заморожена резкой (иначе скролл назад её вернёт
      // в расфокус — inline-стиль Motion переспорил бы CSS `.line-read`).
      style={read ? { opacity: 1, filter: "none" } : { opacity, filter }}
    >
      {children}
    </motion.p>
  );
}

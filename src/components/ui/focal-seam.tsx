"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { Container } from "@/components/ui/container";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { useGaze } from "@/lib/use-gaze";
import { useScrollVelocity } from "@/components/smooth-scroll";
import { cn } from "@/lib/cn";

/**
 * «Шов наводки» — переход между ГЛАВАМИ в грамматике сайта (наведение
 * резкости). Волосок раскрывается ИЗ ЦЕНТРА к краям ПРОГРЕССОМ СКРОЛЛА стыка
 * (этап 3): обратимо (скролл вверх — закрывается), живёт и на мобиле. В центре
 * — фокус-метка (кольцо-линза): проявляется из расфокуса, её зрачок brand
 * ПРОВОЖАЕТ взгляд (useGaze, transform-only, spring) — тот же оптический мотив,
 * что у кнопки навигации. VELOCITY-модулятор: при быстром подходе метка «дышит»
 * глубже (blur появления 2→4px). Это НЕ вечная анимация — отклик на скролл/жест.
 * Мотив работает редкостью: ставить только на стыках глав. Reduce — статичная
 * метка. tone="dark" — для светлой метки над тёмными секциями.
 */
export function FocalSeam({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const reduce = useReduceAfterMount();
  const ref = useRef<HTMLDivElement>(null);
  const line = tone === "dark" ? "bg-paper/20" : "bg-line";
  const ring = tone === "dark" ? "border-paper/45" : "border-ink/30";

  // Раскрытие волоска и проявление метки — прогресс прохода стыка через кадр
  // (0 — стык у нижней кромки вьюпорта, 1 — у центра). Обратимо по природе.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const markOpacity = useTransform(scrollYProgress, [0.3, 0.85], [0, 1]);
  const markScale = useTransform(scrollYProgress, [0.3, 1], [0.82, 1]);

  // Velocity-модулятор: быстрый подход углубляет blur появления (2→4px),
  // спадающий к нулю по мере наводки. Velocity — шина Lenis (px/кадр, §7).
  const velocity = useScrollVelocity();
  const markFilter = useTransform(
    [scrollYProgress, velocity],
    ([p, v]: number[]) => {
      const appear = Math.max(0, Math.min(1, (p - 0.3) / 0.6)); // 0…1
      const depth = 2 + 2 * Math.max(0, Math.min(1, Math.abs(v) / 30)); // 2…4px
      const b = depth * (1 - appear);
      return b <= 0.05 ? "none" : `blur(${b}px)`;
    }
  );

  // Зрачок метки провожает взгляд (мышь / последний тап), ±2px, пружина.
  const gaze = useGaze(ref);
  const px = useSpring(
    useTransform(gaze.x, (v) => v * 2),
    { stiffness: 120, damping: 18 }
  );
  const py = useSpring(
    useTransform(gaze.y, (v) => v * 2),
    { stiffness: 120, damping: 18 }
  );

  if (reduce) {
    // Статичная метка (наведена), без scrub и слежения.
    return (
      <div ref={ref} aria-hidden className={cn("py-7 sm:py-9", className)}>
        <Container>
          <div className="mx-auto flex max-w-xl items-center justify-center gap-3">
            <span className={cn("h-px flex-1", line)} />
            <span
              className={cn(
                "relative flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                ring
              )}
            >
              <span className="h-1 w-1 rounded-full bg-brand" />
            </span>
            <span className={cn("h-px flex-1", line)} />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div ref={ref} aria-hidden className={cn("py-7 sm:py-9", className)}>
      <Container>
        <div className="mx-auto flex max-w-xl items-center justify-center gap-3">
          <motion.span
            className={cn("h-px flex-1 origin-right", line)}
            style={{ scaleX }}
          />
          <motion.span
            className="shrink-0"
            style={{ opacity: markOpacity, scale: markScale, filter: markFilter }}
          >
            <span
              className={cn(
                "relative flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                ring
              )}
            >
              <motion.span
                className="h-1 w-1 rounded-full bg-brand"
                style={{ x: px, y: py }}
              />
            </span>
          </motion.span>
          <motion.span
            className={cn("h-px flex-1 origin-left", line)}
            style={{ scaleX }}
          />
        </div>
      </Container>
    </div>
  );
}

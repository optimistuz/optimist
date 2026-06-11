"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";

/** Центры «глаз» в координатах viewBox 0 0 260 150 (примитивы знака «op»). */
const EYES = [
  { cx: 70, cy: 62 },
  { cx: 180, cy: 62 },
] as const;

const MAX_SHIFT = 14; // px — предел смещения зрачка

/**
 * Один глаз: окружность оправы + зрачок, следящий за курсором.
 * Моргание (scaleY 0.08 раз в ~6 с) — единственная бесконечная анимация
 * страницы и единственное место на сайте, где «очки» моргают.
 */
function Eye({
  cx,
  cy,
  x,
  y,
  blink,
}: {
  cx: number;
  cy: number;
  x: ReturnType<typeof useSpring>;
  y: ReturnType<typeof useSpring>;
  blink: boolean;
}) {
  return (
    <motion.g
      animate={blink ? { scaleY: [1, 0.08, 1] } : undefined}
      transition={
        blink
          ? {
              duration: 0.24,
              times: [0, 0.5, 1],
              ease: "easeInOut",
              repeat: Infinity,
              repeatDelay: 6,
            }
          : undefined
      }
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
    >
      <circle
        cx={cx}
        cy={cy}
        r="45"
        strokeWidth="5"
        strokeLinecap="round"
        className="stroke-ink"
      />
      <motion.circle cx={cx} cy={cy} r="10" className="fill-ink" style={{ x, y }} />
    </motion.g>
  );
}

/**
 * Сцена 404: «op»-очки следят зрачками за курсором.
 * Тач и reduced-motion: зрачки в центре, моргания нет.
 */
export default function NotFoundScene() {
  const reduce = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const [fine, setFine] = useState(false);

  // Зрачки: useMotionValue → useSpring(120/14), по паре на глаз
  const leftX = useMotionValue(0);
  const leftY = useMotionValue(0);
  const rightX = useMotionValue(0);
  const rightY = useMotionValue(0);
  const spring = { stiffness: 120, damping: 14 };
  const sLeftX = useSpring(leftX, spring);
  const sLeftY = useSpring(leftY, spring);
  const sRightX = useSpring(rightX, spring);
  const sRightY = useSpring(rightY, spring);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!fine || reduce) return;

    const targets = [
      { x: leftX, y: leftY },
      { x: rightX, y: rightY },
    ];

    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const toSvg = 260 / rect.width; // экранные px → единицы viewBox

      EYES.forEach((eye, i) => {
        const eyeX = rect.left + (eye.cx / 260) * rect.width;
        const eyeY = rect.top + (eye.cy / 150) * rect.height;
        let dx = e.clientX - eyeX;
        let dy = e.clientY - eyeY;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_SHIFT) {
          dx = (dx / dist) * MAX_SHIFT;
          dy = (dy / dist) * MAX_SHIFT;
        }
        targets[i].x.set(dx * toSvg);
        targets[i].y.set(dy * toSvg);
      });
    };

    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      targets.forEach((t) => {
        t.x.set(0);
        t.y.set(0);
      });
    };
  }, [fine, reduce, leftX, leftY, rightX, rightY]);

  const blink = !reduce;

  return (
    <section className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-20 pt-28 text-center">
      <svg
        ref={svgRef}
        viewBox="0 0 260 150"
        fill="none"
        aria-hidden="true"
        className="w-56 sm:w-64"
      >
        <Eye cx={EYES[0].cx} cy={EYES[0].cy} x={sLeftX} y={sLeftY} blink={blink} />
        <Eye cx={EYES[1].cx} cy={EYES[1].cy} x={sRightX} y={sRightY} blink={blink} />
        {/* Ножка «p» — образ знака сохраняется */}
        <line
          x1="135"
          y1="62"
          x2="135"
          y2="146"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-ink"
        />
      </svg>

      <h1 className="mt-10 font-serif text-display-lg font-light text-ink">404</h1>
      <p className="mt-4 max-w-md text-base leading-relaxed text-graphite sm:text-lg">
        Эта страница потерялась из виду{/* TODO: согласовать текст */}
      </p>
      <div className="mt-10">
        <Magnetic>
          <Button href="/">Вернуться к ясности</Button>
        </Magnetic>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { useGaze } from "@/lib/use-gaze";
import { cn } from "@/lib/cn";

/** Центры «глаз» в координатах viewBox 0 0 260 150 (примитивы знака «op»). */
const EYES = [
  { cx: 70, cy: 62 },
  { cx: 180, cy: 62 },
] as const;

/** Предел смещения зрачка в единицах viewBox (r глаза 45, r зрачка 10 —
    зрачок остаётся внутри оправы). Вектор взгляда −1…1 умножается на него. */
const PUPIL_SHIFT = 16;

/**
 * Один глаз: окружность оправы + зрачок, следящий за взглядом.
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
 * Сцена 404: «op»-очки следят зрачками за взглядом.
 * Единый шлюз ввода useGaze (закон №5) сводит все источники: точный указатель
 * следит за курсором, тач — за ПОСЛЕДНИМ ТАПОМ (значения остаются после
 * отпускания), Android — за наклоном (гиро). Один вектор на оба глаза —
 * параллельный взгляд; так же работает и гиро (его useGaze отдаёт только в
 * вьюпортном режиме). Reduced-motion: зрачки в центре, моргания нет.
 */
export default function NotFoundScene() {
  const reduce = useReducedMotion();
  const { x: gazeX, y: gazeY } = useGaze();
  const [charted, setCharted] = useState(false); // тап навёл таблицу Сивцева (once)

  // Зрачки: вектор взгляда (−1…1) → смещение в единицах viewBox → пружина.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 120, damping: 14 };
  const sPx = useSpring(px, spring);
  const sPy = useSpring(py, spring);

  useEffect(() => {
    if (reduce) {
      px.set(0);
      py.set(0);
      return;
    }
    const update = () => {
      px.set(gazeX.get() * PUPIL_SHIFT);
      py.set(gazeY.get() * PUPIL_SHIFT);
    };
    update();
    const ux = gazeX.on("change", update);
    const uy = gazeY.on("change", update);
    return () => {
      ux();
      uy();
    };
  }, [reduce, gazeX, gazeY, px, py]);

  const blink = !reduce;

  return (
    <section className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-20 pt-28 text-center">
      <svg
        viewBox="0 0 260 150"
        fill="none"
        aria-hidden="true"
        className="w-56 sm:w-64"
      >
        <Eye cx={EYES[0].cx} cy={EYES[0].cy} x={sPx} y={sPy} blink={blink} />
        <Eye cx={EYES[1].cx} cy={EYES[1].cy} x={sPx} y={sPy} blink={blink} />
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

      {/* Таблица Сивцева: строки убывающим кеглем И нарастающим расфокусом —
          нижнюю «Из виду» видно буквально на грани зрения. На резкость её
          наводит наведение (desktop, group-hover) ИЛИ ТАП по таблице (тач):
          класс .is-charted снимает статичный blur каскадом сверху вниз
          (delay 0 / 150 / 300 мс), один раз — ты нашёл страницу. Под reduce
          глобальный сброс transition делает наводку мгновенной. Blur ≤3px. */}
      <h1
        onClick={() => setCharted(true)}
        className={cn(
          "group mt-10 font-serif font-light leading-none text-ink",
          charted && "is-charted"
        )}
      >
        <span className="block text-display-lg">404</span>
        <span
          aria-hidden
          className="mt-6 block text-3xl uppercase tracking-[0.3em] blur-[0.6px] transition-[filter] duration-500 ease-soft group-hover:blur-none [.is-charted_&]:blur-none sm:text-4xl"
        >
          Страница
        </span>
        <span
          aria-hidden
          className="mt-4 block text-xl uppercase tracking-[0.35em] text-ink/80 blur-[1.6px] transition-[filter] duration-500 ease-soft group-hover:blur-none [.is-charted_&]:blur-none [.is-charted_&]:delay-150 sm:text-2xl"
        >
          Потерялась
        </span>
        <span
          aria-hidden
          className="mt-4 block text-xs uppercase tracking-[0.4em] text-graphite blur-[3px] transition-[filter] duration-500 ease-soft group-hover:blur-none [.is-charted_&]:blur-none [.is-charted_&]:delay-300 sm:text-sm"
        >
          Из виду
        </span>
        <span className="sr-only">Страница потерялась из виду</span>
      </h1>
      <div className="mt-10">
        <Magnetic>
          <Button href="/">Вернуться к ясности</Button>
        </Magnetic>
      </div>
    </section>
  );
}

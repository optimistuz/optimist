"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { lensIndex } from "@/content/home";

/* ------------------------------------------------------------------
   Визуализатор индекса/толщины линзы (C1) — живой ответ FAQ в стиле
   «Мастерской». Горизонтальное сечение минус-линзы тонкой линией без
   заливок: толстый край (rim), тонкий оптический центр. Выбор индекса
   утончает край — «высокий индекс = тоньше». Профиль схематичный.
   ------------------------------------------------------------------ */

// Геометрия сечения (единицы viewBox). Край варьируется, центр постоянен.
const VB_W = 200;
const VB_H = 130;
const X_LEFT = 22;
const X_RIGHT = 178;
const X_MID = 100;
const CY = 65;
const TC = 4; // половина толщины оптического центра (постоянна)
const E_MAX = 34; // половина толщины края при базовом индексе (thin = 1)

const edgeFor = (thin: number) => TC + (E_MAX - TC) * thin;

/** Путь сечения минус-линзы: толстые края, тонкая талия по центру. */
const pathFor = (thin: number) => {
  const e = edgeFor(thin).toFixed(1);
  return [
    `M ${X_LEFT} ${CY - +e}`,
    `Q ${X_MID} ${CY - +e} ${X_MID} ${CY - TC}`,
    `Q ${X_MID} ${CY - +e} ${X_RIGHT} ${CY - +e}`,
    `L ${X_RIGHT} ${CY + +e}`,
    `Q ${X_MID} ${CY + +e} ${X_MID} ${CY + TC}`,
    `Q ${X_MID} ${CY + +e} ${X_LEFT} ${CY + +e}`,
    "Z",
  ].join(" ");
};

export default function LensThickness() {
  const reduce = useReducedMotion();
  const [sel, setSel] = useState(0);
  const { options, hint, disclaimer } = lensIndex;
  // Базовый путь (постоянный) — для SSR и первого клиентского кадра;
  // motion анимирует к выбранному (структура команд одинакова → интерполяция).
  const baseD = pathFor(options[0].thin);
  const d = pathFor(options[sel].thin);

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
      {/* Сечение линзы — тонкой линией, без заливок (язык «Мастерской») */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        fill="none"
        aria-hidden="true"
        className="h-auto w-40 shrink-0 sm:w-44"
      >
        {/* Оптическая ось — волосяная линия взгляда */}
        <line
          x1={X_LEFT - 6}
          y1={CY}
          x2={X_RIGHT + 6}
          y2={CY}
          className="stroke-ink/15"
          strokeWidth="1"
        />
        {/* d полностью отдаём motion (initial для SSR/гидратации, animate
            к выбранному) — статический d React перебивал бы анимацию. */}
        <motion.path
          initial={{ d: baseD }}
          animate={{ d }}
          transition={
            reduce ? { duration: 0 } : { type: "spring", stiffness: 170, damping: 24 }
          }
          className="stroke-ink"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-graphite">
          {hint}
        </p>

        {/* Индексы — фокус-идиома: выбранный резкий в рамке brand, без blur
            на числах (читаемость). */}
        <div
          role="group"
          aria-label="Индекс линзы"
          className="mt-3 flex flex-wrap gap-2"
        >
          {options.map((o, i) => {
            const active = i === sel;
            return (
              <button
                key={o.index}
                type="button"
                aria-pressed={active}
                onClick={() => setSel(i)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm tabular-nums transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active
                    ? "border-brand text-ink"
                    : "border-line text-graphite hover:border-ink/40 hover:text-ink"
                )}
              >
                {o.index}
              </button>
            );
          })}
        </div>

        {/* Описательная подпись степени — кроссфейд по выбору (не цифра) */}
        <div className="relative mt-4 h-6">
          <AnimatePresence initial={false}>
            <motion.p
              key={sel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className="absolute inset-x-0 top-0 text-sm font-medium text-ink"
            >
              {options[sel].note}
            </motion.p>
          </AnimatePresence>
        </div>

        <p className="mt-4 text-xs text-graphite/80">{disclaimer}</p>
      </div>
    </div>
  );
}

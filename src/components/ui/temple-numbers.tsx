"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { templeNumbers } from "@/content/home";

/* ------------------------------------------------------------------
   «Цифры на дужке» — живой ответ FAQ в стиле «Мастерской».
   Чертёж оправы циркульной линией + гравировка 52 □ 18 - 140.
   Наведение/тап по числу подсвечивает соответствующий размер выноской
   и меняет строку-объяснение (кроссфейд). Финальная строка-приглашение
   — резервное состояние строки (дофамин: «посмотрите на свои очки»).
   Высота блока стабильна — открытие пункта аккордеона не прыгает.
   ------------------------------------------------------------------ */

type Key = "lens" | "bridge" | "temple";
const KEYS: Key[] = ["lens", "bridge", "temple"];
const MEANING: Record<Key, string> = {
  lens: "ширина линзы",
  bridge: "ширина моста",
  temple: "длина дужки",
};

/** Размерная выноска на чертеже: линия с засечками + число. */
function Measure({
  x1,
  x2,
  y,
  label,
  on,
  dim,
  numX,
  numY,
  reduce,
}: {
  x1: number;
  x2: number;
  y: number;
  label: string;
  on: boolean;
  dim: boolean;
  numX: number;
  numY: number;
  reduce: boolean;
}) {
  return (
    <g
      className={on ? "text-brand" : "text-line"}
      style={{
        opacity: dim ? 0.4 : 1,
        transition: reduce ? undefined : "opacity 200ms ease, color 200ms ease",
      }}
    >
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke="currentColor"
        strokeWidth={on ? 1.6 : 1}
      />
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="currentColor" strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="currentColor" strokeWidth={1} />
      <text
        x={numX}
        y={numY}
        textAnchor="middle"
        className={cn("font-mono", on ? "fill-brand" : "fill-graphite")}
        style={{ fontSize: 11 }}
      >
        {label}
      </text>
    </g>
  );
}

export default function TempleNumbers() {
  const reduce = !!useReducedMotion();
  const [hovered, setHovered] = useState<Key | null>(null);
  const [pinned, setPinned] = useState<Key | null>(null);
  const active = hovered ?? pinned;

  const explain = active ? templeNumbers.explain[active] : templeNumbers.invite;

  const handlers = (k: Key) => ({
    onMouseEnter: () => setHovered(k),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered(k),
    onBlur: () => setHovered(null),
    onClick: () => setPinned((p) => (p === k ? null : k)),
  });

  return (
    <div className="max-w-xl">
      {/* Чертёж оправы: две линзы, мост, отведённая дужка */}
      <svg
        viewBox="0 0 320 150"
        role="img"
        aria-label="Чертёж оправы с размерами: ширина линзы, ширина моста, длина дужки"
        className="block h-auto w-full max-w-sm"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Силуэт оправы — тонкая линия ink */}
        <g stroke="currentColor" className="text-ink" strokeWidth={1.7}>
          <rect x="24" y="34" width="86" height="58" rx="18" />
          <rect x="150" y="34" width="86" height="58" rx="18" />
          {/* Мост */}
          <path d="M110 50 Q130 41 150 50" strokeWidth={1.5} />
          {/* Шарнир и дужка вправо с заушником */}
          <path d="M236 46 L300 41 Q308 40 308 48 L307 56" strokeWidth={1.5} />
          {/* Левый шарнирный нюб */}
          <path d="M24 50 L18 50" strokeWidth={1.5} />
        </g>

        {/* Размеры-выноски */}
        <Measure
          x1={24}
          x2={110}
          y={108}
          numX={67}
          numY={124}
          label={templeNumbers.engraving.lens}
          on={active === "lens"}
          dim={active !== null && active !== "lens"}
          reduce={reduce}
        />
        <Measure
          x1={110}
          x2={150}
          y={24}
          numX={130}
          numY={18}
          label={templeNumbers.engraving.bridge}
          on={active === "bridge"}
          dim={active !== null && active !== "bridge"}
          reduce={reduce}
        />
        <Measure
          x1={236}
          x2={300}
          y={70}
          numX={268}
          numY={86}
          label={templeNumbers.engraving.temple}
          on={active === "temple"}
          dim={active !== null && active !== "temple"}
          reduce={reduce}
        />
      </svg>

      {/* Гравировка-кнопки: 52 □ 18 - 140 */}
      <div className="mt-5 flex items-center gap-2 font-mono text-lg tracking-wider">
        {KEYS.map((k, i) => (
          <span key={k} className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={pinned === k}
              aria-label={`${templeNumbers.engraving[k]} — ${MEANING[k]}`}
              {...handlers(k)}
              className={cn(
                "rounded-sm px-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active === k ? "text-brand" : "text-ink hover:text-brand-deep"
              )}
            >
              {templeNumbers.engraving[k]}
            </button>
            {/* Разделители: □ после линзы, - после моста */}
            {i === 0 && <span aria-hidden className="text-graphite/60">□</span>}
            {i === 1 && <span aria-hidden className="text-graphite/60">–</span>}
          </span>
        ))}
      </div>

      {/* Строка-объяснение / приглашение — кроссфейд, фиксированная высота */}
      <div className="relative mt-4 h-12 sm:h-10" aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={active ?? "invite"}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className={cn(
              "absolute inset-x-0 top-0 text-sm leading-relaxed sm:text-base",
              active ? "text-ink" : "text-graphite"
            )}
          >
            {explain}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

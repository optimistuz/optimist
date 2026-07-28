"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/cn";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import {
  capsuleSoft,
  formatValueText,
  stateKeyFor,
  type StateKey,
  type VisionSimProps,
} from "@/components/ui/vision-sim-types";

/* ------------------------------------------------------------------
   СИМУЛЯТОР ДЕФЕКТА ЗРЕНИЯ — ОБОЛОЧКА (этап 6, разрез).

   Здесь ТОЛЬКО разметка, которая обязана быть в HTML:
   · кадр настоящим `<img>` — канон требует, чтобы LCP-элементом был img,
     а не canvas: иначе клиент на LTE видит пустую коробку там, где
     обещан подписной момент;
   · зарезервированная пропорция контейнера — без неё секция схлопнулась
     бы в ноль и прыгнула при гидрации (CLS — метрика реестра);
   · угловые подписи и подпись состояния — контент;
   · ARIA-каркас ползунка в ОДНОМ экземпляре.

   Машинерия (перетаскивание, клавиатура, motion-значения, слой
   расфокуса на Kawase) уезжает в `vision-sim-live.tsx` и грузится
   лениво — она и весит. Причина разреза: `vision-sim` целиком сидел
   в критическом пути «/», а бюджет главной пробит.

   ⚠️ Ползунок НЕ дублируется: живая часть вешает обработчики и правит
   `aria-valuenow`/`left` на ЭТОМ узле императивно. Второй `role="slider"`
   означал бы два ползунка на один кадр для скринридера.
   ------------------------------------------------------------------ */

const VisionSimLive = dynamic(
  () => import("@/components/ui/vision-sim-live").then((m) => m.VisionSimLive),
  { ssr: false }
);

export function VisionSim({
  slot,
  photoAlt,
  photoLabel,
  maxDiopters,
  step,
  signDisplay,
  blurCoeff,
  depthMask = false,
  nudge = false,
  hint,
  labels,
  states,
  startAtCenter = false,
  ariaLabel,
  className,
}: VisionSimProps) {
  const reduce = useReduceAfterMount();
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // Начальная ступень — та же, что возьмёт живая часть: до её загрузки
  // подпись под кадром обязана быть ПРАВДОЙ, а не заглушкой.
  const initialAbs = startAtCenter
    ? Math.min(maxDiopters, Math.round(maxDiopters / 2 / step) * step)
    : 0;
  const [stateKey, setStateKey] = useState<StateKey>(
    stateKeyFor(initialAbs, states.mildMax)
  );

  // Машинерию поднимаем, когда кадр подходит к экрану: пока секция далеко,
  // ни motion, ни ogl не нужны никому.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setLive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200%" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const startPos = startAtCenter ? 50 : 0;

  return (
    <div className={className}>
      {/* Сцена-шторка: резкая база всегда в HTML, размываемый слой — за живой частью */}
      <div
        ref={containerRef}
        className="relative aspect-[4/3] cursor-ew-resize select-none overflow-hidden rounded-2xl sm:aspect-[16/9]"
        // pan-y: вертикальный скролл страницы пальцем сохраняется,
        // горизонтальное движение достаётся шторке
        style={{ touchAction: "pan-y" }}
      >
        <div className="absolute inset-0">
          <Photo
            slot={slot}
            alt={photoAlt}
            label={photoLabel}
            sizes="(min-width:1280px) 1232px, 100vw"
          />
        </div>

        {live && (
          <VisionSimLive
            slot={slot}
            maxDiopters={maxDiopters}
            step={step}
            signDisplay={signDisplay}
            blurCoeff={blurCoeff}
            depthMask={depthMask}
            nudge={nudge}
            hint={hint}
            states={states}
            startAtCenter={startAtCenter}
            reduce={!!reduce}
            hostRef={containerRef}
            handleRef={handleRef}
            onStateKey={setStateKey}
          />
        )}

        {/* Линия-ручка: каркас в HTML, ведёт её живая часть.

            ⚠️ ДИАПАЗОН ОБЪЯВЛЕН МОДУЛЕМ (0…maxDiopters), знак живёт в
            `aria-valuetext` («минус 3 диоптрии»). Знаковый диапазон
            (−6…0) выглядел правильнее, но ломал управление: у близорукости
            максимум приходился на НОЛЬ, то есть на левый край кадра, и APG
            требовал бы, чтобы стрелка «вправо» гнала ручку ВЛЕВО, а Home и
            End садились на противоположные концы. Так и было (нашёл `fizik`
            замером с живого узла). По модулю значение растёт слева направо
            и визуально, и численно; заодно диапазон перестал противоречить
            собственной подписи — `aria-label` говорит «СИЛА близорукости»,
            то есть величина без знака.

            ⚠️ `tabIndex` НЕ проставляется здесь: до подъёма ленивой машинерии
            клавиши не работают, и фокусируемый `role="slider"` обещал бы
            скринридеру регулятор, который ничего не делает. Атрибут ставит
            живая часть — тем же способом, каким правит `aria-valuenow`. */}
        <div
          ref={handleRef}
          role="slider"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={maxDiopters}
          aria-valuenow={initialAbs}
          aria-valuetext={formatValueText(initialAbs, signDisplay)}
          className="absolute inset-y-0 z-10 -ml-px w-px bg-paper/60 outline-none"
          style={{ left: `${startPos}%`, touchAction: "none" }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink/15 bg-paper shadow-[0_2px_10px_-4px_rgba(13,13,13,0.3)]">
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
              <path
                d="M5 1 1 5l4 4M11 1l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-graphite"
              />
            </svg>
          </span>
        </div>

        {/* Подписи в нижних углах — капсулы поверх фото */}
        <span className={cn(capsuleSoft, "pointer-events-none absolute bottom-4 left-4 z-10")}>
          {labels.before}
        </span>
        <span className={cn(capsuleSoft, "pointer-events-none absolute bottom-4 right-4 z-10")}>
          {labels.after}
        </span>
      </div>

      {/* Подпись состояния — контент, живёт в HTML и обновляется сигналом */}
      <div className="relative mt-6 h-6 text-center">
        <p className="absolute inset-x-0 top-0 text-sm font-medium text-ink transition-opacity duration-200">
          {states[stateKey]}
        </p>
      </div>
    </div>
  );
}

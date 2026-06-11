"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/cn";
import type { PhotoSlot } from "@/content/photos";

/* ------------------------------------------------------------------
   Калибровка (физика, не магия).
   Пятно расфокуса на сетчатке растёт линейно с дефокусом, поэтому
   blur линеен по диоптриям и пропорционален ширине кадра — телефон
   и десктоп деградируют одинаково ОТНОСИТЕЛЬНО кадра:
   B(px) = (|D| / maxDiopters) × blurCoeff × ширина контейнера, кламп ≤ 18px.
   Улица (max 6, coeff 0.013) при 1200px: −1 → ~2,6px, −3 → ~7,8px,
   −6 → ~15,6px; при 390px: −6 → ~5px.
   ------------------------------------------------------------------ */
const BLUR_MAX = 18;
/** Лёгкая потеря контрастности мира: saturate 1.0 → 0.85 на максимуме. Не усиливать. */
const SAT_LOSS = 0.15;

/**
 * Маска глубины: у близорукого есть «дальняя точка» — близкие объекты
 * размыты меньше дальних. Низ кадра (близкая земля) сохраняет намёк
 * на резкость — честное дешёвое приближение. Включается параметром
 * depthMask (улица); страница книги вся в ближней зоне — там размытие
 * равномерное и маска не нужна.
 */
const DEPTH_MASK =
  "linear-gradient(to top, rgba(0,0,0,0.78) 0%, #000 38%)";

/** Половина ширины капсулы значения: у краёв кадра капсула прижимается,
    чтобы её не срезал overflow-hidden (линия при этом доезжает до края). */
const CAPSULE_HALF = 56;

/** Амплитуда приглашающего толчка в процентах ширины — одна ступень
    улицы (0,5 из 6). Толчок включён только у верхней шторки. */
const NUDGE_AMP = 8.4;

const clampPos = (v: number) => Math.min(100, Math.max(0, v));

/** Капсула-подложка: подписи читаемы поверх любой фотографии. */
const capsuleSoft =
  "rounded-full bg-ink/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-paper backdrop-blur-sm";

type SignDisplay = "minus" | "plus";

/** «−2,5 дптр» / «+1,25 дптр» — формат ru-RU, запятая.
    Минус (близорукость): всегда один знак после запятой — как в рецептах
    с шагом 0,5. Плюс (дальнозоркость): шаг 0,25, до двух знаков без
    хвостовых нулей («+0,25», «+0,5», «+3»), знак плюса — явно. */
const formatCapsule = (abs: number, sign: SignDisplay) =>
  sign === "minus"
    ? (abs > 0 ? "−" : "") +
      abs.toLocaleString("ru-RU", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) +
      " дптр"
    : (abs > 0 ? "+" : "") +
      abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) +
      " дптр";

/** «минус 2,5 диоптрии» / «плюс 1,25 диоптрии» — aria-valuetext со склонением. */
function formatValueText(abs: number, sign: SignDisplay): string {
  if (abs === 0) return "0 диоптрий";
  const num = abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const word = !Number.isInteger(abs)
    ? "диоптрии" // дробные: 0,25 … 5,5
    : abs === 1
      ? "диоптрия"
      : abs <= 4
        ? "диоптрии"
        : "диоптрий";
  return `${sign === "minus" ? "минус" : "плюс"} ${num} ${word}`;
}

type StateKey = "zero" | "mild" | "moderate";

export type VisionSimProps = {
  /** Слот фотографии: street (близорукость) / book (дальнозоркость). */
  slot: PhotoSlot;
  /** Alt резкой базы; размываемый слой декоративный (alt=""). */
  photoAlt: string;
  /** Подпись Placeholder, если слот пуст. */
  photoLabel?: string;
  /** Максимум дефекта по модулю: 6 (улица) / 3 (книга). */
  maxDiopters: number;
  /** Ступень рецепта: 0,5 (минус) / 0,25 (плюс). */
  step: number;
  /** Знак в капсуле и aria: «−2,5 дптр» / «+1,25 дптр». */
  signDisplay: SignDisplay;
  /** Доля ширины кадра при максимуме дефекта (улица 0.013, книга 0.010). */
  blurCoeff: number;
  /** Маска «близкое резче дальнего» — только улица. */
  depthMask?: boolean;
  /** Приглашающий толчок — только верхняя шторка (две — шум). */
  nudge?: boolean;
  /** Подсказка у линии, гаснет после первого касания. */
  hint: string;
  /** Угловые подписи: слева «Без коррекции», справа «В очках …». */
  labels: { before: string; after: string };
  /** Подписи состояний; mildMax — верхняя граница «слабой» степени. */
  states: { zero: string; mild: string; moderate: string; mildMax: number };
  /** Старт линии по центру кадра (оба экземпляра — да). */
  startAtCenter?: boolean;
  ariaLabel: string;
  className?: string;
};

/**
 * Симулятор дефекта зрения в форме шторки — подписной эффект «Оптимиста».
 * Вертикальная линия делит кадр: слева — мир без коррекции, справа —
 * в очках. Позиция линии задаёт силу дефекта СТУПЕНЯМИ step
 * (0 у левого края … maxDiopters у правого): шторка скользит плавно
 * (clip-path, дёшево), а blur пересчитывается только на границах ступеней
 * (transition 180 мс) — пофреймового blur нет, мобильный GPU не страдает.
 *
 * Управление: drag/клик в любом месте кадра (как у прежней шторки),
 * клавиатура на линии: ←/→ — одна ступень, Home/End — 0/максимум.
 * Reduced-motion: без толчка и транзишенов, всё функционально.
 */
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
  startAtCenter = true,
  ariaLabel,
  className,
}: VisionSimProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  // Внутри компонент живёт в МОДУЛЕ диоптрий (0 … maxDiopters);
  // знак — вопрос отображения (signDisplay), не математики.
  const clampAbs = (v: number) => Math.min(maxDiopters, Math.max(0, v));
  /** Снап к ближайшей ступени — значения только дискретные (13 позиций). */
  const snapAbs = (v: number) => clampAbs(Math.round(v / step) * step);

  // Позиция шторки в процентах (0–100), стартовая — посередине
  const initialAbs = startAtCenter ? snapAbs(maxDiopters / 2) : 0;
  const position = useMotionValue(startAtCenter ? 50 : 0);
  /** Текущая ступень |D| — производная позиции, меняется максимум
      (maxDiopters/step + 1) раз за полный проход (а не каждый кадр). */
  const [value, setValue] = useState(initialAbs);
  const valueRef = useRef(initialAbs);
  useMotionValueEvent(position, "change", (v) => {
    const next = snapAbs((maxDiopters * v) / 100);
    if (next !== valueRef.current) {
      valueRef.current = next;
      setValue(next);
    }
  });

  // Ширина контейнера — для калибровки blur и прижима капсулы у краёв
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Шторка: верхний (размытый) слой виден СЛЕВА от линии
  const clipPath = useTransform(position, (v) => `inset(0 ${100 - v}% 0 0)`);
  const left = useTransform(position, (v) => `${v}%`);
  // Капсула едет с линией, у краёв кадра прижимается внутрь
  const capsuleX = useTransform(position, (v) => {
    if (!width) return 0;
    const px = (v / 100) * width;
    return Math.min(Math.max(px, CAPSULE_HALF), Math.max(CAPSULE_HALF, width - CAPSULE_HALF));
  });

  const severity = value / maxDiopters; // 0…1
  const blur = Math.min(BLUR_MAX, severity * blurCoeff * width);
  const saturate = 1 - severity * SAT_LOSS;

  // Первое взаимодействие: ref — мгновенная отмена толчка, state — подсказка
  const touchedRef = useRef(false);
  const [touched, setTouched] = useState(false);
  const nudgeControls = useRef<AnimationPlaybackControls | null>(null);

  const markTouched = () => {
    touchedRef.current = true;
    nudgeControls.current?.stop();
    if (!touched) setTouched(true);
  };

  // Приглашающий толчок: секция видна, шторка не тронута — через 1,2 с
  // линия сама проходит одну ступень и возвращается, один раз
  const inView = useInView(containerRef, { once: true, margin: "-80px" });
  useEffect(() => {
    if (!nudge || !inView || reduce) return;
    const timer = setTimeout(() => {
      if (touchedRef.current) return;
      const from = position.get();
      const controls = animate(position, from + NUDGE_AMP, {
        type: "spring",
        stiffness: 170,
        damping: 13,
      });
      nudgeControls.current = controls;
      controls.then(() => {
        if (touchedRef.current) return;
        nudgeControls.current = animate(position, from, {
          type: "spring",
          stiffness: 170,
          damping: 16,
        });
      });
    }, 1200);
    return () => {
      clearTimeout(timer);
      nudgeControls.current?.stop();
    };
  }, [nudge, inView, reduce, position]);

  // ---- Указатель: drag/клик в любом месте кадра --------------------
  const dragging = useRef(false);
  const setFromClientX = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    position.set(clampPos(((clientX - rect.left) / rect.width) * 100));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    markTouched();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
    handleRef.current?.focus({ preventScroll: true });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setFromClientX(e.clientX);
  };
  const endDrag = () => {
    dragging.current = false;
  };

  // ---- Клавиатура: линия движется по ступеням ----------------------
  // ←/→ — одна ступень (вправо — к максимуму, по направлению шторки),
  // ↑/↓ — дубль по ARIA-паттерну слайдера, Home/End — 0/максимум
  const moveToStep = (abs: number) => {
    const target = (abs / maxDiopters) * 100;
    if (reduce) position.set(target);
    else animate(position, target, { type: "spring", stiffness: 400, damping: 34 });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = value + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = value - step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = maxDiopters;
    if (next === null) return;
    e.preventDefault();
    markTouched();
    moveToStep(clampAbs(next));
  };

  /** Стандартная классификация степени дефекта; граница «слабой» — mildMax. */
  const stateKey: StateKey =
    value === 0 ? "zero" : value <= states.mildMax ? "mild" : "moderate";

  // ARIA-числа — со знаком, как в капсуле: минус живёт в [−max … 0]
  const ariaNow = signDisplay === "minus" ? -value : value;
  const ariaMin = signDisplay === "minus" ? -maxDiopters : 0;
  const ariaMax = signDisplay === "minus" ? 0 : maxDiopters;

  return (
    <div className={className}>
      {/* ---- Сцена-шторка: резкая база + размываемый слой слева ---- */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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

        {/* Оверлей «без коррекции»: clip-path скользит плавно, blur
            пересчитывается только на ступенях; маска глубины (если есть)
            оставляет низ кадра заметно резче дальнего плана.
            scale-105 на внутреннем слое прячет прозрачную кайму blur. */}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{
            clipPath,
            filter: `blur(${blur.toFixed(2)}px) saturate(${saturate.toFixed(3)})`,
            transition: reduce ? "none" : "filter 180ms ease-out",
            willChange: "filter",
            ...(depthMask
              ? { maskImage: DEPTH_MASK, WebkitMaskImage: DEPTH_MASK }
              : {}),
          }}
        >
          <div className="absolute inset-0 scale-105">
            <Photo slot={slot} alt="" sizes="(min-width:1280px) 1232px, 100vw" />
          </div>
        </motion.div>

        {/* Капсула с диоптриями: крупная, едет с линией, ступенями */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-0 top-[calc(50%-72px)] z-10"
          style={{ x: capsuleX }}
        >
          <span className="block -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/85 px-4 py-1.5 text-sm font-medium tabular-nums text-paper sm:text-base">
            {formatCapsule(value, signDisplay)}
          </span>
        </motion.div>

        {/* Линия-ручка с кружком; значение и подпись — стороне слайдера */}
        <motion.div
          ref={handleRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-orientation="horizontal"
          aria-valuemin={ariaMin}
          aria-valuemax={ariaMax}
          aria-valuenow={ariaNow}
          aria-valuetext={formatValueText(value, signDisplay)}
          onKeyDown={onKeyDown}
          className="absolute inset-y-0 z-10 -ml-px w-px bg-paper/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          style={{ left, touchAction: "none" }}
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

          {/* Подсказка — исчезает навсегда после первого взаимодействия */}
          <motion.span
            aria-hidden
            animate={{ opacity: touched ? 0 : 1 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
            className={cn(
              capsuleSoft,
              "absolute left-1/2 top-1/2 mt-9 -translate-x-1/2 whitespace-nowrap"
            )}
          >
            {hint}
          </motion.span>
        </motion.div>

        {/* Подписи в нижних углах — капсулы поверх фото */}
        <span className={cn(capsuleSoft, "pointer-events-none absolute bottom-4 left-4 z-10")}>
          {labels.before}
        </span>
        <span className={cn(capsuleSoft, "pointer-events-none absolute bottom-4 right-4 z-10")}>
          {labels.after}
        </span>
      </div>

      {/* ---- Подпись состояния: кроссфейд 200 мс по ступеням -------- */}
      <div className="relative mt-6 h-6 text-center">
        <AnimatePresence initial={false}>
          <motion.p
            key={stateKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            className="absolute inset-x-0 top-0 text-sm font-medium text-ink"
          >
            {states[stateKey]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

import type { PhotoSlot } from "@/content/photos";

/* ------------------------------------------------------------------
   ОБЩЕЕ ДЛЯ ОБОЛОЧКИ И МАШИНЕРИИ шторки (этап 6, разрез).

   ⚠️ Модуль ЛЁГКИЙ намеренно: его тянет оболочка, которая живёт в
   критическом пути «/». Сюда идут константы, форматирование и типы —
   ничего, что тянуло бы motion, ogl или обработчики.

   Калибровка (физика, не магия). Пятно расфокуса на сетчатке растёт
   линейно с дефокусом, поэтому размытие линейно по диоптриям и
   пропорционально ширине кадра — телефон и десктоп деградируют
   одинаково ОТНОСИТЕЛЬНО кадра:
   B(px) = (|D| / maxDiopters) × blurCoeff × ширина контейнера.
   ------------------------------------------------------------------ */

/**
 * Потолок CSS-ФОЛБЭКА (px). ⚠️ 22, а не 18: канон прямо называет это число
 * («CSS-фолбэк — потолок 22px», CLAUDE.md). Код держал 18 и расходился
 * с законом — поймано грепом до работы этапа 6. У основного пути (Kawase)
 * потолка нет вовсе: там радиус честный.
 */
export const BLUR_MAX = 22;

/** Лёгкая потеря контрастности мира: saturate 1.0 → 0.85 на максимуме. Не усиливать. */
export const SAT_LOSS = 0.15;

/**
 * Маска глубины: у близорукого есть «дальняя точка» — близкие объекты
 * размыты меньше дальних. Низ кадра (близкая земля) сохраняет намёк
 * на резкость. Включается параметром depthMask (улица); страница книги
 * вся в ближней зоне — там размытие равномерное и маска не нужна.
 */
export const DEPTH_MASK = "linear-gradient(to top, rgba(0,0,0,0.78) 0%, #000 38%)";

/** Половина ширины капсулы значения: у краёв кадра капсула прижимается,
    чтобы её не срезал overflow-hidden (линия при этом доезжает до края). */
export const CAPSULE_HALF = 56;

/** Амплитуда приглашающего толчка в процентах ширины — одна ступень
    улицы (0,5 из 6). Толчок включён только у верхней шторки. */
export const NUDGE_AMP = 8.4;

/** Капсула-подложка: подписи читаемы поверх любой фотографии. */
export const capsuleSoft =
  "rounded-full bg-ink/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-paper backdrop-blur-sm";

export type SignDisplay = "minus" | "plus";
export type StateKey = "zero" | "mild" | "moderate";

/** «−2,5 дптр» / «+1,25 дптр» — формат ru-RU, запятая. */
export const formatCapsule = (abs: number, sign: SignDisplay) =>
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
export function formatValueText(abs: number, sign: SignDisplay): string {
  if (abs === 0) return "0 диоптрий";
  const num = abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const word = !Number.isInteger(abs)
    ? "диоптрии"
    : abs === 1
      ? "диоптрия"
      : abs <= 4
        ? "диоптрии"
        : "диоптрий";
  return `${sign === "minus" ? "минус" : "плюс"} ${num} ${word}`;
}

/** Стандартная классификация степени дефекта; граница «слабой» — mildMax. */
export const stateKeyFor = (abs: number, mildMax: number): StateKey =>
  abs === 0 ? "zero" : abs <= mildMax ? "mild" : "moderate";

/** Параметры, общие для оболочки и машинерии. */
export type VisionSimShared = {
  maxDiopters: number;
  step: number;
  signDisplay: SignDisplay;
  blurCoeff: number;
  depthMask?: boolean;
  nudge?: boolean;
  hint: string;
  states: { zero: string; mild: string; moderate: string; mildMax: number };
  startAtCenter?: boolean;
};

export type VisionSimProps = VisionSimShared & {
  /** Слот фотографии: street (близорукость) / book (дальнозоркость). */
  slot: PhotoSlot;
  /** Alt резкой базы; размываемый слой декоративный (alt=""). */
  photoAlt: string;
  /** Подпись Placeholder, если слот пуст. */
  photoLabel?: string;
  /** Угловые подписи: слева «Без коррекции», справа «В очках …». */
  labels: { before: string; after: string };
  ariaLabel: string;
  className?: string;
};

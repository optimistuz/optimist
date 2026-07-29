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
    чтобы её не срезал overflow-hidden (линия при этом доезжает до края).
    ⚠️ 120, а не 56: шагом 5 капсула стала ДИСПЛЕЙНЫМ счётчиком (text-4xl,
    «−3,5 дптр» ≈ 226 px с полями). Оставь прежнее число — и на краях кадра
    крупную цифру начнёт срезать, причём заметит это только тот, кто дотянет
    шторку до самого упора. */
export const CAPSULE_HALF = 120;

/** Амплитуда приглашающего толчка в процентах ширины — одна ступень
    улицы (0,5 из 6). Толчок включён только у верхней шторки. */
export const NUDGE_AMP = 8.4;

/**
 * Капсула-подложка: подписи читаемы поверх любой фотографии.
 *
 * ⚠️ БЕЗ `backdrop-blur`, и это не эстетическая правка. Капсул на симулятор
 * три, а бюджет контентного стекла — ≤2 в кадре; хуже того, они лежат НАД
 * канвасом, который перерисовывается каждый кадр, и композитор пересчитывал
 * бы их фон постоянно (нашёл `hronometrist`). Читаемость добирается
 * плотностью заливки: 55 % → 70 %, на глаз разница незаметна.
 */
export const capsuleSoft =
  "rounded-full bg-ink/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-paper";

export type SignDisplay = "minus" | "plus";
export type StateKey = "zero" | "mild" | "moderate";

/**
 * «−2,5 дптр» / «+1,25 дптр» — формат ru-RU, запятая.
 *
 * ⚠️ ПРОБЕЛ ПЕРЕД ЕДИНИЦЕЙ — НЕРАЗРЫВНЫЙ. Канон называет «−6 дптр» прямо,
 * в перечне обязательных связок, а в коде его не было ни одного: все пробелы
 * файла оказались обычными. Символ задан КОДОМ, а не вписан в строку —
 * невидимый U+00A0 в исходнике не отличить от простого пробела ни глазом,
 * ни в диффе, и потому он теряется молча (уже потерялся однажды).
 */
const NBSP = String.fromCharCode(0xa0);

export const formatCapsule = (abs: number, sign: SignDisplay) =>
  sign === "minus"
    ? (abs > 0 ? "−" : "") +
      abs.toLocaleString("ru-RU", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) +
      NBSP +
      "дптр"
    : (abs > 0 ? "+" : "") +
      abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) +
      NBSP +
      "дптр";

/** «минус 2,5 диоптрии» / «плюс 1,25 диоптрии» — aria-valuetext со склонением. */
export function formatValueText(abs: number, sign: SignDisplay): string {
  if (abs === 0) return `0${NBSP}диоптрий`;
  const num = abs.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  const word = !Number.isInteger(abs)
    ? "диоптрии"
    : abs === 1
      ? "диоптрия"
      : abs <= 4
        ? "диоптрии"
        : "диоптрий";
  return `${sign === "minus" ? "минус" : "плюс"}${NBSP}${num}${NBSP}${word}`;
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

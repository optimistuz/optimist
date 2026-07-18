/**
 * ПАСПОРТ ПОСАДКИ — миллиметры лица из кадра камеры (этап 7, шаг 3).
 *
 * Что это: замер, а не рецепт. Модуль отвечает на вопрос «какого размера ваше
 * лицо» и переводит ответ в человеческую ступень ширины оправы. Он НЕ отвечает
 * на вопрос «какая оправа вам пойдёт» — стилевое обещание посадки живёт за
 * подписью оптометриста (`docs/optometrist-review.md`, §10 Q9) и здесь его нет.
 *
 * ГРАНИЦА ПУБЛИКАЦИИ (CLAUDE.md, «Витрина» п. 6):
 *   — ГЕОМЕТРИЯ (PD, ширина лица, ступень) публикуется сразу: это измерение;
 *   — ОБЕЩАНИЕ ПОСАДКИ («вам подойдёт…») — только после подписи врача.
 * Всюду в подаче: «ориентир, не рецепт», допуск ±2 мм, CTA к оптометристу.
 * Медицинская точность НЕ обещается: рецептурное межзрачковое расстояние
 * снимает врач пупиллометром, а не браузер по веб-камере.
 *
 * ПРИВАТНОСТЬ (CLAUDE.md, «Примерка и камера»): числа отсюда уходят ТОЛЬКО
 * в `fit-session.ts` — память вкладки. Ни localStorage, ни сеть, ни аналитика.
 * Модуль ничего не хранит сам: он чистый счётчик, состояние — у накопителя,
 * который умирает вместе с компонентом камеры.
 *
 * ⚠️ ВСЕ КОЭФФИЦИЕНТЫ НИЖЕ — // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ до публикации
 * стилевой части. Геометрию проверяет рулетка на приёмке (PD ±2 мм).
 */
import type { Pt } from "./face-shape";
import { widthStepFor, type WidthStep } from "@/content/catalog/frame";

/**
 * Горизонтальный диаметр радужки, мм — единственная опорная величина, дающая
 * масштаб «пиксели → миллиметры» без калибровочного предмета в кадре.
 * У взрослых он почти не гуляет (≈ 11,7 мм, разброс порядка ±0,5 мм) и не
 * зависит от расстояния до камеры — потому и служит линейкой (CLAUDE.md,
 * «Дорожная карта точности»).
 *
 * ⚠️ У детей радужка тоже близка к взрослой, а вот лицо — нет: детский замер
 * даст верные миллиметры и бессмысленную ступень взрослой шкалы.
 * // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ
 */
export const IRIS_MM = 11.7;

/** Честный допуск замера по веб-камере. Показывается пользователю всегда. */
export const TOLERANCE_MM = 2;

/* ---- Индексы радужек (478-mesh, refineLandmarks) ------------------
   468 — центр левой радужки, 469–472 — её кольцо;
   473 — центр правой, 474–477 — кольцо. */
const IRIS = {
  centerL: 468,
  ringL: [469, 470, 471, 472],
  centerR: 473,
  ringR: [474, 475, 476, 477],
} as const;

/* ---- Индексы лица (те же, что в face-shape) ---------------------- */
const I = {
  cheekL: 234, // скула слева (bizygomatic)
  cheekR: 454, // скула справа
  noseTip: 1,
  noseBridge: 168, // седло переносицы между глазами (nasion ≈)
} as const;

function dist(a: Pt, b: Pt, w: number, h: number): number {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}

/**
 * Диаметр радужки в пикселях. Радужка — круг, поэтому берём МАКСИМАЛЬНЫЙ
 * размах между противоположными точками кольца: при лёгком повороте головы
 * проекция круга — эллипс, и его большая ось равна истинному диаметру, тогда
 * как малая укорочена. Максимум устойчив и к тому, в каком порядке MediaPipe
 * отдаёт точки кольца, — на этот порядок мы не закладываемся.
 */
function irisDiameterPx(lm: Pt[], ring: readonly number[], w: number, h: number): number {
  const a = dist(lm[ring[0]], lm[ring[2]], w, h);
  const b = dist(lm[ring[1]], lm[ring[3]], w, h);
  return Math.max(a, b);
}

/**
 * Фронтальность кадра для ЗАМЕРА — строже, чем для классификации формы.
 *
 * Почему отдельный, более узкий порог: поворот головы укорачивает межзрачковое
 * расстояние в плоскости кадра как cos(yaw), а диаметр радужки мы берём по
 * большой оси — он НЕ укорачивается. Значит ошибка поворота входит в PD
 * целиком. При воротах классификации (0,84 ≈ 20°) это до ~4 мм — вдвое больше
 * заявленного допуска. При 0,95 (≈ 10°) остаётся около 1 мм, и обещание
 * «±2 мм» перестаёт быть враньём.
 *
 * ⚠️ Поза из `pose.ts` здесь СОЗНАТЕЛЬНО не используется: её собственная
 * докстрока честно говорит, что привязка «какая ось — yaw» уточняется только
 * на этапе 14. Строить миллиметры на непроверенной оси — ложная точность;
 * носовая симметрия измеряется прямо и в проверке не нуждается.
 */
const FRONTAL_MIN_RATIO = 0.95;

export function measurableFrame(
  lm: Pt[] | null | undefined,
  w: number,
  h: number
): boolean {
  if (!lm || lm.length < 478) return false; // без радужек масштаба нет
  const nose = lm[I.noseTip];
  const dl = dist(nose, lm[I.cheekL], w, h);
  const dr = dist(nose, lm[I.cheekR], w, h);
  const ratio = Math.min(dl, dr) / (Math.max(dl, dr) || 1);
  return ratio >= FRONTAL_MIN_RATIO;
}

/** Один замер с одного кадра — сырой, до усреднения. */
export type Measure = {
  /** Межзрачковое расстояние, мм. */
  pd: number;
  /** Ширина лица по скулам, мм. */
  faceWidth: number;
  /** Высота переносицы над линией зрачков, мм (посадка на нос). */
  bridgeHeight: number;
};

/**
 * Замер по одному кадру. Возвращает null, если кадр непригоден: молчание
 * честнее числа, снятого с повёрнутой головы.
 */
export function measureFrame(
  lm: Pt[] | null | undefined,
  w: number,
  h: number
): Measure | null {
  if (!measurableFrame(lm, w, h) || !lm) return null;

  // Линейка кадра: две радужки усредняются — одна может быть прикрыта веком.
  const dL = irisDiameterPx(lm, IRIS.ringL, w, h);
  const dR = irisDiameterPx(lm, IRIS.ringR, w, h);
  const irisPx = (dL + dR) / 2;
  if (!Number.isFinite(irisPx) || irisPx < 1) return null;

  const mmPerPx = IRIS_MM / irisPx;

  const cL = lm[IRIS.centerL];
  const cR = lm[IRIS.centerR];
  const pd = dist(cL, cR, w, h) * mmPerPx;

  const faceWidth = dist(lm[I.cheekL], lm[I.cheekR], w, h) * mmPerPx;

  // Высота переносицы: насколько седло носа выше линии зрачков. Считаем по
  // вертикали в плоскости кадра — крен головы её почти не трогает при
  // фронтальном кадре, а поворот отсечён воротами выше.
  const eyeMidY = ((cL.y + cR.y) / 2) * h;
  const bridgeY = lm[I.noseBridge].y * h;
  const bridgeHeight = Math.abs(eyeMidY - bridgeY) * mmPerPx;

  // Санити: замер вне человеческого диапазона — признак сбоя детекции, а не
  // редкого лица. Отдать его наружу значит соврать увереннее, чем промолчать.
  if (pd < 45 || pd > 80) return null;
  if (faceWidth < 100 || faceWidth > 180) return null;

  return { pd, faceWidth, bridgeHeight };
}

/* ---- Накопитель: медиана по окну кадров --------------------------
   Один кадр дрожит на доли миллиметра от кадра к кадру; медиана по окну
   даёт число, которое воспроизводится между сессиями. Тот же приём, что
   у оценщика формы (face-shape.ts), но по метрике, а не по отношениям. */

/** Сколько годных кадров нужно, чтобы замер считался снятым (~1 с). */
export const MEASURE_WINDOW = 30;

function median(xs: number[]): number {
  const a = [...xs].sort((m, n) => m - n);
  const k = a.length >> 1;
  return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2;
}

export type Passport = {
  /** Межзрачковое расстояние, мм (округлено до 0,5). */
  pd: number;
  /** Ширина лица по скулам, мм (округлено до целого). */
  faceWidth: number;
  /** Высота переносицы над линией зрачков, мм. */
  bridgeHeight: number;
  /** Ступень ширины оправы по геометрии лица (1..5). */
  widthStep: WidthStep;
  /** Допуск, мм — показывается рядом с числами всегда. */
  tolerance: number;
};

export type PassportMeter = {
  /** Добавить кадр. Непригодные молча игнорируются. */
  add: (lm: Pt[] | null | undefined, w: number, h: number) => void;
  /** Сколько годных кадров собрано. */
  count: () => number;
  /** 0..1 — готовность замера. */
  progress: () => number;
  /** Готов ли отдать паспорт. */
  ready: () => boolean;
  /** Паспорт по медиане окна; null, пока кадров мало. */
  read: () => Passport | null;
  /** Буквальное стирание — зовётся вместе с остановкой камеры. */
  reset: () => void;
};

export function createPassportMeter(window = MEASURE_WINDOW): PassportMeter {
  let pds: number[] = [];
  let widths: number[] = [];
  let bridges: number[] = [];

  const push = (arr: number[], v: number) => {
    arr.push(v);
    if (arr.length > window) arr.shift(); // скользящее окно
  };

  return {
    add(lm, w, h) {
      const m = measureFrame(lm, w, h);
      if (!m) return;
      push(pds, m.pd);
      push(widths, m.faceWidth);
      push(bridges, m.bridgeHeight);
    },
    count: () => pds.length,
    progress: () => Math.min(1, pds.length / window),
    ready: () => pds.length >= window,
    read() {
      if (pds.length < window) return null;
      const faceWidth = median(widths);
      return {
        // Полмиллиметра — предел осмысленной точности этого способа;
        // «62,37 мм» было бы наукообразием поверх допуска ±2 мм.
        pd: Math.round(median(pds) * 2) / 2,
        faceWidth: Math.round(faceWidth),
        bridgeHeight: Math.round(median(bridges) * 2) / 2,
        widthStep: widthStepForFace(faceWidth),
        tolerance: TOLERANCE_MM,
      };
    },
    reset() {
      // Новые массивы, а не length=0: старые числа не остаются достижимыми
      // через удержанную ссылку (приватность — буквальное стирание).
      pds = [];
      widths = [];
      bridges = [];
    },
  };
}

/**
 * Ширина лица → ступень ширины ОПРАВЫ.
 *
 * Допущение: у правильно сидящей оправы общая ширина примерно равна ширине
 * лица по скулам — оправа не должна выступать за скулы и не должна давить.
 * Это ходовое правило подбора, и на нём держится бейдж «ваша ширина».
 * // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ (какой именно припуск считать нормой)
 *
 * Лестница ступеней НЕ дублируется: она живёт в `catalog/frame.ts` ровно
 * в одном месте, и `widthStepFor` — единственный способ её прочитать
 * (CLAUDE.md, «Витрина» п. 2: мм не дублируются).
 */
export function widthStepForFace(faceWidthMm: number): WidthStep {
  return widthStepFor(faceWidthMm);
}

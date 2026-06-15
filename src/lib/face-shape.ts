/* ==================================================================
   Классификация формы лица по нормированным антропометрическим
   отношениям из 478-mesh MediaPipe Face Landmarker.

   ВАЖНО: классификация ПРИБЛИЗИТЕЛЬНА. Пороги опираются на стандартную
   морфометрическую логику определения формы лица (соотношения длины и
   ширин лица, лба, скул, челюсти + угол челюсти у gonion), а не на
   самодельные эвристики «на глаз». Финальное слово — за оптометристом.
   Карта «форма → силуэт» (в lib/fit-recommend.ts) — ДРАФТ, помечена
   ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ.

   Файл намеренно БЕЗ внешних импортов (чистые функции) — чтобы юнит-тест
   классификатора компилировался и исполнялся изолированно, без сети.
   ================================================================== */

/** Минимальная точка ландмарка (x,y нормированы 0..1 к кадру). */
export type Pt = { x: number; y: number; z?: number };

export type Shape =
  | "oval"
  | "round"
  | "square"
  | "long"
  | "heart"
  | "diamond";

export const SHAPES: Shape[] = [
  "oval",
  "round",
  "square",
  "long",
  "heart",
  "diamond",
];

/** Нормированные признаки формы (инвариантны к расстоянию до камеры). */
export type Features = {
  /** R1 = длина лица (trichion→menton) / ширина по скулам (bizygomatic).
      Главный предиктор: ~1.4–1.6 → овал; <1.15 → круг/квадрат;
      >1.6 → удлинённое/прямоугольное. */
  r1: number;
  /** R2 = ширина лба / ширина челюсти. >1.0 заметно → «сердце»
      (лоб шире), <1.0 → челюсть шире (квадрат/треугольник). */
  r2: number;
  /** R3 = выраженность скул = ширина скул / max(лоб, челюсть).
      >~1.08 → «диамант» (скулы шире и лба, и челюсти). */
  r3: number;
  /** Острота угла челюсти у gonion: 0 — мягкий (круг/овал),
      1 — острый/прямоугольный (квадрат/прямоугольник). */
  jaw: number;
};

/* ---- Индексы опорных точек 478-mesh ------------------------------
   Левая/правая нумерация — по канонической сетке MediaPipe; для ширин
   считаем расстояния (метка стороны на математику не влияет).
   ВНИМАНИЕ (утренний список): индексы подобраны по канонической сетке
   и требуют проверки точности на реальных лицах. */
const I = {
  foreheadTop: 10, // верхняя кромка лба ≈ trichion (аппроксимация)
  chin: 152, // menton (нижняя точка подбородка)
  cheekL: 234, // скула/висок слева (bizygomatic)
  cheekR: 454, // скула/висок справа
  jawAngleL: 172, // угол челюсти слева (gonion)
  jawAngleR: 397, // угол челюсти справа
  templeL: 21, // висок/край лба слева
  templeR: 251, // висок/край лба справа
  eyeOuterL: 33, // внешний угол глаза слева — линия глаз (roll)
  eyeOuterR: 263, // внешний угол глаза справа
  noseTip: 1, // кончик носа — асимметрия по yaw
} as const;

/* ---- Геометрия (в пиксельных единицах кадра: x·W, y·H) ----------- */
function dist(a: Pt, b: Pt, w: number, h: number): number {
  const dx = (a.x - b.x) * w;
  const dy = (a.y - b.y) * h;
  return Math.hypot(dx, dy);
}

/** Угол при вершине b (в градусах) между лучами b→a и b→c. */
function angleAt(a: Pt, b: Pt, c: Pt, w: number, h: number): number {
  const ax = (a.x - b.x) * w;
  const ay = (a.y - b.y) * h;
  const cx = (c.x - b.x) * w;
  const cy = (c.y - b.y) * h;
  const dot = ax * cx + ay * cy;
  const m = Math.hypot(ax, ay) * Math.hypot(cx, cy) || 1;
  const cos = Math.min(1, Math.max(-1, dot / m));
  return (Math.acos(cos) * 180) / Math.PI;
}

/* ---- Калибровка прототипов форм ----------------------------------
   Каждая форма — точка в пространстве признаков [r1, r2, r3, jaw].
   Веса отражают «кто что различает»: r1 — главный предиктор; r2 ловит
   «сердце»; r3 (узкий зазор) — «диамант»; jaw разводит круг/квадрат.
   Значения — типовые из морфометрической логики формы лица. */
const PROTO: Record<Shape, Features> = {
  round: { r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.15 },
  square: { r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.85 },
  oval: { r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 },
  long: { r1: 1.75, r2: 1.0, r3: 1.0, jaw: 0.6 },
  heart: { r1: 1.4, r2: 1.35, r3: 1.05, jaw: 0.4 },
  diamond: { r1: 1.5, r2: 0.95, r3: 1.18, jaw: 0.5 },
};
const WEIGHT: Features = { r1: 4, r2: 6, r3: 12, jaw: 3 };

export type Decision = {
  primary: Shape;
  secondary: Shape;
  /** Показывать как смесь («овал с чертами удлинённого»): зазор мал. */
  mixture: boolean;
  /** «уверенно» (true) vs «скорее всего» (false). */
  confident: boolean;
  /** p_primary, 0..1 — для процента словами и отладки. */
  confidence: number;
  /** Нормированные веса всех форм (сумма = 1). */
  scores: Record<Shape, number>;
  features: Features;
};

/**
 * Классификация по признакам: score формы = exp(−Σ w·(x−proto)²),
 * затем нормировка в проценты. Возвращает primary/secondary, смесь при
 * близких score и честную уверенность. Чистая функция — её покрывает
 * юнит-тест на синтетических наборах отношений.
 */
export function classify(f: Features): Decision {
  const raw: Record<Shape, number> = {} as Record<Shape, number>;
  let sum = 0;
  for (const s of SHAPES) {
    const p = PROTO[s];
    const d =
      WEIGHT.r1 * (f.r1 - p.r1) ** 2 +
      WEIGHT.r2 * (f.r2 - p.r2) ** 2 +
      WEIGHT.r3 * (f.r3 - p.r3) ** 2 +
      WEIGHT.jaw * (f.jaw - p.jaw) ** 2;
    const score = Math.exp(-d);
    raw[s] = score;
    sum += score;
  }
  const scores: Record<Shape, number> = {} as Record<Shape, number>;
  for (const s of SHAPES) scores[s] = raw[s] / (sum || 1);

  const ranked = [...SHAPES].sort((a, b) => scores[b] - scores[a]);
  const primary = ranked[0];
  const secondary = ranked[1];
  const gap = scores[primary] - scores[secondary];

  return {
    primary,
    secondary,
    // зазор < 15% — честно показываем смесь, а не ложно-точную форму
    mixture: gap < 0.15,
    // зазор ≥ 18% — «уверенно», иначе «скорее всего»
    confident: gap >= 0.18,
    confidence: scores[primary],
    scores,
    features: f,
  };
}

/* ---- Качество кадра (отбраковка плохих) -------------------------- */
export type Quality = "ok" | "noface" | "closer" | "straight" | "center";

const FACE_MIN_FRAC = 0.16; // ширина скул < 16% кадра → «ближе»
// Строже к фронтальности (стабильность классификации): отношения формы
// считаются в плоскости кадра и «плывут» с поворотом/наклоном головы.
// Узкие ворота → в выборку попадают только похожие фронтальные кадры,
// поэтому у одного человека результат воспроизводится между сессиями.
const ROLL_MAX_DEG = 8; // наклон линии глаз (было 10)
const YAW_MIN_RATIO = 0.84; // асимметрия нос↔скулы → поворот головы (было 0.78)
const EDGE = 0.04; // ключевые точки у самой кромки → «лицо целиком»

/**
 * Оценка пригодности кадра по самим ландмаркам (наклон/поворот/размер/
 * выход за кромку). w,h — реальные размеры кадра (videoWidth/Height) для
 * корректных пропорций (x·W, y·H).
 */
export function frameQuality(lm: Pt[] | null | undefined, w: number, h: number): Quality {
  if (!lm || lm.length < 468) return "noface";
  const p = (i: number) => lm[i];

  // Размер лица в кадре (ширина по скулам как доля ширины кадра)
  const cheekFrac = Math.abs(p(I.cheekL).x - p(I.cheekR).x);
  if (cheekFrac < FACE_MIN_FRAC) return "closer";

  // Лицо целиком в кадре (ключевые точки не у самой кромки)
  const keys = [I.foreheadTop, I.chin, I.cheekL, I.cheekR];
  for (const k of keys) {
    const q = p(k);
    if (q.x < EDGE || q.x > 1 - EDGE || q.y < EDGE || q.y > 1 - EDGE)
      return "center";
  }

  // Наклон (roll) — линия внешних углов глаз должна быть горизонтальной
  const eL = p(I.eyeOuterL);
  const eR = p(I.eyeOuterR);
  const roll =
    (Math.atan2((eR.y - eL.y) * h, (eR.x - eL.x) * w) * 180) / Math.PI;
  if (Math.abs(roll) > ROLL_MAX_DEG) return "straight";

  // Поворот (yaw) — расстояния нос↔скулы слева/справа близки у фронтали
  const nose = p(I.noseTip);
  const dl = dist(nose, p(I.cheekL), w, h);
  const dr = dist(nose, p(I.cheekR), w, h);
  const ratio = Math.min(dl, dr) / (Math.max(dl, dr) || 1);
  if (ratio < YAW_MIN_RATIO) return "straight";

  return "ok";
}

/**
 * Признаки формы из ландмарков (только для «чистых» кадров).
 * w,h — реальные размеры кадра для корректных пропорций.
 */
export function featuresFromLandmarks(lm: Pt[], w: number, h: number): Features {
  const p = (i: number) => lm[i];

  const faceLen = dist(p(I.foreheadTop), p(I.chin), w, h);
  const cheekW = dist(p(I.cheekL), p(I.cheekR), w, h) || 1;
  const foreheadW = dist(p(I.templeL), p(I.templeR), w, h) || 1;
  const jawW = dist(p(I.jawAngleL), p(I.jawAngleR), w, h) || 1;

  const r1 = faceLen / cheekW;
  const r2 = foreheadW / jawW;
  const r3 = cheekW / Math.max(foreheadW, jawW);

  // Угол челюсти: при вершине gonion между лучом к скуле и к подбородку.
  // Острее (меньше градусов) → выше jaw. Диапазон ~[100°..135°] → [1..0].
  const aL = angleAt(p(I.cheekL), p(I.jawAngleL), p(I.chin), w, h);
  const aR = angleAt(p(I.cheekR), p(I.jawAngleR), p(I.chin), w, h);
  const jawDeg = (aL + aR) / 2;
  const jaw = Math.min(1, Math.max(0, (135 - jawDeg) / 35));

  return { r1, r2, r3, jaw };
}

/* ---- Оценщик со скользящим окном (временное усреднение) ----------
   Решение — по медиане отношений за окно «чистых» кадров, а не по
   одному кадру: убирает дрожание. Прогресс привязан к РЕАЛЬНОМУ
   накоплению годных кадров (нужно для кино-скана, Блок 5).
   64 кадра — размер скользящего ОКНА медианы (≈2 с фронтальных кадров).
   Длительность скана и финал теперь ведёт не счётчик, а СХОДИМОСТЬ решения
   (см. face-camera): сканируем, пока класс не устоится. Больше кадров в
   окне — устойчивее медиана отношений, результат воспроизводимее. */
const TARGET_CLEAN = 64;

function median(xs: number[]): number {
  const a = [...xs].sort((m, n) => m - n);
  const k = a.length >> 1;
  return a.length % 2 ? a[k] : (a[k - 1] + a[k]) / 2;
}

export type Estimator = {
  /** Добавить признаки чистого кадра. */
  add: (f: Features) => void;
  /** 0..1 — доля собранных годных кадров от цели. */
  progress: () => number;
  /** Достаточно ли кадров для решения. */
  ready: () => boolean;
  /** Сколько чистых кадров накоплено. */
  count: () => number;
  /** Решение по медиане отношений окна (null — кадров мало). */
  decide: () => Decision | null;
  /** Полный сброс окна — буквальное «стирание после подбора». */
  reset: () => void;
};

export function createEstimator(target = TARGET_CLEAN): Estimator {
  let samples: Features[] = [];
  return {
    add(f) {
      samples.push(f);
      if (samples.length > target) samples = samples.slice(-target);
    },
    progress() {
      return Math.min(1, samples.length / target);
    },
    ready() {
      return samples.length >= target;
    },
    count() {
      return samples.length;
    },
    decide() {
      if (samples.length === 0) return null;
      const med: Features = {
        r1: median(samples.map((s) => s.r1)),
        r2: median(samples.map((s) => s.r2)),
        r3: median(samples.map((s) => s.r3)),
        jaw: median(samples.map((s) => s.jaw)),
      };
      return classify(med);
    },
    reset() {
      samples = [];
    },
  };
}

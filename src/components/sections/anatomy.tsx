"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  easeInOut,
  motion,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { LensLoupe } from "@/components/ui/lens-loupe";
import { cn } from "@/lib/cn";
import { anatomy } from "@/content/home";
import { VIEWPORT } from "@/lib/motion";

/* ------------------------------------------------------------------
   Глава «Мастерская» — анатомия оправы.
   Чертёж без единой фотографии: тонкая линия, без заливок и теней.
   Семь частей с каталожными номерами 01–07 — музейная спецификация;
   тексты — что мастер умеет сделать с каждой деталью.
   Скролл ведёт разнесённую сборку (exploded view): на подходе к главе
   детали съезжаются в оправу, при уходе вниз расходятся обратно.
   Только transform (compositor), без фильтров; reduced-motion —
   чертёж всегда собран.
   Интерактив — фокус-идиома: выбранная деталь в brand и чуть толще,
   остальные линии приглушаются, невыбранные подписи отступают.
   ------------------------------------------------------------------ */

const VB_W = 760;
const VB_H = 360;
/** Чертёж крупнее: геометрия частей масштабируется вокруг центра
    (380, 170) и опускается на 16 единиц — поля листа отданы рисунку.
    Выноски и подписи живут в исходных координатах листа (вне масштаба),
    их стартовые точки пересчитаны на увеличенные контуры. */
const DRAW_SCALE = 1.16;
const DRAW_TX = 380 * (1 - DRAW_SCALE);
const DRAW_TY = 170 * (1 - DRAW_SCALE) + 16;
/** Вес штриха по частям 01–07 (визуальные единицы листа; при рендере
    делится на DRAW_SCALE, чтобы укрупнение не утяжеляло линию):
    силуэт ободков тяжелее, линза — световая линия, фурнитура средняя.
    Иерархия линий — то, что отличает чертёж от схемы. Активная деталь
    получает +0.5. */
const PART_STROKE = [2.1, 1.4, 1.8, 1.6, 1.8, 1.8, 1.8];
const STROKE_ACTIVE_DELTA = 0.5;
/** Невидимый жирный штрих — зона клика поверх каждой детали
    (в единицах чертежа до масштаба). В перекрытии побеждает поздняя
    деталь, поэтому у линзы ореол узкий (её главная мишень — вся
    внутренность контура), иначе линза перехватывала бы клики по
    линии ободка; у силуэта ободков ореол щедрый. */
const PART_HIT = [18, 8, 14, 14, 14, 14, 16];

/* ⚠️ ЦЕНТРОИДЫ ДЕТАЛЕЙ И ПОРОГ БЛИЗОСТИ УДАЛЕНЫ (этап 5, шаг 7).
   Proximity-подсветка ближайшей детали под курсором ЗАМЕНЕНА линзой — так
   прямо предписывает plan.md, и того же требует канон «один подписной
   эффект на блок»: два указателя на одном чертеже спорят друг с другом.
   Подсветка была desktop-only (`pointer:fine`), поэтому мобильный опыт
   не пострадал; тач-подсказка от точки касания придёт этапом 9.
   ⚠️ Следствие, которое надо знать: на десктопе БЕЗ WebGL чертёж остаётся
   без подсказки вовсе — CSS-лупа его показать не может (её «картинка» —
   снимок SVG, а снимок делает WebGL-ветка). */

/** ex/ey — вектор разнесённой сборки: куда деталь уезжает в разобранном
    виде (в единицах viewBox, вдоль «оси сборки» своего узла). Сборку
    ведёт скролл, окна фаз — в PartGroup. */
type Shape = { ex?: number; ey?: number } & (
  | { k: "circle"; cx: number; cy: number; r: number }
  | { k: "ellipse"; cx: number; cy: number; rx: number; ry: number; rot: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number }
  | { k: "path"; d: string }
);

/** Геометрия семи частей. Анфас: мягко-квадратные линзы — суперэллипс
    из четырёх дуг (сверху чуть прямее, снизу круглее — лёгкое панто),
    узкий мост двойной аркой, носоупоры на лапках, шарниры-бочонки
    с винтом. Внизу — раскрытая дужка в профиль, сужается к заушнику. */
const PART_SHAPES: Shape[][] = [
  // 01 Ободки — внешний силуэт; в разборке расходятся по горизонтали
  [
    {
      k: "path",
      d: "M 216 50 C 139 50 130 60 130 112 C 130 162 146 174 216 174 C 286 174 302 162 302 112 C 302 60 293 50 216 50 Z",
      ex: -36,
    },
    {
      k: "path",
      d: "M 432 50 C 509 50 518 60 518 112 C 518 162 502 174 432 174 C 362 174 346 162 346 112 C 346 60 355 50 432 50 Z",
      ex: 36,
    },
  ],
  // 02 Линзы — подняты над своими ободками (и следуют за ними по x)
  [
    {
      k: "path",
      d: "M 216 58 C 146 58 138 67 138 112 C 138 155 152 166 216 166 C 280 166 294 155 294 112 C 294 67 286 58 216 58 Z",
      ex: -36,
      ey: -44,
    },
    {
      k: "path",
      d: "M 432 58 C 502 58 510 67 510 112 C 510 155 496 166 432 166 C 368 166 354 155 354 112 C 354 67 362 58 432 58 Z",
      ex: 36,
      ey: -44,
    },
  ],
  // 03 Мост — узкая двойная арка; в разборке висит над проёмом
  [
    { k: "path", d: "M 300 83 C 311 64 337 64 348 83", ey: -58 },
    { k: "path", d: "M 303 96 C 313 82 335 82 345 96", ey: -58 },
  ],
  // 04 Носоупоры — лапки с лепестками; опускаются вниз и чуть врозь
  [
    { k: "line", x1: 300, y1: 120, x2: 307, y2: 139, ex: -12, ey: 36 },
    { k: "line", x1: 348, y1: 120, x2: 341, y2: 139, ex: 12, ey: 36 },
    { k: "ellipse", cx: 308, cy: 145, rx: 5, ry: 10.5, rot: -14, ex: -12, ey: 36 },
    { k: "ellipse", cx: 340, cy: 145, rx: 5, ry: 10.5, rot: 14, ex: 12, ey: 36 },
  ],
  // 05 Шарниры — скобы отстёгиваются наружу, штифт выходит из дужки
  [
    {
      k: "path",
      d: "M 133 74 L 124 74 C 120.7 74 119 75.7 119 79 L 119 87 C 119 90.3 120.7 92 124 92 L 133 92",
      ex: -60,
    },
    { k: "circle", cx: 124, cy: 83, r: 2.2, ex: -60 },
    {
      k: "path",
      d: "M 515 74 L 524 74 C 527.3 74 529 75.7 529 79 L 529 87 C 529 90.3 527.3 92 524 92 L 515 92",
      ex: 60,
    },
    { k: "circle", cx: 524, cy: 83, r: 2.2, ex: 60 },
    { k: "line", x1: 134, y1: 247, x2: 134, y2: 269, ex: -34 },
    { k: "circle", cx: 134, cy: 258, r: 4.5, ex: -34 },
  ],
  // 06 Дужки — стержень выезжает из шарнира вправо
  [
    { k: "path", d: "M 134 250 C 270 247 430 249 536 253", ex: 50 },
    { k: "path", d: "M 134 266 C 270 265 430 262 536 259", ex: 50 },
  ],
  // 07 Заушники — снимаются с кончика дужки дальше всех
  [
    { k: "path", d: "M 536 253 C 570 255 590 270 598 305", ex: 92, ey: 10 },
    { k: "path", d: "M 536 259 C 564 261 582 272 590 305", ex: 92, ey: 10 },
    { k: "path", d: "M 590 305 C 591 310 597 310 598 305", ex: 92, ey: 10 },
  ],
];

/** Волосяные линии-выноски: от детали к кромке чертежа, где сидит
    подпись. Стартовые точки — старые якоря, прогнанные через масштаб
    чертежа (x·s + tx, y·s + ty). */
const LEADERS = [
  "M 124.8 51.4 L 96 40 L 6 40", // 01 → левая колонка
  "M 126 174.4 L 92 216 L 6 216", // 02 → левая
  "M 315 65.4 L 380 26 L 754 26", // 03 → правая
  "M 297.6 172.1 L 244 246 L 6 246", // 04 → левая (выше профиля дужки)
  "M 555.2 85.1 L 640 80 L 754 80", // 05 → правая
  "M 403.2 276.5 L 600 224 L 754 224", // 06 → правая
  "M 635.2 339.1 L 680 330 L 754 330", // 07 → правая
];

/** Раскладка подписей по колонкам: side + вертикаль в % высоты чертежа
    (= y горизонтального плеча выноски / VB_H). */
const LABEL_POS: { side: "l" | "r"; top: string }[] = [
  { side: "l", top: "11.1%" }, // 01
  { side: "l", top: "60.0%" }, // 02
  { side: "r", top: "7.2%" }, // 03
  { side: "l", top: "68.3%" }, // 04
  { side: "r", top: "22.2%" }, // 05
  { side: "r", top: "62.2%" }, // 06
  { side: "r", top: "91.7%" }, // 07
];

/** Штрих рисуется: каскад по частям (~1.2 с на весь чертёж), один раз. */
const draw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (d: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.55, ease: "easeInOut", delay: d },
      opacity: { duration: 0.01, delay: d },
    },
  }),
};

/** Выноски и подписи проявляются после штрихов. */
const lateFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, delay: 1.15 } },
};

/** Статичная фигура без анимации штриха — для reduced-motion и зон клика. */
function PlainShape({ shape }: { shape: Shape }) {
  switch (shape.k) {
    case "circle":
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />;
    case "ellipse":
      return (
        <g transform={`rotate(${shape.rot} ${shape.cx} ${shape.cy})`}>
          <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
        </g>
      );
    case "line":
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />;
    case "path":
      return <path d={shape.d} />;
  }
}

function ShapeEl({
  shape,
  reduce,
  delay,
  spread,
  hit = false,
}: {
  shape: Shape;
  reduce: boolean;
  delay: number;
  spread: MotionValue<number>;
  hit?: boolean;
}) {
  // Смещение разнесённой сборки: вектор × разнесённость своей детали.
  // CSS-px внутри svg равны единицам viewBox — смещения адаптивны сами.
  const x = useTransform(spread, (v) => (shape.ex ?? 0) * v);
  const y = useTransform(spread, (v) => (shape.ey ?? 0) * v);

  if (reduce) return <PlainShape shape={shape} />;
  // Зона клика не рисуется штрихом — просто едет вместе со своей деталью.
  if (hit) {
    if (!shape.ex && !shape.ey) return <PlainShape shape={shape} />;
    return (
      <motion.g style={{ x, y }}>
        <PlainShape shape={shape} />
      </motion.g>
    );
  }
  let el: React.ReactElement;
  switch (shape.k) {
    case "circle":
      el = (
        <motion.circle variants={draw} custom={delay} cx={shape.cx} cy={shape.cy} r={shape.r} />
      );
      break;
    case "ellipse":
      el = (
        <g transform={`rotate(${shape.rot} ${shape.cx} ${shape.cy})`}>
          <motion.ellipse variants={draw} custom={delay} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
        </g>
      );
      break;
    case "line":
      el = (
        <motion.line variants={draw} custom={delay} x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
      );
      break;
    case "path":
      el = <motion.path variants={draw} custom={delay} d={shape.d} />;
      break;
  }
  if (!shape.ex && !shape.ey) return el;
  return <motion.g style={{ x, y }}>{el}</motion.g>;
}

/**
 * Группа одной детали чертежа: hover/pin-подсветка + своя фаза
 * разнесённой сборки. Сборка идёт в каталожном порядке — 01 (силуэт)
 * ложится первым, 07 — последним; разборка обратная: заушник снимается
 * первым. Отсюда окна на шкале прогресса, сдвинутые по номеру детали.
 * Плато «собрано» общее для всех: ~0.42–0.58 (чертёж у центра экрана).
 */
type PartHandlers = {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
};

function PartGroup({
  shapes,
  index,
  total,
  active,
  reduce,
  progress,
  handlers,
  celebrate = false,
  celebrating = false,
}: {
  shapes: Shape[];
  index: number;
  total: number;
  active: number | null;
  reduce: boolean;
  progress: MotionValue<number>;
  handlers: PartHandlers;
  celebrate?: boolean;
  celebrating?: boolean;
}) {
  const t = index / (total - 1); // 0 у детали 01 … 1 у детали 07
  // Окна согласованы с видимостью чертежа: целиком он на экране примерно
  // при прогрессе 0.32…0.68 (вьюпорт ~960), поэтому последние детали
  // садятся на места уже на глазах (0.38–0.44), а разборка начинается
  // ещё до ухода за верхнюю кромку (0.56–0.60).
  const spread = useTransform(
    progress,
    [0.08 + 0.05 * t, 0.38 + 0.06 * t, 0.6 - 0.04 * t, 0.9 - 0.02 * t],
    [1, 0, 0, 1],
    { ease: easeInOut }
  );
  const sel = active === index;
  const dim = active !== null && !sel;
  const litBrand = sel || celebrate;
  return (
    <>
      <g
        stroke="currentColor"
        pointerEvents="none"
        className={litBrand ? "text-brand" : "text-ink"}
        style={{
          strokeWidth:
            (PART_STROKE[index] + (sel ? STROKE_ACTIVE_DELTA : 0)) / DRAW_SCALE,
          opacity: dim ? 0.25 : 1,
          transition: reduce
            ? undefined
            : "opacity 250ms ease, stroke-width 250ms ease, color 250ms ease",
          transitionDelay:
            celebrating && !reduce ? `${index * 0.06}s` : undefined,
        }}
      >
        {shapes.map((s, j) => (
          <ShapeEl
            key={j}
            shape={s}
            reduce={reduce}
            spread={spread}
            delay={index * 0.12 + j * 0.05}
          />
        ))}
      </g>
      {/* Зона клика: те же контуры невидимым жирным штрихом.
          pointer-events:all ловит и внутренность замкнутых контуров —
          клик в линзу выбирает линзу, в ободок — ободок; поздняя
          деталь в перекрытии побеждает (линза поверх ободка).
          Клавиатуре служат подписи-кнопки — здесь aria-hidden. */}
      <g
        aria-hidden
        pointerEvents="all"
        stroke="transparent"
        strokeWidth={PART_HIT[index]}
        className="cursor-pointer"
        {...handlers}
      >
        {shapes.map((s, j) => (
          <ShapeEl key={j} shape={s} reduce={reduce} spread={spread} delay={0} hit />
        ))}
      </g>
    </>
  );
}

export default function Anatomy() {
  const reduce = useReduceAfterMount();
  // hovered — временный фокус (мышь/клавиатура), pinned — закреплённый кликом/тапом
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const active = hovered ?? pinned;

  // ---- Завершение (8.1) + близость курсора (8.2) ----
  // Близость курсора — ПРИРОДА ввода (мышь), не perf-гейт: через единый шлюз
  // берём pointerFine (закон №5). На таче mousemove не вешаем — там курсора
  // нет, деталь выбирается тапом по чипсам/контуру. Рисование штрихов и
  // скролл-сборка НЕ гейтятся способностью — они живут на всех устройствах
  // (только reduce их выключает), поэтому на мобиле чертёж рисуется и
  // собирается наравне с десктопом (этап 2).
  // ⚠️ `useOpticalCapability` здесь больше не нужен: он гейтил ТОЛЬКО
  // proximity-подсветку, а её заменила линза — та ветвится сама, своим
  // шлюзом. Штрихи и скролл-сборка способностью не гейтились никогда.
  const [celebrate, setCelebrate] = useState(false); // фаза «штрихи в brand»
  const [celebrating, setCelebrating] = useState(false); // окно stagger-задержки
  const [showDone, setShowDone] = useState(false); // строка-награда
  const viewedRef = useRef<Set<number>>(new Set());
  const celebratedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const triggerCelebrate = () => {
    if (celebratedRef.current) return;
    celebratedRef.current = true;
    try {
      if (sessionStorage.getItem("optimist-anatomy-done")) return; // уже было
      sessionStorage.setItem("optimist-anatomy-done", "1");
    } catch {
      /* приватный режим — покажем один раз без памяти */
    }
    setShowDone(true);
    if (!reduce) {
      // Каскад: штрихи пробегают brand группа за группой ~1.2 с, затем ink
      setCelebrating(true);
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 1250);
      window.setTimeout(() => setCelebrating(false), 2100);
    }
  };

  const markTouched = () => {
    if (!touched) setTouched(true);
  };
  const markViewed = (i: number) => {
    if (celebratedRef.current) return;
    viewedRef.current.add(i);
    if (viewedRef.current.size >= PART_SHAPES.length) triggerCelebrate();
  };

  const labelHandlers = (i: number) => ({
    onMouseEnter: () => {
      setHovered(i);
      markTouched();
      markViewed(i);
    },
    onMouseLeave: () => setHovered(null),
    onFocus: () => {
      setHovered(i);
      markTouched();
      markViewed(i);
    },
    onBlur: () => setHovered(null),
    onClick: () => {
      setPinned((p) => (p === i ? null : i));
      markTouched();
      markViewed(i);
    },
  });

  /* Петля близости курсора УДАЛЕНА (этап 5, шаг 7): её работу делает линза.
     Она слушала `mousemove` на window и каждым кадром искала ближайший
     центроид — теперь этой петли на «/» нет вовсе. */

  // ---- Разнесённая сборка: прогресс скролла сквозь чертёж ----------
  // 0 — обёртка чертежа у нижней кромки вьюпорта, 1 — у верхней.
  // Детали собираются на подходе и разбираются при уходе вниз (и наоборот
  // при скролле вверх — скраб обратим по природе). reduce: всегда собрано.
  const sceneRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ["start end", "end start"],
  });
  // Выноски и подписи — атрибут собранного экспоната: проявляются к концу
  // сборки, гаснут с началом разборки (разнесённым деталям они врут).
  const specOpacity = useTransform(
    scrollYProgress,
    [0.38, 0.46, 0.54, 0.62],
    [0, 1, 1, 0]
  );
  const specPointer = useTransform(specOpacity, (o) =>
    o < 0.5 ? ("none" as const) : ("auto" as const)
  );

  // Текст строки-описания: выбранная деталь, иначе подсказка до первого касания
  const descKey = active !== null ? anatomy.parts[active].num : touched ? "none" : "hint";
  const descContent =
    active !== null ? (
      <>
        <span className="tabular-nums text-graphite">
          {anatomy.parts[active].num}
          {" · "}
        </span>
        <span className="font-medium">{anatomy.parts[active].name}</span>
        {" — "}
        {anatomy.parts[active].desc}
      </>
    ) : touched ? null : (
      <span className="text-graphite/80">{anatomy.hint}</span>
    );

  const Wrapper = reduce ? "div" : motion.div;

  return (
    <Section id="anatomy" tone="paper">
      <Container>
        <div className="mb-14 max-w-2xl sm:mb-20">
          <Reveal>
            <Eyebrow>{anatomy.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={anatomy.heading} />
            </h2>
          </MotionFocus>
          <Reveal delay={0.1} className="mt-6 max-w-xl">
            <p className="text-base leading-relaxed text-graphite sm:text-lg">{anatomy.body}</p>
          </Reveal>
        </div>

        {/* ---- Чертёж с подписями: одна зона видимости на всё.
             На desktop блок выходит за колонку текста — экспонату
             отдано больше листа (поля контейнера это позволяют,
             горизонтального скролла нет вплоть до 1024). ---- */}
        <Wrapper
          ref={sceneRef}
          {...(reduce
            ? {}
            : { initial: "hidden", whileInView: "visible", viewport: VIEWPORT })}
          className="relative lg:-mx-6 xl:-mx-10"
        >
          {/* Гутеры по бокам — место для колонок подписей на desktop */}
          <div className="relative lg:px-44">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              role="img"
              aria-label="Чертёж оправы: анфас и раскрытая дужка в профиль, семь деталей"
              className="block h-auto w-full"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Детали 01–07, каждая со своей фазой сборки; вся
                  геометрия — внутри масштаба чертежа. Деталь выбирается
                  и наведением/кликом по самому контуру — те же
                  обработчики, что у подписи. */}
              <g transform={`translate(${DRAW_TX} ${DRAW_TY}) scale(${DRAW_SCALE})`}>
                {PART_SHAPES.map((shapes, i) => (
                  <PartGroup
                    key={anatomy.parts[i].num}
                    shapes={shapes}
                    index={i}
                    total={PART_SHAPES.length}
                    active={active}
                    reduce={reduce}
                    progress={scrollYProgress}
                    handlers={labelHandlers(i)}
                    celebrate={celebrate}
                    celebrating={celebrating}
                  />
                ))}
              </g>

              {/* Выноски — только desktop (на мобиле подписи чипсами).
                  Выноска выбранной детали загорается фирменной линией —
                  взгляд ведётся от контура к подписи. */}
              {reduce ? (
                <g strokeWidth={1} className="pointer-events-none hidden lg:block">
                  {LEADERS.map((d, i) => (
                    <path
                      key={i}
                      d={d}
                      stroke="currentColor"
                      className={active === i ? "text-brand" : "text-line"}
                    />
                  ))}
                </g>
              ) : (
                <motion.g
                  style={{ opacity: specOpacity }}
                  className="pointer-events-none hidden lg:block"
                >
                  <motion.g variants={lateFade} strokeWidth={1}>
                    {LEADERS.map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        stroke="currentColor"
                        className={active === i ? "text-brand" : "text-line"}
                        style={{ transition: "stroke 250ms ease" }}
                      />
                    ))}
                  </motion.g>
                </motion.g>
              )}
            </svg>

            {/* ЛИНЗА ПО ЧЕРТЕЖУ (этап 5, шаг 7) — тот же подписной эффект,
                что на карточках Collections. Текстура — офскрин-снимок ЭТОГО
                ЖЕ svg; пересъёмка по выбору детали (`refreshKey`), а не
                каждый кадр: сериализация SVG для петли слишком дорога.
                Заменяет собой proximity-подсветку (см. комментарий у
                удалённых центроидов). */}
            <LensLoupe svgRef={svgRef} refreshKey={active ?? -1} />

            {/* Подписи-выноски: каталожные номера, музейная спецификация.
                Обёртка гасит их вместе с выносками, пока чертёж разобран
                (и выключает клики, чтобы не ловить невидимые кнопки). */}
            <motion.div
              style={reduce ? undefined : { opacity: specOpacity, pointerEvents: specPointer }}
            >
              {anatomy.parts.map((part, i) => {
                const pos = LABEL_POS[i];
                const on = active === i;
                const dim = active !== null && !on;
                const Label = reduce ? "div" : motion.div;
                return (
                  <Label
                    key={part.num}
                    {...(reduce ? {} : { variants: lateFade })}
                    className={cn(
                      "absolute hidden w-40 -translate-y-1/2 lg:block",
                      pos.side === "l" ? "left-0 text-right" : "right-0 text-left"
                    )}
                    style={{ top: pos.top }}
                  >
                    <button
                      type="button"
                      aria-pressed={pinned === i}
                      {...labelHandlers(i)}
                      className="rounded-sm text-xs uppercase tracking-[0.15em] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      style={{
                        filter: dim && !reduce ? "blur(1px)" : "none",
                        opacity: dim ? 0.5 : 1,
                        transition: reduce ? undefined : "filter 250ms ease, opacity 250ms ease",
                      }}
                    >
                      <span
                        className={cn(
                          "font-medium tabular-nums",
                          on ? "text-brand-deep" : "text-graphite"
                        )}
                        style={{
                          transition: reduce ? undefined : "color 200ms ease",
                        }}
                      >
                        {part.num} —{" "}
                      </span>
                      {part.name}
                    </button>
                  </Label>
                );
              })}
            </motion.div>
          </div>

          {/* Мобайл: подписи лентой-чипсами под чертежом */}
          <div className="-mx-1 mt-8 flex gap-2 overflow-x-auto px-1 pb-2 lg:hidden">
            {anatomy.parts.map((part, i) => {
              const sel = pinned === i;
              return (
                <button
                  key={part.num}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => {
                    setPinned((p) => (p === i ? null : i));
                    markTouched();
                    markViewed(i);
                  }}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                    sel
                      ? "border-ink/50 bg-ink/[0.05] text-ink"
                      : "border-line text-graphite"
                  )}
                >
                  <span className={cn("tabular-nums", sel && "text-brand-deep")}>
                    {part.num}
                  </span>{" "}
                  {part.name}
                </button>
              );
            })}
          </div>

          {/* Волосяная линия — как подпись под музейным экспонатом */}
          <div aria-hidden className="mx-auto mt-10 h-px w-10 bg-line" />

          {/* Строка-описание выбранной детали: кроссфейд 200 мс */}
          <div className="relative mx-auto mt-5 h-12 max-w-xl text-center sm:h-14">
            <AnimatePresence initial={false}>
              <motion.p
                key={descKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="absolute inset-x-0 top-0 text-sm leading-relaxed text-ink sm:text-base"
              >
                {descContent}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Награда за осмотр всех семи деталей — строка focus-входом */}
          {showDone && (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0 : 0.7, ease: "easeOut" }}
              className="mx-auto mt-2 max-w-xl text-center text-sm font-medium text-brand-deep sm:text-base"
              role="status"
            >
              <span className="sr-only">{anatomy.doneAria} </span>
              {anatomy.done}
            </motion.p>
          )}
        </Wrapper>
      </Container>
    </Section>
  );
}

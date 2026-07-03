"use client";

import { useEffect } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useTransform,
  useMotionTemplate,
  useSpring,
  type MotionValue,
} from "motion/react";
import { GLASSES } from "@/components/ui/glasses-paths";

/**
 * Hero «Наведение резкости» — портрет-превращение (план hero-concept-focus-portrait).
 *
 * Презентационный слой: всё ведёт ОДИН мастер-прогресс `progress` (0→1), который
 * живёт в hero.tsx и кормит ОДНОВРЕМЕННО текст и портрет — единая волна фокуса,
 * а не три независимые анимации. Раскадровка (p):
 *   0.00–0.08  «близорукое утро» — портрет в расфокусе, кадр пуст;
 *   0.08–0.66  чертёж рисуется МЕДЛЕННО, группами с микропаузами
 *              (ободок → внутр. кромка → переносица → дужки);
 *   0.40–0.86  фокус-окна: сквозь линзы мир резкий РАНЬШЕ остального
 *              («стёкла исправляют первыми»);
 *   0.58–0.74  оправа рождается ПО ЧЕРТЕЖУ (маска по footprint оправы);
 *   0.72–0.90  полный кадр в очках доезжает (гарантия корректного финала),
 *              линии тают, расфокус сцены 6→0 — «надела очки»;
 *   0.84–0.99  один прогон блика по оправе.
 *
 * Текст наводится РАНЬШЕ (см. hero.tsx) — смысл доезжает к ~середине, а кино-хвост
 * наводки доигрывает здесь, на девушке.
 *
 * scene=false (мобайл / reduced-motion): без блюра сцены и фокус-окон — проявление
 * оправы только по opacity (правило мобайла), сразу корректный финал.
 * exit (scrollYProgress, только desktop): «сняла очки» — рэк-фокус ≤4px + глубина.
 */
const W = GLASSES.W;
const H = GLASSES.H;
const VB = `0 0 ${W} ${H}`;
const SIZES = "(min-width:1024px) 60vw, 86vw";

// Растворение нижней кромки в фон страницы (см. key-backdrop.ps1: сам бэкдроп
// уже перекрашен в #F6F4EF, верх и бока бесшовны). Маска bottom-fade «поднимает»
// девушку из фона; верх и лицо плотные и резкие (глаза + оправа — фокус).
const FEATHER = {
  WebkitMaskImage: "linear-gradient(to bottom, #000 60%, rgba(0,0,0,0) 95%)",
  maskImage: "linear-gradient(to bottom, #000 60%, rgba(0,0,0,0) 95%)",
} as const;

// Маски из путей чертежа (система координат = пиксели портрета, viewBox 1:1).
// feGaussianBlur даёт мягкую кромку, чтобы реваль оправы не давал жёсткого среза.
function buildMask(inner: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}'>` +
    `<filter id='f'><feGaussianBlur stdDeviation='4'/></filter>` +
    `<g filter='url(#f)' fill='#fff' stroke='#fff' stroke-linejoin='round' stroke-linecap='round'>` +
    inner +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// footprint всей оправы: линзы залиты + переносица и дужки как толстые штрихи.
const FOOTPRINT = buildMask(
  `<path d='${GLASSES.lensLeftOuter}'/><path d='${GLASSES.lensRightOuter}'/>` +
    `<path fill='none' stroke-width='24' d='${GLASSES.bridge}'/>` +
    `<path fill='none' stroke-width='12' d='${GLASSES.bridgeTop}'/>` +
    `<path fill='none' stroke-width='16' d='${GLASSES.cornerTopLeft}'/>` +
    `<path fill='none' stroke-width='16' d='${GLASSES.cornerTopRight}'/>` +
    `<path fill='none' stroke-width='18' d='${GLASSES.templeLeft}'/>` +
    `<path fill='none' stroke-width='18' d='${GLASSES.templeRight}'/>`
);
// только проёмы линз — для фокус-окон («резко сквозь стекло»).
const LENSES = buildMask(
  `<path d='${GLASSES.lensLeftInner}'/><path d='${GLASSES.lensRightInner}'/>`
);

const maskStyle = (m: string) =>
  ({
    WebkitMaskImage: m,
    maskImage: m,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  }) as const;

export function FocusPortrait({
  className,
  progress,
  scene = false,
  exit,
}: {
  className?: string;
  /** мастер-прогресс волны фокуса (0→1), общий с текстом hero */
  progress: MotionValue<number>;
  /** desktop и не-reduced: блюр сцены, фокус-окна, блик. Иначе — opacity-only */
  scene?: boolean;
  /** scrollYProgress секции hero для «сняла очки» (рэк-фокус выхода), только desktop */
  exit?: MotionValue<number>;
}) {
  const p = progress;
  const zero = useMotionValue(0);
  const exitSrc = exit ?? zero;

  // Расфокус сцены: держится «близоруким» до 0.45, затем наводка в резкость.
  const introBlur = useTransform(p, [0.45, 0.9], [6, 0]);
  // «Сняла очки» по скроллу: мягкий рэк-фокус ≤4px (старт чуть погодя — быстрый
  // скроллер не ловит «смаз»), глубина (масштаб) и параллакс.
  const exitBlur = useTransform(exitSrc, [0.12, 0.6], [0, 4]);
  const photoBlur = useTransform(
    [introBlur, exitBlur] as MotionValue<number>[],
    ([a, b]: number[]) => a + b
  );
  const photoFilter = useMotionTemplate`blur(${photoBlur}px)`;
  const exitScale = useTransform(exitSrc, [0, 0.6], [1, 0.94]);
  const exitY = useTransform(exitSrc, [0, 1], [0, -36]);

  // Оправа: сперва рождается ПО ЧЕРТЕЖУ (маска footprint), затем полный кадр
  // доезжает без маски — гарантия, что дужки/детали у краёв тоже на месте.
  const maskedGlasses = useTransform(p, [0.58, 0.74], [0, 1]);
  const fullGlasses = useTransform(p, [0.72, 0.9], [0, 1]);
  const linesOpacity = useTransform(p, [0.7, 0.86], [1, 0]);
  // Фокус-окна: сквозь линзы резко раньше; держим, пока сцена не дорезкает.
  const windowOpacity = useTransform(p, [0.4, 0.54, 0.74, 0.86], [0, 1, 1, 0]);

  // Рисование линий — медленно, группами с микропаузами между ними.
  const outerL = useTransform(p, [0.08, 0.22], [0, 1]);
  const outerR = useTransform(p, [0.14, 0.28], [0, 1]);
  const innerL = useTransform(p, [0.28, 0.4], [0, 1]);
  const innerR = useTransform(p, [0.32, 0.44], [0, 1]);
  const bridgeLen = useTransform(p, [0.46, 0.56], [0, 1]);
  const templeLen = useTransform(p, [0.56, 0.66], [0, 1]);

  // Блик — один прогон слева-направо по оправе на кульминации.
  const glareOpacity = useTransform(p, [0.84, 0.9, 0.99], [0, 0.45, 0]);
  const glareX = useTransform(p, [0.84, 0.99], ["-150%", "350%"]);

  // Жизнь после вау: тонкий наклон портрета за курсором (desktop).
  const tiltX = useSpring(0, { stiffness: 60, damping: 18 });
  const tiltY = useSpring(0, { stiffness: 60, damping: 18 });
  useEffect(() => {
    if (!scene) return;
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      tiltY.set(nx * 3);
      tiltX.set(-ny * 2);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [scene, tiltX, tiltY]);

  // Блюр вешаем только когда есть что блюрить (desktop-сцена или скролл-выход);
  // на мобиле/reduced портрет резкий, оправа проявляется по opacity.
  const blurStyle = scene || exit ? { filter: photoFilter } : undefined;

  return (
    <div className={className}>
      <motion.div
        className="relative aspect-[1122/1402] w-full overflow-hidden"
        style={{
          ...FEATHER,
          scale: exitScale,
          y: exitY,
          rotateX: tiltX,
          rotateY: tiltY,
          transformPerspective: 1200,
        }}
      >
        {/* Близорукий мир: базовый портрет + проявляющаяся оправа (блюрятся вместе) */}
        <motion.div className="absolute inset-0" style={blurStyle}>
          <Image
            src="/hero/portrait.png"
            alt=""
            fill
            priority
            sizes={SIZES}
            className="object-cover"
          />
          {/* Оправа рождается ПО ЧЕРТЕЖУ (маска footprint) — только desktop */}
          {scene && (
            <motion.div
              className="absolute inset-0"
              style={{ opacity: maskedGlasses, ...maskStyle(FOOTPRINT) }}
              aria-hidden
            >
              <Image
                src="/hero/portrait-glasses.png"
                alt=""
                fill
                sizes={SIZES}
                className="object-cover"
              />
            </motion.div>
          )}
          {/* Полный кадр в очках — гарантия корректного финала */}
          <motion.div className="absolute inset-0" style={{ opacity: fullGlasses }}>
            <Image
              src="/hero/portrait-glasses.png"
              alt="Девушка в очках сети оптики «Оптимист»"
              fill
              sizes={SIZES}
              className="object-cover"
            />
          </motion.div>
        </motion.div>

        {/* Фокус-окна: резкий мир сквозь линзы раньше остального (desktop) */}
        {scene && (
          <motion.div
            className="absolute inset-0"
            style={{ opacity: windowOpacity, ...maskStyle(LENSES) }}
            aria-hidden
          >
            <Image
              src="/hero/portrait.png"
              alt=""
              fill
              sizes={SIZES}
              className="object-cover"
            />
          </motion.div>
        )}

        {/* Чертёж оправы: рисуется поверх расфокуса, затем тает под фото в очках */}
        <motion.svg
          viewBox={VB}
          fill="none"
          stroke="#FD0000"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ opacity: linesOpacity }}
          aria-hidden
        >
          <motion.path d={GLASSES.lensLeftOuter} strokeWidth={1.6} style={{ pathLength: outerL }} />
          <motion.path d={GLASSES.lensRightOuter} strokeWidth={1.6} style={{ pathLength: outerR }} />
          <motion.path d={GLASSES.lensLeftInner} strokeWidth={1.1} style={{ pathLength: innerL }} />
          <motion.path d={GLASSES.lensRightInner} strokeWidth={1.1} style={{ pathLength: innerR }} />
          <motion.path d={GLASSES.bridge} strokeWidth={1.3} style={{ pathLength: bridgeLen }} />
          <motion.path d={GLASSES.bridgeTop} strokeWidth={1.3} style={{ pathLength: bridgeLen }} />
          <motion.path d={GLASSES.cornerTopLeft} strokeWidth={1.8} style={{ pathLength: templeLen }} />
          <motion.path d={GLASSES.cornerTopRight} strokeWidth={1.8} style={{ pathLength: templeLen }} />
          <motion.path d={GLASSES.templeLeft} strokeWidth={2.6} style={{ pathLength: templeLen }} />
          <motion.path d={GLASSES.templeRight} strokeWidth={2.6} style={{ pathLength: templeLen }} />
        </motion.svg>

        {/* Блик: один мягкий прогон света по оправе на кульминации (desktop) */}
        {scene && (
          <motion.div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={maskStyle(FOOTPRINT)}
            aria-hidden
          >
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-screen"
              style={{ opacity: glareOpacity, x: glareX }}
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

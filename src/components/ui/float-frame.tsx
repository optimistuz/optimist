"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/cn";
import { FLOAT_INTRINSIC, PHOTOS, type PhotoSlot } from "@/content/photos";
import { useIntroDone } from "@/components/ui/intro";
import { DURATION, EASE } from "@/lib/motion";

const MotionImage = motion.create(Image);

/**
 * FloatFrame — «парящая» оправа: фото техники на белом фоне лежит прямо
 * на странице через mix-blend-mode: multiply (белый фон кадра растворяется
 * в фоне секции). Кадр обязан быть нормализован до честного (255,255,255) —
 * scripts/normalize-white.ps1, см. CLAUDE.md «Парящие оправы».
 *
 * ФИЗИКА (не менять, не «улучшать» обёртками):
 * - blend смешивается с фоном ВНУТРИ ближайшего stacking context; любой
 *   transform/filter/opacity на обёртке создаёт новый и отрезает фон —
 *   поэтому фон цвета секции лежит ВНУТРИ транформ-слоя и едет вместе
 *   с кадром (снаружи это невидимо: цвет совпадает с фоном секции);
 * - все фильтры (entrance / focal / exitDefocus / contrast) — ОДНИМ
 *   useMotionTemplate на самом <img>: фильтр элемента применяется до
 *   смешения, это законно; фильтр-обёртки — белый прямоугольник;
 * - тень — отдельный div с radial-gradient ПОД картинкой (никакого
 *   drop-shadow на blend-картинках: он расползается по белому кадру).
 *
 * ЗАПРЕЩЕНО оборачивать FloatFrame в FocalPlane и любые filter-обёртки.
 * Левитация (бесконечное покачивание) запрещена: вся жизнь — от скролла
 * и курсора (правило одной вечной анимации).
 */
export function FloatFrame({
  slot,
  widthClass,
  className,
  sizes = "100vw",
  rotate = 0,
  parallaxSpeed = 1,
  rotateDrift = false,
  cursorTilt = false,
  contrast = 1,
  shadow = "natural",
  priority = false,
  entrance = "focus",
  entranceWaitIntro = false,
  focal = "none",
  exitDefocus = 0,
  exitScale = 1,
  sectionTone = "offwhite",
}: {
  slot: PhotoSlot;
  /** Ширина коробки (Tailwind-классы), напр. "w-[52vw] max-w-[980px]". */
  widthClass: string;
  /** Позиционирование снаружи: absolute/inset/z — задаёт вызывающий. */
  className?: string;
  sizes?: string;
  /** Покойный наклон, град. */
  rotate?: number;
  /** 1 — едет со страницей; <1 — отстаёт (×0.85 → амплитуда ~36px). */
  parallaxSpeed?: number;
  /** ±2° по прогрессу секции. */
  rotateDrift?: boolean;
  /** Десктоп: ±1.5° и ±6px за курсором (spring). */
  cursorTilt?: boolean;
  /** Компенсация потемнения от смешения, 1.02–1.05. По умолчанию выкл. */
  contrast?: number;
  /** "natural" — тень в самом кадре; "ellipse" — живая тень-эллипс. */
  shadow?: "natural" | "ellipse";
  priority?: boolean;
  /** Появление: blur 8→0 + opacity (мобайл — только opacity). */
  entrance?: "focus" | "none";
  /** Ждать окончания прелоадера «op» (hero). */
  entranceWaitIntro?: boolean;
  /** "scroll": расфокус ≤2px у кромок вьюпорта — глубина реквизита. */
  focal?: "none" | "scroll";
  /** Блюр (px) к концу выхода секции — рэк-фокус. 0 — выкл. */
  exitDefocus?: number;
  /** Сжатие к концу выхода секции (прощание hero: 0.97). 1 — выкл.
      Живёт на внутреннем слое коробки — scale на внешней обёртке
      отрезал бы blend от фона (факт 1). */
  exitScale?: number;
  /** Фон изолированной коробки = фон секции, где лежит оправа. */
  sectionTone?: "offwhite" | "paper";
}) {
  const src = PHOTOS[slot];
  const dims = FLOAT_INTRINSIC[slot];

  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const reduce = mounted && !!prefersReduce;
  // Фильтры — десктопная роскошь (мобайл: GPU дороже эффекта)
  const filtersOn = mounted && desktop && !reduce;

  // Триггер появления: hero ждёт прелоадер, деко — вход во вьюпорт
  const introDone = useIntroDone();
  const inView = useInView(rootRef, { once: true, margin: "-80px" });
  const started = entranceWaitIntro ? introDone : inView;

  /* ---- Скролл-прогрессы ---- */
  // Видимость коробки во вьюпорте: 0 — входит снизу, 1 — ушла вверх
  const { scrollYProgress: visibility } = useScroll({
    target: rootRef,
    offset: ["start end", "end start"],
  });
  // Выход: 0 — верх коробки у верха вьюпорта (покой hero), 1 — ушла
  const { scrollYProgress: exitProgress } = useScroll({
    target: rootRef,
    offset: ["start start", "end start"],
  });

  /* ---- Параллакс + дрейф + наклон (один транформ-слой) ---- */
  const amplitude = (1 - parallaxSpeed) * 240 * (desktop ? 1 : 0.5);
  const parallaxY = useTransform(visibility, [0, 1], [amplitude, -amplitude]);
  const drift = useTransform(visibility, [0, 1], [-2, 2]);

  const pointerX = useMotionValue(0); // курсор: −1…1 от центра вьюпорта
  const tiltOn = cursorTilt && filtersOn;
  useEffect(() => {
    if (!tiltOn) return;
    const onMove = (e: MouseEvent) => {
      pointerX.set((e.clientX / window.innerWidth) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [tiltOn, pointerX]);
  const tiltRotate = useSpring(useTransform(pointerX, [-1, 1], [-1.5, 1.5]), {
    stiffness: 90,
    damping: 24,
  });
  const tiltX = useSpring(useTransform(pointerX, [-1, 1], [-6, 6]), {
    stiffness: 90,
    damping: 24,
  });

  const totalRotate = useTransform(
    [drift, tiltRotate],
    ([d, t]) =>
      rotate + (rotateDrift && !reduce ? (d as number) : 0) + (tiltOn ? (t as number) : 0)
  );

  /* ---- Фильтры: все слагаемые — в ОДИН filter на <img> ---- */
  const entranceBlur = useMotionValue(entrance === "focus" ? 8 : 0);
  const entranceOpacity = useMotionValue(entrance === "focus" ? 0 : 1);
  const entrancePlayed = useRef(false);
  useEffect(() => {
    if (!mounted || !started || entrancePlayed.current) return;
    entrancePlayed.current = true;
    if (reduce || entrance === "none") {
      entranceBlur.set(0);
      entranceOpacity.set(1);
      return;
    }
    if (!desktop) entranceBlur.set(0); // мобайл: появление без blur
    else
      animate(entranceBlur, 0, {
        duration: DURATION.slow,
        ease: EASE,
        delay: 0.25,
      });
    animate(entranceOpacity, 1, {
      duration: DURATION.slow,
      ease: EASE,
      delay: 0.25,
    });
  }, [mounted, started, reduce, desktop, entrance, entranceBlur, entranceOpacity]);

  // Фокальная глубина реквизита: резко у центра, ≤2px у кромок
  const focalRaw = useTransform(visibility, (p) =>
    focal === "scroll" && filtersOn ? Math.abs(p - 0.5) * 2 * 2 : 0
  );
  const focalBlur = useSpring(focalRaw, { stiffness: 140, damping: 32 });

  // Рэк-фокус на выходе: первые ~6% прогресса — мёртвая зона покоя
  const exitBlur = useTransform(exitProgress, [0.06, 0.85], [
    0,
    filtersOn ? exitDefocus : 0,
  ]);
  // Прощальное сжатие (transform, работает и на мобиле)
  const scale = useTransform(exitProgress, [0, 1], [1, exitScale]);

  const totalBlur = useTransform(
    [entranceBlur, focalBlur, exitBlur],
    (values) => {
      const sum =
        (values[0] as number) + (values[1] as number) + (values[2] as number);
      return Math.round(sum * 100) / 100;
    }
  );
  const filter = useMotionTemplate`blur(${totalBlur}px) contrast(${contrast})`;

  /* ---- Живая тень (только shadow="ellipse") ---- */
  // Тень отстаёт от оправы (×0.92 её параллакса — расслоение = глубина)
  const shadowLagY = useTransform(parallaxY, (y) => y * -0.08);
  const lift = useSpring(useTransform(pointerX, (x) => Math.abs(x)), {
    stiffness: 90,
    damping: 26,
  });
  const shadowOpacity = useTransform(lift, [0, 1], [0.12, 0.09]);
  const shadowScale = useTransform(lift, [0, 1], [1, 1.02]);

  if (!src || !dims) return null; // пустой слот лучше заметного шва

  const still = reduce; // reduced-motion: статичная резкая оправа

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn(
        "pointer-events-none select-none isolate",
        widthClass,
        className
      )}
    >
      {/* Транформ-слой. Фон цвета секции — ВНУТРИ него (факт 1): блендинг
          живёт в stacking context этого слоя, фон едет вместе с кадром.
          В still-ветке стили ЯВНЫЕ, не undefined: motion не стирает уже
          выставленные inline-стили, и оправа замерзала бы на opacity 0
          первого кадра (до маунта рендерится анимационная ветка) */}
      <motion.div
        style={
          still
            ? { rotate }
            : {
                y: parallaxY,
                x: tiltOn ? tiltX : 0,
                rotate: totalRotate,
                scale,
              }
        }
        className={cn(
          "relative",
          sectionTone === "paper" ? "bg-paper" : "bg-offwhite"
        )}
      >
        {shadow === "ellipse" && (
          <motion.div
            style={
              still
                ? { opacity: 0.12 }
                : { y: shadowLagY, opacity: shadowOpacity, scale: shadowScale }
            }
            className="absolute inset-x-[12%] bottom-[2%] h-[14%]"
          >
            <div
              className="h-full w-full"
              style={{
                background:
                  "radial-gradient(50% 50% at 50% 50%, rgba(13,13,13,0.55) 0%, transparent 72%)",
              }}
            />
          </motion.div>
        )}

        <MotionImage
          src={src}
          alt=""
          width={dims.width}
          height={dims.height}
          sizes={sizes}
          priority={priority}
          draggable={false}
          // КРИТИЧНО: оптимизатор Next перекодирует в WebP/AVIF и YUV-
          // конвертация сдвигает белую точку 255 → 254 (при любом q) —
          // после multiply внутри кадра остаётся «фон − 1», шов рубежа 3.
          // Blend-кадры отдаются оригиналом; они нормализованы и сжаты,
          // браузерный даунскейл белый не трогает (проверено пиксельно).
          unoptimized
          // Фильтры — только desktop: identity-blur(0px) на мобиле
          // всё равно создавал бы композитный слой (цена GPU).
          // filter: "none" явный — при смене desktop→mobile или reduce
          // инлайновый фильтр иначе остался бы замороженным
          style={
            still
              ? { opacity: 1, filter: "none" }
              : filtersOn
                ? { filter, opacity: entranceOpacity }
                : { filter: "none", opacity: entranceOpacity }
          }
          className="relative h-auto w-full mix-blend-multiply"
        />
      </motion.div>
    </div>
  );
}

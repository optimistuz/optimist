"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import dynamic from "next/dynamic";
import { Photo } from "@/components/ui/photo";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useOpticalCapability } from "@/lib/use-optical-capability";
import type { PhotoSlot } from "@/content/photos";
import type { StateKey, VisionSimShared } from "@/components/ui/vision-sim-types";
import {
  BLUR_MAX,
  CAPSULE_HALF,
  DEPTH_MASK,
  NUDGE_AMP,
  SAT_LOSS,
  capsuleSoft,
  formatCapsule,
  formatValueText,
  stateKeyFor,
} from "@/components/ui/vision-sim-types";

/* ------------------------------------------------------------------
   МАШИНЕРИЯ ШТОРКИ (этап 6, разрез). Всё интерактивное и тяжёлое:
   перетаскивание, клавиатура, motion-значения, слой расфокуса.

   ⚠️ ПОЧЕМУ ОТДЕЛЬНЫМ ЛЕНИВЫМ МОДУЛЕМ. `vision-sim` сидел в критическом
   пути «/» целиком, а бюджет главной пробит. Разрез идёт по границе
   «разметка / машинерия»: кадр, подписи и ARIA-каркас остаются в HTML
   (LCP-элемент обязан быть `img`, иначе клиент на LTE видит пустую
   коробку, а секция прыгает при гидрации), сюда уезжает то, что весит.

   ⚠️ ОБРАБОТЧИКИ ВЕШАЮТСЯ ИМПЕРАТИВНО на узлы оболочки. Так слайдер
   существует в ОДНОМ экземпляре: продублировать `role="slider"` значило
   бы отдать скринридеру два ползунка на один кадр.
   ------------------------------------------------------------------ */

const VisionBlur = dynamic(
  () => import("@/components/gl/vision-blur").then((m) => m.VisionBlur),
  { ssr: false }
);

export function VisionSimLive({
  slot,
  maxDiopters,
  step,
  signDisplay,
  blurCoeff,
  depthMask = false,
  nudge = false,
  hint,
  states,
  startAtCenter = false,
  reduce,
  hostRef,
  handleRef,
  onStateKey,
}: VisionSimShared & {
  slot: PhotoSlot;
  reduce: boolean;
  /** Контейнер-кадр из оболочки: на него вешается перетаскивание. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  /** Линия-ручка из оболочки: её ведём и озвучиваем для ARIA. */
  handleRef: React.RefObject<HTMLDivElement | null>;
  /** Подпись состояния живёт в оболочке (она в HTML) — сообщаем ей ступень. */
  onStateKey: (k: StateKey) => void;
}) {
  const clampAbs = (v: number) => Math.min(maxDiopters, Math.max(0, v));
  const snapAbs = (v: number) => clampAbs(Math.round(v / step) * step);
  const clampPos = (v: number) => Math.min(100, Math.max(0, v));

  const initialAbs = startAtCenter ? snapAbs(maxDiopters / 2) : 0;
  const position = useMotionValue(startAtCenter ? 50 : 0);
  const [value, setValue] = useState(initialAbs);
  const valueRef = useRef(initialAbs);
  const touchedRef = useRef(false);
  const [touched, setTouched] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [width, setWidth] = useState(0);

  const buzz = () => haptic("snap", reduce);

  useMotionValueEvent(position, "change", (v) => {
    const next = snapAbs((maxDiopters * v) / 100);
    if (next !== valueRef.current) {
      valueRef.current = next;
      setValue(next);
      onStateKey(stateKeyFor(next, states.mildMax));
      if (touchedRef.current) buzz();
    }
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hostRef]);

  const glLive = width > 0 && !glFailed;

  // ---- Непрерывный расфокус (шаг 1) ----
  const severityMV = useTransform(position, (v) =>
    clampAbs((maxDiopters * v) / 100) / maxDiopters
  );
  const filterMV = useTransform(severityMV, (s) => {
    const b = Math.min(BLUR_MAX, s * blurCoeff * width);
    return `blur(${b.toFixed(2)}px) saturate(${(1 - s * SAT_LOSS).toFixed(3)})`;
  });
  const clipPath = useTransform(position, (v) => `inset(0 ${100 - v}% 0 0)`);
  const left = useTransform(position, (v) => `${v}%`);
  const capsuleX = useTransform(position, (v) => {
    if (!width) return 0;
    const px = (v / 100) * width;
    return Math.min(
      Math.max(px, CAPSULE_HALF),
      Math.max(CAPSULE_HALF, width - CAPSULE_HALF)
    );
  });

  /** Оптическая «дорезка» счётчика: 0 дптр — дисплейная резка, максимум —
      текстовая. Число, а не строка: `fontVariationSettings` motion не
      интерполирует, а CSS-переменную — надёжно (тот же приём, что в hero). */
  const opsz = useTransform(severityMV, [0, 1], [72, 20]);

  // ---- Ведём линию-ручку из оболочки ----
  useMotionValueEvent(left, "change", (v) => {
    const h = handleRef.current;
    if (h) h.style.left = v;
  });

  const markTouched = () => {
    touchedRef.current = true;
    nudgeControls.current?.stop();
    if (!touched) setTouched(true);
  };

  /** Доезд до ступени пружиной — общий для клавиш и колеса. */
  const moveToStep = useCallback(
    (abs: number) => {
      const target = (clampAbs(abs) / maxDiopters) * 100;
      if (reduce) position.set(target);
      else animate(position, target, { type: "spring", stiffness: 400, damping: 34 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxDiopters, reduce, position]
  );

  // ---- Перетаскивание: обработчики на контейнер оболочки ----
  const focusFromPointer = useRef(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let dragging = false;
    // Хвост движения для инерции: позиция в процентах и время последних
    // событий. Берём СВОЮ историю, а не Motion `useVelocity` — закон движка
    // №6 запрещает подмешивать его к шине скорости проекта.
    let trail: { p: number; t: number }[] = [];
    const setFromClientX = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const p = clampPos(((clientX - rect.left) / rect.width) * 100);
      position.set(p);
      const t = performance.now();
      trail.push({ p, t });
      // Держим только последние 90 мс — по ним и считается бросок.
      while (trail.length > 2 && t - trail[0].t > 90) trail.shift();
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      trail = [];
      markTouched();
      el.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
      focusFromPointer.current = true;
      handleRef.current?.focus({ preventScroll: true });
      focusFromPointer.current = false;
      handleRef.current?.classList.remove("ring-2", "ring-brand");
    };
    const move = (e: PointerEvent) => {
      if (dragging) setFromClientX(e.clientX);
    };
    /**
     * ⚠️ ДОСНАП ПОЗИЦИИ НА ОТПУСКАНИИ (шаг 4). Канон требует «снап позиции и
     * вибрация — на ступенях 0,5», но снапилось только ЧИСЛО: линия
     * останавливалась между ступенями, и подпись «−3,5 дптр» стояла над
     * ручкой, которая физически показывает −3,42. Теперь бросок продолжается
     * инерцией и садится на ближайшую ступень пружиной.
     *
     * Скорость берётся из собственного хвоста событий, а не из Motion
     * `useVelocity`: закон движка №6 держит единственную шину скорости
     * (Lenis, px/кадр), и подмешивать к ней вторую единицу нельзя.
     */
    const up = () => {
      if (!dragging) return;
      dragging = false;
      const now = performance.now();
      const first = trail[0];
      const lastPt = trail[trail.length - 1];
      // Бросок учитывается, только если палец РЕАЛЬНО двигался под конец:
      // застоявшийся хвост дал бы фантомный доводчик на простом клике.
      const dt = first && lastPt ? lastPt.t - first.t : 0;
      const fresh = lastPt ? now - lastPt.t < 120 : false;
      const vel = dt > 8 && fresh ? (lastPt.p - first.p) / dt : 0; // %/мс
      const PROJECT_MS = 110;
      const projected = clampPos(position.get() + vel * PROJECT_MS);
      const stepPct = (step / maxDiopters) * 100;
      const target = clampPos(Math.round(projected / stepPct) * stepPct);
      if (reduce) position.set(target);
      else animate(position, target, { type: "spring", stiffness: 320, damping: 30 });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, handleRef, position, step, maxDiopters, reduce]);

  // ---- Клавиатура: ступенями, ARIA обновляется на самом узле ----
  useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    // ⚠️ ВВЕРХ И ВПРАВО УВЕЛИЧИВАЮТ, вниз и влево уменьшают (WAI-ARIA APG).
    // Раньше пара «вверх/вниз» была перевёрнута: вниз увеличивал. Диапазон
    // объявлен модулем (см. `vision-sim.tsx`), поэтому «увеличить» здесь —
    // это «сильнее дефект» и «правее ручка» одновременно, для обоих
    // симуляторов сразу.
    const onKey = (e: KeyboardEvent) => {
      let next: number | null = null;
      const cur = valueRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") next = cur + step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = cur - step;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = maxDiopters;
      if (next === null) return;
      e.preventDefault();
      markTouched();
      // Кольцо возвращается только клавиатуре — модальность ведём сами,
      // потому что :focus-visible иногда считает программный focus() при
      // перетаскивании клавиатурным и вспыхивает полосами по бокам линии.
      h.classList.add("ring-2", "ring-brand");
      moveToStep(clampAbs(next));
    };
    const onFocus = () => {
      if (!focusFromPointer.current) h.classList.add("ring-2", "ring-brand");
    };
    const onBlur = () => h.classList.remove("ring-2", "ring-brand");
    h.addEventListener("keydown", onKey);
    h.addEventListener("focus", onFocus);
    h.addEventListener("blur", onBlur);
    // ⚠️ В ФОКУСНЫЙ ПОРЯДОК ползунок входит ровно СЕЙЧАС — вместе с клавишами,
    // а не в серверной разметке. Иначе между показом страницы и подъёмом
    // ленивой машинерии по табу ловился бы регулятор, который не регулирует.
    h.setAttribute("tabindex", "0");
    return () => {
      h.removeEventListener("keydown", onKey);
      h.removeEventListener("focus", onFocus);
      h.removeEventListener("blur", onBlur);
      h.removeAttribute("tabindex");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRef, maxDiopters, step, reduce, position]);

  /* ---- Колесо: шаг за щелчок (шаг 6) ----
     ⚠️ КОЛЕСО НЕ КРАДЁТ СКРОЛЛ СТРАНИЦЫ. Буквальное «при наведении колесо
     двигает шторку» означало бы, что человек, прокручивающий страницу мимо
     симулятора, застревает в нём на десяток щелчков — регрессия и удар по
     Lenis. Поэтому (решение `dirizher`): ГОРИЗОНТАЛЬНАЯ составляющая работает
     при наведении без условий, а ВЕРТИКАЛЬНОЕ колесо — только когда ползунок
     в фокусе, то есть человек уже взялся за него мышью или табом.

     ⚠️ ОДНОГО `preventDefault` НЕ ХВАТАЕТ: Lenis слушает `wheel` на window и
     НЕ смотрит на `defaultPrevented` (тот же случай, что у зума линзы —
     `lens-impl.tsx`). Нужен атрибут `data-lenis-prevent-wheel`, и он ставится
     ТОЛЬКО на время фокуса. Цена решения названа честно: пока ползунок
     сфокусирован, вертикальное колесо над кадром странице не достаётся даже
     на упорах диапазона — чтобы прокрутить дальше, надо увести фокус. Это
     сознательный обмен: альтернатива (снимать атрибут на упоре) даёт двойное
     движение — и ползунок, и страница разом.

     Гейт природы ввода — через `useOpticalCapability`, своего matchMedia
     эффект не заводит (закон движка №5). */
  const { pointerFine } = useOpticalCapability();
  useEffect(() => {
    const el = hostRef.current;
    const h = handleRef.current;
    if (!el || !h || !pointerFine) return;
    let last = 0;
    const onWheel = (e: WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const focused = typeof document !== "undefined" && document.activeElement === h;
      const raw = horizontal ? e.deltaX : focused ? e.deltaY : 0;
      if (!raw) return;
      // Вправо и вверх увеличивают — как у клавиш.
      const dir = horizontal ? (raw > 0 ? 1 : -1) : raw > 0 ? -1 : 1;
      const cur = valueRef.current;
      const next = clampAbs(cur + dir * step);
      // На упоре колесо возвращается странице, а не проваливается в пустоту.
      if (next === cur) return;
      e.preventDefault();
      // Трекпад сыплет десятками событий на один жест — иначе один взмах
      // проходил бы весь диапазон.
      const now = performance.now();
      if (now - last < 90) return;
      last = now;
      markTouched();
      moveToStep(next);
    };
    const onFocus = () => el.setAttribute("data-lenis-prevent-wheel", "");
    const onBlur = () => el.removeAttribute("data-lenis-prevent-wheel");
    el.addEventListener("wheel", onWheel, { passive: false });
    h.addEventListener("focus", onFocus);
    h.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("wheel", onWheel);
      h.removeEventListener("focus", onFocus);
      h.removeEventListener("blur", onBlur);
      el.removeAttribute("data-lenis-prevent-wheel");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostRef, handleRef, pointerFine, step, moveToStep]);

  // ---- ARIA-числа обновляются на узле оболочки ----
  useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    // Число — модуль (диапазон объявлен модулем), знак — в тексте.
    h.setAttribute("aria-valuenow", String(value));
    h.setAttribute("aria-valuetext", formatValueText(value, signDisplay));
  }, [value, signDisplay, handleRef]);

  // ---- Приглашающий толчок ----
  const nudgeControls = useRef<AnimationPlaybackControls | null>(null);
  const inView = useInView(hostRef, { once: true, margin: "-80px" });
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

  const maskStyle = depthMask
    ? { maskImage: DEPTH_MASK, WebkitMaskImage: DEPTH_MASK }
    : undefined;

  return (
    <>
      {/* Слой «без коррекции» на Kawase — канвас внутри overflow-hidden
          контейнера; clip-path и маска глубины кладутся на САМ канвас. */}
      {glLive && (
        <VisionBlur
          hostRef={hostRef}
          severity={severityMV}
          blurCoeff={blurCoeff}
          maxDiopters={maxDiopters}
          step={step}
          satLoss={SAT_LOSS}
          onFail={() => setGlFailed(true)}
          clip={clipPath}
          canvasStyle={maskStyle}
        />
      )}

      {/* CSS-фолбэк: непрерывный blur с потолком 22px. Рабочий эффект. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          display: glLive ? "none" : undefined,
          clipPath,
          filter: filterMV,
          willChange: "filter",
          ...(maskStyle ?? {}),
        }}
      >
        <div className="absolute inset-0 scale-105">
          <Photo slot={slot} alt="" sizes="(min-width:1280px) 1232px, 100vw" />
        </div>
      </motion.div>

      {/* ДИСПЛЕЙНЫЙ СЧЁТЧИК ДИОПТРИЙ (шаг 5) — едет с линией.

          ⚠️ Это УКРУПНЁННАЯ прежняя капсула, а не новый элемент: в кадре уже
          три подписи, и четвёртая спорила бы с фотографией (решение владельца).

          ⚠️ Цифра «дорезается» оптической осью Literata синхронно со шторкой:
          при нуле диоптрий — дисплейная резка (opsz 72, высокий контраст
          штриха), при максимуме — текстовая (opsz 20, штрих плотнее и мягче).
          Смысл прямой: чем хуже зрение, тем менее отточена буква. Механизм тот
          же, что у заголовков hero (`lib/motion.ts`): анимируется ЧИСЛОМ CSS-
          переменная `--opsz`, а шрифт читает её через `font-variation-settings`
          — сам `fontVariationSettings` motion не интерполирует. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-[calc(50%-96px)] z-10"
        style={{ x: capsuleX }}
      >
        <motion.span
          className="block -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/85 px-5 py-2 font-serif text-2xl font-medium tabular-nums leading-none text-paper sm:px-6 sm:py-2.5 sm:text-4xl"
          style={
            {
              "--opsz": opsz,
              fontVariationSettings: '"opsz" var(--opsz, 72)',
            } as React.CSSProperties
          }
        >
          {formatCapsule(value, signDisplay)}
        </motion.span>
      </motion.div>

      {/* Подсказка у ручки — гаснет навсегда после первого касания */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 z-10 w-px"
        style={{ left }}
      >
        <motion.span
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

      {/* Кроссфейд подписи состояния идёт в оболочке — здесь только сигнал */}
      <AnimatePresence initial={false} />
    </>
  );
}

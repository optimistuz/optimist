"use client";

import { useEffect, useRef, useState } from "react";
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

  // ---- Перетаскивание: обработчики на контейнер оболочки ----
  const focusFromPointer = useRef(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let dragging = false;
    const setFromClientX = (clientX: number) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      position.set(clampPos(((clientX - rect.left) / rect.width) * 100));
    };
    const down = (e: PointerEvent) => {
      dragging = true;
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
    const up = () => {
      dragging = false;
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
  }, [hostRef, handleRef, position]);

  // ---- Клавиатура: ступенями, ARIA обновляется на самом узле ----
  useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    const moveToStep = (abs: number) => {
      const target = (abs / maxDiopters) * 100;
      if (reduce) position.set(target);
      else animate(position, target, { type: "spring", stiffness: 400, damping: 34 });
    };
    const onKey = (e: KeyboardEvent) => {
      let next: number | null = null;
      const cur = valueRef.current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = cur + step;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = cur - step;
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
    return () => {
      h.removeEventListener("keydown", onKey);
      h.removeEventListener("focus", onFocus);
      h.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleRef, maxDiopters, step, reduce, position]);

  // ---- ARIA-числа обновляются на узле оболочки ----
  useEffect(() => {
    const h = handleRef.current;
    if (!h) return;
    const now = signDisplay === "minus" ? -value : value;
    h.setAttribute("aria-valuenow", String(now));
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

      {/* Капсула с диоптриями — едет с линией */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-0 top-[calc(50%-72px)] z-10"
        style={{ x: capsuleX }}
      >
        <span className="block -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/85 px-4 py-1.5 text-sm font-medium tabular-nums text-paper sm:text-base">
          {formatCapsule(value, signDisplay)}
        </span>
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

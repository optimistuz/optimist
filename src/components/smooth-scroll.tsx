"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Lenis from "lenis";
import { useMotionValue, type MotionValue } from "motion/react";

/**
 * Контекст с экземпляром Lenis — чтобы любой клиентский компонент
 * (например, шапка при открытии мобильного меню) мог остановить
 * и снова запустить плавный скролл.
 * При reduced-motion Lenis не создаётся, значение остаётся null.
 */
export const LenisContext = createContext<Lenis | null>(null);

/** Удобный доступ к экземпляру Lenis (null, если он не создан). */
export function useLenis() {
  return useContext(LenisContext);
}

/**
 * Скорость скролла как MotionValue — единый источник для velocity-резкости
 * заголовков и умной шапки. Значение берётся из события Lenis, собственных
 * scroll-листенеров нет. При reduced-motion Lenis не создаётся,
 * и MotionValue навсегда остаётся 0 (эффекты выключены).
 */
export function useScrollVelocity(): MotionValue<number> {
  const lenis = useLenis();
  const velocity = useMotionValue(0);

  useEffect(() => {
    if (!lenis) return;
    const onScroll = ({ velocity: v }: Lenis) => velocity.set(v);
    lenis.on("scroll", onScroll);
    return () => {
      lenis.off("scroll", onScroll);
      velocity.set(0);
    };
  }, [lenis, velocity]);

  return velocity;
}

/**
 * Единый rAF-тикер (закон движка №4, CLAUDE.md). Один requestAnimationFrame
 * на весь сайт; порядок кадра: lenis.raf(time) → колбэки эффектов (addTick) →
 * [рендер ogl-канвасов — реестр появится на этапе 5]. Новые эффекты
 * подписываются сюда, а не заводят собственный rAF.
 */
export type Tick = (time: number) => void;

interface Ticker {
  addTick: (fn: Tick) => void;
  removeTick: (fn: Tick) => void;
  /**
   * Рендер ogl-канваса. ОТДЕЛЬНЫЙ реестр, а не ещё один `addTick`: закон №4
   * задаёт ПОРЯДОК кадра — сначала Lenis, потом эффекты (они двигают
   * uniforms), и только потом рисование. Канвас, подписанный через addTick,
   * рисовал бы кадр на позициях ПРОШЛОГО кадра — отставание на кадр, которое
   * ловится глазами как «линза не поспевает за курсором».
   */
  addRender: (fn: Tick) => void;
  removeRender: (fn: Tick) => void;
}

export const TickerContext = createContext<Ticker | null>(null);

/** Подписаться на единый тик (null, если провайдер выше по дереву отсутствует). */
export function useTicker() {
  return useContext(TickerContext);
}

/**
 * Глобальный плавный скролл (Lenis) + корректная навигация по якорям.
 * Оборачивает весь сайт в layout.tsx.
 * При включённом «уменьшить движение» Lenis не запускается, а якоря
 * работают обычным мгновенным переходом.
 */
export default function SmoothScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  // Реестр тика и управление жизнью цикла — в ref-ах (без ре-рендера).
  const lenisRef = useRef<Lenis | null>(null);
  const ticksRef = useRef<Set<Tick>>(new Set());
  const rendersRef = useRef<Set<Tick>>(new Set());
  const rafRef = useRef(0);
  const runningRef = useRef(false);

  const loop = useCallback((time: number) => {
    lenisRef.current?.raf(time);
    ticksRef.current.forEach((fn) => fn(time));
    // Рисование — ПОСЛЕДНИМ: к этому моменту Lenis обновил скролл, а эффекты
    // обновили uniforms, и канвас рисует текущий кадр, а не прошлый.
    rendersRef.current.forEach((fn) => fn(time));
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const ensureRunning = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopIfIdle = useCallback(() => {
    // Цикл нужен, только пока есть Lenis (ему нужен raf), живые тики ИЛИ
    // живые рендеры. Забыть про рендеры здесь значило бы гасить цикл под
    // работающим канвасом.
    if (
      !lenisRef.current &&
      ticksRef.current.size === 0 &&
      rendersRef.current.size === 0 &&
      runningRef.current
    ) {
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    }
  }, []);

  const ticker = useMemo<Ticker>(
    () => ({
      addTick: (fn) => {
        ticksRef.current.add(fn);
        ensureRunning();
      },
      removeTick: (fn) => {
        ticksRef.current.delete(fn);
        stopIfIdle();
      },
      addRender: (fn) => {
        rendersRef.current.add(fn);
        ensureRunning();
      },
      removeRender: (fn) => {
        rendersRef.current.delete(fn);
        stopIfIdle();
      },
    }),
    [ensureRunning, stopIfIdle]
  );

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let instance: Lenis | null = null;

    if (!prefersReduced) {
      // autoRaf:false — raf ведём сами, единым тикером (закон движка №4)
      instance = new Lenis({ duration: 1.2, smoothWheel: true, autoRaf: false });
      lenisRef.current = instance;
      setLenis(instance);
      ensureRunning();
    }
    // При reduce Lenis не создаётся; тикер спит, пока не появится тик
    // (канвасы этапа 5). velocity остаётся 0 — существующее поведение.

    // Плавный переход по внутренним ссылкам-якорям (#id) с учётом хедера
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const link = el.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!link) return;
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") return;
      const targetEl = document.querySelector(hash);
      if (!targetEl) {
        // Секции нет на текущей странице (например, мы на 404) —
        // ведём на главную к нужному якорю обычной навигацией
        if (window.location.pathname !== "/") {
          e.preventDefault();
          window.location.href = "/" + hash;
        }
        return;
      }
      e.preventDefault();
      // Skip-link «К содержанию»: переносим фокус на основной контент (a11y)
      if (hash === "#main") (targetEl as HTMLElement).focus({ preventScroll: true });
      if (instance) {
        // По прибытии — фокус-пульс заголовка целевой секции (MotionFocus
        // слушает anchor-arrive). При reduced-motion Lenis нет — пульса нет.
        instance.scrollTo(targetEl as HTMLElement, {
          offset: -80,
          onComplete: () => {
            window.dispatchEvent(
              new CustomEvent("anchor-arrive", { detail: hash.slice(1) })
            );
          },
        });
      } else {
        (targetEl as HTMLElement).scrollIntoView({ block: "start" });
      }
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      instance?.destroy();
      lenisRef.current = null;
      setLenis(null);
      stopIfIdle();
    };
  }, [ensureRunning, stopIfIdle]);

  return (
    <LenisContext.Provider value={lenis}>
      <TickerContext.Provider value={ticker}>{children}</TickerContext.Provider>
    </LenisContext.Provider>
  );
}

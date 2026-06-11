"use client";

import {
  createContext,
  useContext,
  useEffect,
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

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let instance: Lenis | null = null;
    let rafId = 0;

    if (!prefersReduced) {
      instance = new Lenis({ duration: 1.2, smoothWheel: true });
      setLenis(instance);
      const raf = (time: number) => {
        instance?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    }

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
      if (instance) {
        instance.scrollTo(targetEl as HTMLElement, { offset: -80 });
      } else {
        (targetEl as HTMLElement).scrollIntoView({ block: "start" });
      }
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(rafId);
      instance?.destroy();
      setLenis(null);
    };
  }, []);

  return (
    <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
  );
}

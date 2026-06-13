"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useScrollVelocity } from "@/components/smooth-scroll";

/* ------------------------------------------------------------------
   Живая лента брендов (JS-маркиза на rAF).
   Базовая скорость как у прежней CSS-ленты (один проход списка за 42 с);
   целевая скорость растёт от |velocity| Lenis (кламп ×3 базы) и плавно
   возвращается (lerp). Наведение — мягкое торможение до нуля тем же
   lerp. Бесшовность — две копии дорожки, перенос по modulo ширины.
   ПАУЗА ВНЕ ЭКРАНА (IntersectionObserver) и в скрытой вкладке
   (visibilitychange): rAF не тикает — правило вечного движения, ночь 2.
   reduced-motion — лента статична (rAF не запускается).
   ------------------------------------------------------------------ */

const LOOP_SECONDS = 42; // как в прежней CSS-ленте — базовая скорость
const VELOCITY_K = 0.6; // вклад скорости скролла в целевую скорость
const MAX_FACTOR = 3; // кламп: не быстрее ×3 базы
const LERP = 0.06; // сглаживание к целевой скорости за кадр

export default function BrandMarquee({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const velocity = useScrollVelocity();
  const groupRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const track = trackRef.current;
    const group = groupRef.current;
    if (!track || !group) return;

    let raf = 0;
    let last = 0;
    let offset = 0;
    let half = track.scrollWidth / 2; // ширина одной копии дорожки
    let base = half / LOOP_SECONDS;
    let speed = base;
    let visible = true;

    const measure = () => {
      half = track.scrollWidth / 2;
      base = half / LOOP_SECONDS;
    };

    const tick = (t: number) => {
      if (!last) last = t;
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const v = Math.abs(velocity.get());
      const target = hoverRef.current
        ? 0
        : Math.min(base + VELOCITY_K * v, base * MAX_FACTOR);
      speed += (target - speed) * LERP;
      if (half > 0) {
        offset = (offset + speed * dt) % half;
        track.style.transform = `translate3d(${-offset}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (!raf && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(group);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", measure);

    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", measure);
    };
  }, [reduce, velocity]);

  return (
    <div
      ref={groupRef}
      className="marquee-group relative overflow-x-clip"
      onMouseEnter={() => {
        hoverRef.current = true;
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-offwhite to-transparent sm:w-32" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-offwhite to-transparent sm:w-32" />
      <div ref={trackRef} className="marquee-track flex w-max">
        {[...items, ...items].map((name, i) => (
          <span
            key={i}
            className="mx-10 whitespace-nowrap font-sans text-2xl font-medium uppercase tracking-wide text-ink/30 transition-colors duration-300 hover:text-ink sm:mx-14 sm:text-3xl"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

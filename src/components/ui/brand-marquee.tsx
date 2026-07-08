"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { useScrollVelocity, useTicker } from "@/components/smooth-scroll";
import { useCenterFocus } from "@/lib/use-center-focus";

/* ------------------------------------------------------------------
   Живая лента брендов. Петля живёт в ЕДИНОМ тикере (useTicker→addTick,
   закон движка §3-4) — своего rAF-цикла лента не держит.
   Базовая скорость как у прежней CSS-ленты (один проход списка за 42 с);
   целевая скорость растёт от |velocity| Lenis (кламп ×3 базы) и плавно
   возвращается (lerp). Наведение — мягкое торможение до нуля тем же lerp.
   |speed| → расфокус трека: разгон мутит (до 2px), торможение наводит
   на резкость (значение КВАНТУЕТСЯ до 0.25px — иначе filter перерисовывал
   бы движущийся трек каждый кадр). Бесшовность — две копии дорожки,
   перенос по modulo ширины. ПАУЗА ВНЕ ЭКРАНА (IntersectionObserver) и в
   скрытой вкладке (visibilitychange): тик снимается — правило вечного
   движения, ночь 2. reduced-motion — лента статична (тик не заводится).
   ------------------------------------------------------------------ */

const LOOP_SECONDS = 42; // как в прежней CSS-ленте — базовая скорость
const VELOCITY_K = 0.6; // вклад скорости скролла в целевую скорость
const MAX_FACTOR = 3; // кламп: не быстрее ×3 базы
const LERP = 0.06; // сглаживание к целевой скорости за кадр
const MAX_BLUR = 2; // потолок расфокуса трека на разгоне (px)

export default function BrandMarquee({ items }: { items: string[] }) {
  const reduce = useReducedMotion();
  const velocity = useScrollVelocity();
  const ticker = useTicker();
  const groupRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);

  // Тач-эквивалент фокус-идиомы: лента наводится, когда проходит центр
  // вьюпорта (на десктопе за это отвечает :hover). Наблюдается сама группа.
  useCenterFocus(groupRef);

  useEffect(() => {
    if (reduce || !ticker) return;
    const track = trackRef.current;
    const group = groupRef.current;
    if (!track || !group) return;

    let last = 0;
    let offset = 0;
    let half = track.scrollWidth / 2; // ширина одной копии дорожки
    let base = half / LOOP_SECONDS;
    let speed = base;
    let running = false;
    let inView = false;
    let lastBlur = ""; // последняя записанная строка filter (анти-дребезг)

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
        // Скорость сверх базовой → расфокус (motion-blur), 0…MAX_BLUR px.
        // Квантуем до 0.25px: на устоявшейся скорости строка filter не
        // меняется и движущийся трек не перерисовывается каждый кадр.
        const over = (speed - base) / (base * (MAX_FACTOR - 1)); // 0…1
        const q = Math.round(Math.max(0, Math.min(MAX_BLUR, over * MAX_BLUR)) * 4) / 4;
        const str = q > 0 ? `blur(${q}px)` : "none";
        if (str !== lastBlur) {
          track.style.filter = str;
          lastBlur = str;
        }
      }
    };

    const startTick = () => {
      if (!running && inView && !document.hidden) {
        running = true;
        last = 0;
        ticker.addTick(tick);
      }
    };
    const stopTick = () => {
      if (running) {
        running = false;
        ticker.removeTick(tick);
        track.style.filter = "none"; // на паузе лента резкая
        lastBlur = "none";
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) startTick();
        else stopTick();
      },
      { threshold: 0 }
    );
    io.observe(group);

    const onVisibility = () => {
      if (document.hidden) stopTick();
      else startTick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", measure);

    return () => {
      stopTick();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", measure);
    };
  }, [reduce, velocity, ticker]);

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

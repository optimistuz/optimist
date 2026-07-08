"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { FloatFrame } from "@/components/ui/float-frame";
import { expertise } from "@/content/home";
import { EASE } from "@/lib/motion";

/**
 * Счётчик без ререндеров: motion-значение пишется напрямую в DOM
 * через <motion.span>{display}</motion.span> — React не участвует в кадрах.
 * Цифра НАВОДИТСЯ из расфокуса (blur 4→0) синхронно с пробегом: тот же
 * MotionValue счётчика питает и число, и filter (один владелец filter — сам
 * span). По достижении значения — финальный микро-pop (scale 1→1.04→1,
 * spring, один раз). Reduced-motion: число сразу, резко, без пробега и pop.
 */
function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const raw = useMotionValue(0);
  const display = useTransform(
    raw,
    (v) => Math.round(v).toLocaleString("ru-RU") + suffix
  );
  // Расфокус ведёт тот же счётчик: raw 0→value ⇒ blur 4→0 (не по времени —
  // по пробегу числа). Под reduce raw сразу = value ⇒ blur 0 (резко).
  const blur = useTransform(raw, [0, value], [4, 0]);
  const filter = useMotionTemplate`blur(${blur}px)`;

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      raw.set(value);
      return;
    }
    const controls = animate(raw, value, {
      duration: 1.6,
      ease: EASE,
      onComplete: () => {
        const el = ref.current;
        if (!el) return;
        animate(el, { scale: 1.04 }, { type: "spring", stiffness: 380, damping: 14 }).then(
          () => {
            animate(el, { scale: 1 }, { type: "spring", stiffness: 260, damping: 20 });
          }
        );
      },
    });
    return () => controls.stop();
  }, [inView, value, reduce, raw]);

  return (
    <motion.span
      ref={ref}
      className="inline-block"
      style={{ transformOrigin: "left bottom", filter }}
    >
      {display}
    </motion.span>
  );
}

export default function Expertise() {
  return (
    <Section id="expertise" className="relative">
      {/* Деко-оправа (точка Б): лежит в верхнем поле секции с лёгким
          выпуском за левый край — по диагонали от водяного знака Сивцева.
          Живёт в фокальной плоскости сайта (focal="scroll": резкая у
          центра вьюпорта, мягчеет у кромок). Только desktop, z под
          контентом, текст не пересекает (проверено на 1024–1920).
          Точка А (стык манифеста и «Зрения») пуста: кадр не прошёл
          нормализацию — эффекты без фотографий не строятся. */}
      <FloatFrame
        slot="deco-2"
        rotate={-8}
        parallaxSpeed={0.85}
        entrance="focus"
        focal="scroll"
        sectionTone="offwhite"
        sizes="(min-width: 1024px) 15vw, 80px"
        widthClass="w-20 lg:w-[15vw]"
        className="absolute left-[-7vw] top-[2%] z-0 lg:left-[-4vw] lg:top-2"
      />
      <Container className="relative z-10">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="max-w-xl">
            <Reveal>
              <Eyebrow>{expertise.eyebrow}</Eyebrow>
            </Reveal>
            <MotionFocus>
              <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
                <RevealLines text={expertise.heading} />
              </h2>
            </MotionFocus>
            <Reveal delay={0.1} className="mt-6">
              <p className="text-base leading-relaxed text-graphite">
                {expertise.body}
              </p>
            </Reveal>
          </div>

          <div className="relative">
            {/* Водяной знак экспертизы — таблица Сивцева («Ш Б / М Н К / Ы М Б Ш»):
                типографический мотив кабинета окулиста, на грани видимости.
                Нарастающий книзу СТАТИЧНЫЙ расфокус в 3 ступени (как на 404):
                нижняя строка «труднее навести на резкость». На мобиле —
                уменьшенный (этап 2), чтобы не давать hscroll на 360. */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-4 -top-8 select-none text-center font-serif leading-none text-ink/[0.03] lg:-top-14"
            >
              <span className="block text-[5rem] tracking-[0.18em] blur-[0.6px] lg:text-[10rem]">
                ШБ
              </span>
              <span className="mt-2 block text-[3.25rem] tracking-[0.32em] blur-[1.6px] lg:mt-4 lg:text-[6.5rem]">
                МНК
              </span>
              <span className="mt-2 block text-[2rem] tracking-[0.4em] blur-[3px] lg:mt-3 lg:text-[4rem]">
                ЫМБШ
              </span>
            </div>

            <div className="relative grid grid-cols-2 gap-x-8 gap-y-12">
              {expertise.stats.map((s) => (
                <Reveal key={s.label}>
                  <div className="border-t border-line pt-5">
                    <div className="font-serif text-6xl font-light tabular-nums text-ink sm:text-7xl">
                      <Counter value={s.value} suffix={s.suffix} />
                    </div>
                    <div className="mt-3 text-sm text-graphite">{s.label}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

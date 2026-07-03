"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
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
 * По достижении значения — финальный микро-pop (scale 1→1.04→1, spring,
 * один раз). Reduced-motion: число сразу, без пробега и без pop.
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
      style={{ transformOrigin: "left bottom" }}
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
        sizes="15vw"
        widthClass="w-[15vw]"
        className="absolute left-[-4vw] top-2 z-0 hidden lg:block"
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
            {/* Водяной знак экспертизы — таблица Сивцева («Ш Б / М Н К»):
                типографический мотив кабинета окулиста, на грани видимости */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-4 -top-14 hidden select-none text-center font-serif leading-none text-ink/[0.03] lg:block"
            >
              <span className="block text-[10rem] tracking-[0.18em]">ШБ</span>
              <span className="mt-4 block text-[6.5rem] tracking-[0.32em]">МНК</span>
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

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
import { expertise } from "@/content/home";
import { EASE } from "@/lib/motion";

/**
 * Счётчик без ререндеров: motion-значение пишется напрямую в DOM
 * через <motion.span>{display}</motion.span> — React не участвует в кадрах.
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
    const controls = animate(raw, value, { duration: 1.6, ease: EASE });
    return () => controls.stop();
  }, [inView, value, reduce, raw]);

  return <motion.span ref={ref}>{display}</motion.span>;
}

export default function Expertise() {
  return (
    <Section id="expertise">
      <Container>
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="max-w-md">
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

          <div className="grid grid-cols-2 gap-x-8 gap-y-12">
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
      </Container>
    </Section>
  );
}

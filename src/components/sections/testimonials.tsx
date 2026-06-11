"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { testimonials } from "@/content/home";
import { EASE } from "@/lib/motion";

const SWIPE_THRESHOLD = 50;

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="24"
      height="10"
      viewBox="0 0 24 10"
      fill="none"
      aria-hidden="true"
      className={direction === "left" ? "rotate-180" : undefined}
    >
      <path
        d="M0 5h22M18 1l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Testimonials() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  // Swipe включаем только на коарс-указателе (тач) — на десктопе drag
  // мешал бы выделению текста цитаты
  const [coarsePointer, setCoarsePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarsePointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCoarsePointer(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const count = testimonials.items.length;
  const paginate = (dir: number) =>
    setIndex((i) => (i + dir + count) % count);

  const current = testimonials.items[index];
  const pad = (n: number) => String(n).padStart(2, "0");

  const quote = (
    <blockquote>
      <p className="font-serif text-display-md font-light italic leading-[1.12] text-ink">
        «{current.quote}»
      </p>
      <footer className="mt-8">
        <p className="text-sm font-medium not-italic text-ink">{current.name}</p>
        <p className="mt-0.5 text-sm not-italic text-graphite">{current.role}</p>
      </footer>
    </blockquote>
  );

  return (
    <Section id="testimonials" tone="paper">
      <Container>
        <div className="mb-12 max-w-2xl sm:mb-16">
          <Reveal>
            <Eyebrow>{testimonials.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={testimonials.heading} />
            </h2>
          </MotionFocus>
        </div>

        <Reveal className="max-w-4xl">
          {/* Счётчик и стрелки */}
          <div className="mb-10 flex items-center justify-between border-t border-line pt-6">
            <span className="text-sm tabular-nums text-graphite">
              {pad(index + 1)} — {pad(count)}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Предыдущий отзыв"
                onClick={() => paginate(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-colors duration-300 ease-soft hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-offwhite"
              >
                <Arrow direction="left" />
              </button>
              <button
                type="button"
                aria-label="Следующий отзыв"
                onClick={() => paginate(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-colors duration-300 ease-soft hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-offwhite"
              >
                <Arrow direction="right" />
              </button>
            </div>
          </div>

          {/* Один отзыв на экран; min-h сглаживает разницу длины цитат */}
          <div className="min-h-[16rem] sm:min-h-[18rem]">
            {reduce ? (
              // Reduced-motion: мгновенная смена без анимации
              quote
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  drag={coarsePointer ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -SWIPE_THRESHOLD) paginate(1);
                    else if (info.offset.x > SWIPE_THRESHOLD) paginate(-1);
                  }}
                >
                  {quote}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

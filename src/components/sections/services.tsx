"use client";

import { motion, useReducedMotion } from "motion/react";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { services } from "@/content/home";
import { fadeUp, staggerParent, VIEWPORT } from "@/lib/motion";

type Item = (typeof services.items)[number];

function ArrowRight() {
  return (
    <svg
      width="24"
      height="10"
      viewBox="0 0 24 10"
      fill="none"
      aria-hidden="true"
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

function Row({ item }: { item: Item }) {
  return (
    <div className="focus-item group -mx-4 rounded-xl px-4 transition-[background-color,transform] duration-500 ease-soft hover:bg-ink/[0.03] active:scale-[0.985]">
      <div className="flex items-start gap-6 border-b border-line py-8 sm:gap-10 sm:py-10">
        <span className="mt-1.5 font-sans text-sm tabular-nums text-graphite transition-colors duration-300 group-hover:text-brand-deep">
          {item.index}
        </span>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="font-serif text-2xl text-ink transition-transform duration-300 ease-soft group-hover:translate-x-1.5 sm:text-3xl">
              {item.title}
            </h3>
            <span className="text-xs uppercase tracking-[0.15em] text-graphite">
              {item.tag}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-graphite sm:text-base">
            {item.desc}
          </p>
        </div>
        <span className="mt-2.5 hidden text-brand opacity-0 transition-all duration-300 ease-soft group-hover:translate-x-1 group-hover:opacity-100 sm:block">
          <ArrowRight />
        </span>
      </div>
    </div>
  );
}

export default function Services() {
  const reduce = useReducedMotion();

  return (
    <Section id="services">
      <Container className="lg:grid lg:grid-cols-12 lg:gap-8">
        {/* Sticky-интро (desktop): шапка секции остаётся на месте,
            пока список услуг скроллится мимо */}
        <div className="lg:col-span-5">
          <div className="mb-16 max-w-2xl sm:mb-20 lg:sticky lg:top-32 lg:mb-0">
            <Reveal>
              <Eyebrow>{services.eyebrow}</Eyebrow>
            </Reveal>
            <MotionFocus>
              <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
                <RevealLines text={services.heading} />
              </h2>
            </MotionFocus>
          </div>
        </div>

        {/* focus-list/focus-item — фокус-идиома: наведённая строка резкая,
            соседи отступают (globals.css, только hover-устройства) */}
        <div className="lg:col-span-7">
        {reduce ? (
          <ul className="focus-list border-t border-line">
            {services.items.map((s) => (
              <li key={s.index}>
                <Row item={s} />
              </li>
            ))}
          </ul>
        ) : (
          <motion.ul
            variants={staggerParent}
            initial="hidden"
            whileInView="visible"
            viewport={VIEWPORT}
            className="focus-list border-t border-line"
          >
            {services.items.map((s) => (
              <motion.li key={s.index} variants={fadeUp}>
                <Row item={s} />
              </motion.li>
            ))}
          </motion.ul>
        )}
        </div>
      </Container>
    </Section>
  );
}

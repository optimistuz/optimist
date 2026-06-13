"use client";

import { useState, type ReactNode } from "react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import TempleNumbers from "@/components/ui/temple-numbers";
import LensThickness from "@/components/ui/lens-thickness";
import { faq } from "@/content/home";

// Индекс пункта с живым ответом «цифры на дужке» (см. Блок 6)
const LIVE_ANSWER_INDEX = 4;

/* ------------------------------------------------------------------
   FAQ «Перед визитом» — аккордеон с волосяными линиями и фокус-идиомой.
   Один пункт открыт одновременно; высота — через grid-template-rows
   0fr → 1fr (без measure-хаков). Пункт 5 («цифры на дужке») — живой
   ответ (см. temple-numbers, Блок 6). JSON-LD FAQPage — отдельным
   script внизу секции.
   ------------------------------------------------------------------ */

function Chevron({ open, reduce }: { open: boolean; reduce: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-graphite"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: reduce ? undefined : "transform 200ms ease",
      }}
    >
      <path
        d="M3 5 7 9 11 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FaqItem({
  index,
  question,
  answer,
  open,
  dim,
  reduce,
  onToggle,
  children,
}: {
  index: number;
  question: string;
  answer: string;
  open: boolean;
  dim: boolean;
  reduce: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const qId = `faq-q-${index}`;
  const aId = `faq-a-${index}`;
  return (
    <div
      className="border-t border-line"
      style={{
        opacity: dim ? 0.5 : 1,
        transition: reduce ? undefined : "opacity 250ms ease",
      }}
    >
      <h3 className="m-0">
        <button
          id={qId}
          type="button"
          aria-expanded={open}
          aria-controls={aId}
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-6 py-6 text-left text-base font-medium text-ink transition-colors duration-200 hover:text-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:text-lg"
        >
          <span>{question}</span>
          <Chevron open={open} reduce={reduce} />
        </button>
      </h3>
      <div
        id={aId}
        role="region"
        aria-labelledby={qId}
        className="grid"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reduce ? undefined : "grid-template-rows 280ms ease",
        }}
      >
        <div className="overflow-hidden">
          <div className="pb-7 pr-6 text-sm leading-relaxed text-graphite sm:text-base">
            {children ?? <p className="max-w-2xl">{answer}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Faq() {
  const reduce = useReduceAfterMount();
  const [open, setOpen] = useState<number | null>(null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <Section id="faq">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="max-w-md">
            <Reveal>
              <Eyebrow>{faq.eyebrow}</Eyebrow>
            </Reveal>
            <MotionFocus>
              <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
                <RevealLines text={faq.heading} />
              </h2>
            </MotionFocus>
            <Reveal delay={0.1} className="mt-6">
              <p className="text-base leading-relaxed text-graphite sm:text-lg">
                {faq.lead}
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="border-b border-line">
            {faq.items.map((item, i) => (
              <FaqItem
                key={item.q}
                index={i}
                question={item.q}
                answer={item.a}
                open={open === i}
                dim={open !== null && open !== i}
                reduce={reduce}
                onToggle={() => setOpen((o) => (o === i ? null : i))}
              >
                {i === LIVE_ANSWER_INDEX ? (
                  <div>
                    <p className="mb-6 max-w-2xl">{item.a}</p>
                    <TempleNumbers />
                  </div>
                ) : item.live === "lens" ? (
                  <div>
                    <p className="mb-6 max-w-2xl">{item.a}</p>
                    <LensThickness />
                  </div>
                ) : undefined}
              </FaqItem>
            ))}
          </Reveal>
        </div>
      </Container>

      {/* JSON-LD FAQPage — для пункта 5 берётся текстовое резюме ответа */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </Section>
  );
}

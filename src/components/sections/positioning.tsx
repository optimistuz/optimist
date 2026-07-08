"use client";

import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { ScrollTitre } from "@/components/ui/scroll-titre";
import { PulseWord } from "@/components/ui/pulse-word";
import { FloatFrame } from "@/components/ui/float-frame";
import { useReadLines } from "@/lib/use-read-lines";
import { positioning } from "@/content/home";

export default function Positioning() {
  // Две строки манифеста наводятся ПО ОДНОЙ по мере прохода через центр
  // вьюпорта (этап 3). Body — обычный Reveal (6px blur на мелком тексте лишний).
  const { registers, read } = useReadLines(2);

  return (
    <Section id="about" className="relative">
      {/* Деко-оправа (точка В): матовый щиток в правом поле, на уровне
          НИЖНЕГО абзаца (body max-w-2xl слева — правая сторона свободна
          на 1024–1920; вводный statement шире, max-w-4xl, поэтому оправа
          опущена ниже него). z-0 под контентом и под «Шкалой наводки»
          (z-40): навигацию не ломает и не перекрывает. Только desktop,
          фокальная плоскость (резка у центра, мягчеет к кромкам). */}
      <FloatFrame
        slot="deco-3"
        rotate={-7}
        parallaxSpeed={0.88}
        entrance="focus"
        focal="scroll"
        sectionTone="offwhite"
        sizes="(min-width: 1024px) 12vw, 80px"
        widthClass="w-20 lg:w-[12vw]"
        className="absolute right-[-7vw] top-[2%] z-0 lg:right-[-3vw] lg:top-[66%]"
      />
      <Container className="relative z-10">
        <div className="max-w-4xl">
          <Reveal>
            <Eyebrow>{positioning.eyebrow}</Eyebrow>
          </Reveal>
          {/* Манифест: строки-титры наводятся из расфокуса по скроллу.
              Фильтр — на самих строках, не на секции (там деко-FloatFrame). */}
          <div className="mt-8 space-y-2 font-serif text-display-lg font-light leading-[1.12]">
            <ScrollTitre
              register={registers[0]}
              read={read[0]}
              className="text-graphite"
            >
              {positioning.lead}
            </ScrollTitre>
            <ScrollTitre
              register={registers[1]}
              read={read[1]}
              className="text-ink"
            >
              {positioning.statementBefore}
              <PulseWord>{positioning.statementAccent}</PulseWord>
              {positioning.statementAfter}
            </ScrollTitre>
          </div>
          <Reveal delay={0.1} className="mt-12 max-w-2xl">
            <p className="text-base leading-relaxed text-graphite sm:text-lg">
              {positioning.body}
            </p>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

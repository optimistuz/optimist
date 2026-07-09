"use client";

import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { ClarityZone } from "@/components/ui/clarity-zone";
import { FloatFrame } from "@/components/ui/float-frame";
import { positioning } from "@/content/home";

export default function Positioning() {
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
          {/* Манифест — «Зона ясного зрения» (этап 4): мир расфокусирован,
              резкость наводит пятно за курсором/тачем; прочитанная строка
              остаётся резкой. Деко-оправа секции — СОСЕД, вне clip-path. */}
          <div className="mt-8 font-serif text-display-lg font-light leading-[1.12]">
            <ClarityZone
              lines={[
                { node: positioning.lead, className: "text-graphite" },
                {
                  node: (
                    <>
                      {positioning.statementBefore}
                      <span className="text-brand">
                        {positioning.statementAccent}
                      </span>
                      {positioning.statementAfter}
                    </>
                  ),
                  className: "text-ink",
                },
              ]}
            />
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

import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  Reveal,
  RevealGroup,
  RevealItem,
  RevealLines,
} from "@/components/ui/reveal";
import { VisionSim } from "@/components/ui/vision-sim";
import { MotionFocus } from "@/components/ui/motion-focus";
import { AnimatedLink } from "@/components/ui/animated-link";
import { vision } from "@/content/home";
import { imageReveal } from "@/lib/motion";

/**
 * Секция «Зрение» — пара симуляторов на одной механике шторки.
 * 01 · Даль: близорукость на улице, 0…−6 дптр ступенями 0,5.
 * 02 · Близь: дальнозоркость на странице книги, 0…+3 дптр ступенями 0,25.
 * Линия делит кадр на мир «без коррекции» и «в очках»; общий
 * дисклеймер-воронка — один, внизу секции.
 */

/** Шапка подглавы: ярлык-индекс (стиль индексов услуг), заголовок, подводка. */
function SubHeader({
  index,
  heading,
  body,
}: {
  index: string;
  heading: string;
  body: string;
}) {
  return (
    <div className="mb-10 max-w-2xl sm:mb-12">
      <Reveal>
        <span className="font-sans text-sm tabular-nums text-graphite">
          {index}
        </span>
      </Reveal>
      <MotionFocus>
        <h3 className="mt-4 font-serif text-3xl font-light leading-[1.1] text-ink sm:text-4xl">
          <RevealLines text={heading} />
        </h3>
      </MotionFocus>
      <Reveal delay={0.1} className="mt-5 max-w-xl">
        <p className="text-base leading-relaxed text-graphite">{body}</p>
      </Reveal>
    </div>
  );
}

export default function Vision() {
  return (
    <Section id="vision" tone="paper">
      <Container>
        {/* ---- Шапка секции: общий заголовок пары ---- */}
        <div className="mb-14 max-w-2xl sm:mb-20">
          <Reveal>
            <Eyebrow>{vision.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={vision.heading} />
            </h2>
          </MotionFocus>
          <Reveal delay={0.1} className="mt-6 max-w-xl">
            <p className="text-base leading-relaxed text-graphite sm:text-lg">
              {vision.body}
            </p>
          </Reveal>
        </div>

        {/* ---- 01 · Даль: близорукость, улица ---- */}
        <SubHeader
          index={vision.far.index}
          heading={vision.far.heading}
          body={vision.far.body}
        />
        <RevealGroup>
          <RevealItem variants={imageReveal}>
            <VisionSim
              slot="street"
              photoAlt="Улица с платановой аллеей — мир в резкости, каким его видят в правильно подобранных очках"
              photoLabel="TODO: фото ташкентской улицы (резкое)"
              maxDiopters={6}
              step={0.5}
              signDisplay="minus"
              blurCoeff={0.013}
              depthMask
              nudge
              hint={vision.hint}
              labels={vision.labels}
              states={vision.far.states}
              startAtCenter
              ariaLabel="Сила близорукости в диоптриях"
            />
          </RevealItem>
        </RevealGroup>

        {/* ---- Волосяная линия-разделитель с воздухом ---- */}
        <div aria-hidden className="py-16 sm:py-24">
          <div className="h-px bg-line" />
        </div>

        {/* ---- 02 · Близь: дальнозоркость, страница книги ---- */}
        <SubHeader
          index={vision.near.index}
          heading={vision.near.heading}
          body={vision.near.body}
        />
        <RevealGroup>
          <RevealItem variants={imageReveal}>
            {/* Без depthMask (страница вся в ближней зоне — равномерное
                размытие честнее) и без nudge (два автодвижения в одной
                секции — шум). Старт по центру: +1,5. */}
            <VisionSim
              slot="book"
              photoAlt="Разворот книги с текстом — страница в резкости, какой её видят в правильно подобранных очках"
              maxDiopters={3}
              step={0.25}
              signDisplay="plus"
              blurCoeff={0.01}
              hint={vision.hint}
              labels={vision.labels}
              states={vision.near.states}
              startAtCenter
              ariaLabel="Сила дальнозоркости в диоптриях"
            />
          </RevealItem>
        </RevealGroup>

        {/* ---- Общий дисклеймер-воронка: один на пару, мост к записи ---- */}
        <p className="mx-auto mt-14 max-w-xl text-center text-xs leading-relaxed text-graphite sm:mt-16">
          {vision.disclaimer}{" "}
          <AnimatedLink href="#cta">{vision.disclaimerCta}</AnimatedLink>
        </p>
      </Container>
    </Section>
  );
}

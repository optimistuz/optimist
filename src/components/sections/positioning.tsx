import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import { PulseWord } from "@/components/ui/pulse-word";
import { positioning } from "@/content/home";

export default function Positioning() {
  return (
    <Section id="about">
      <Container>
        <div className="max-w-4xl">
          <Reveal>
            <Eyebrow>{positioning.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delay={0.05} className="mt-8">
            <p className="font-serif text-display-lg font-light leading-[1.12] text-ink">
              <span className="text-graphite">{positioning.lead} </span>
              {positioning.statementBefore}
              <PulseWord>{positioning.statementAccent}</PulseWord>
              {positioning.statementAfter}
            </p>
          </Reveal>
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

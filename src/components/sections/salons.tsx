import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  Reveal,
  RevealGroup,
  RevealItem,
  RevealLines,
} from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { Placeholder } from "@/components/ui/placeholder";
import { salons, salonsSection, site } from "@/content/home";
import { imageReveal } from "@/lib/motion";

/**
 * Секция «Салоны»: 4 филиала в стилистике списка услуг (волосяные
 * линии-разделители) + заглушка карты до решения владельца.
 */
export default function Salons() {
  return (
    <Section id="salons">
      <Container>
        <div className="mb-16 max-w-2xl sm:mb-20">
          <Reveal>
            <Eyebrow>{salonsSection.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={salonsSection.heading} />
            </h2>
          </MotionFocus>
        </div>

        <RevealGroup className="border-t border-line">
          {salons.map((salon) => (
            <RevealItem key={salon.address}>
              <div className="flex flex-col gap-2 border-b border-line py-7 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 sm:py-9">
                <div>
                  <h3 className="font-serif text-2xl text-ink">
                    {salon.address}
                  </h3>
                  <p className="mt-1.5 text-sm text-graphite">
                    {salon.district}
                    {salon.note ? ` · ${salon.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-sm leading-relaxed text-graphite sm:text-right">
                  <p>{site.hours.weekdays}</p>
                  <p>{site.hours.weekend}</p>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Карта появится после выбора сервиса владельцем */}
        <RevealGroup className="mt-12 sm:mt-16">
          <RevealItem variants={imageReveal}>
            <div className="aspect-[16/9] overflow-hidden rounded-2xl">
              <Placeholder label="TODO: карта — Яндекс или Google, решение владельца" />
            </div>
          </RevealItem>
        </RevealGroup>
      </Container>
    </Section>
  );
}

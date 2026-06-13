import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import { OpenStatusBadge } from "@/components/ui/open-status";
import BookingForm from "@/components/sections/booking-form";
import { ctaBlock, site } from "@/content/home";

const telHref = "tel:" + site.phonePrimary.replace(/[^\d+]/g, "");

export default function CTA() {
  return (
    <Section id="cta" tone="ink" className="overflow-hidden">
      <Container>
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
          {/* Слева — заголовок и текст */}
          <div>
            <Reveal>
              <Eyebrow onDark>{ctaBlock.eyebrow}</Eyebrow>
            </Reveal>
            <MotionFocus>
              <h2 className="mt-7 font-serif text-display-lg font-light leading-[1.02] text-paper">
                <RevealLines text={ctaBlock.heading} />
              </h2>
            </MotionFocus>
            <Reveal delay={0.1} className="mt-7 max-w-xl">
              <p className="text-base leading-relaxed text-paper/60 sm:text-lg">
                {ctaBlock.body}
              </p>
            </Reveal>
            <Reveal delay={0.15} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href={telHref}
                className="text-sm tracking-wide text-paper/70 transition-colors duration-300 hover:text-paper"
              >
                {site.phonePrimary}
              </a>
              {/* Живой статус «Открыто · до 20:00» — текстовый, тёмная тема (A2) */}
              <OpenStatusBadge onDark />
            </Reveal>

            {/* «Что вас ждёт» — снимаем тревогу перед визитом (A2).
                Волосок-маркер повторяет мотив eyebrow. */}
            <Reveal delay={0.2} className="mt-10">
              <ul className="space-y-3 border-t border-paper/15 pt-6">
                {ctaBlock.expect.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-paper/65"
                  >
                    <span
                      aria-hidden
                      className="mt-[0.6em] h-px w-4 shrink-0 bg-brand"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* Справа — форма записи (на мобильном — под текстом) */}
          <Reveal delay={0.1} className="lg:pt-2">
            <BookingForm />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
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
            <Reveal delay={0.15} className="mt-8">
              <a
                href={telHref}
                className="text-sm tracking-wide text-paper/70 transition-colors duration-300 hover:text-paper"
              >
                {site.phonePrimary}
              </a>
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

import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  Reveal,
  RevealGroup,
  RevealItem,
  RevealLines,
} from "@/components/ui/reveal";
import { CardParallax } from "@/components/ui/card-parallax";
import { MotionFocus } from "@/components/ui/motion-focus";
import { Photo } from "@/components/ui/photo";
import { collections } from "@/content/home";
import { imageReveal } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { PhotoSlot } from "@/content/photos";

// Асимметричная editorial-раскладка (не «три одинаковые карточки»)
const spans = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-12"];
const aspects = [
  "aspect-[4/3] lg:aspect-[16/10]",
  "aspect-[4/3] lg:aspect-[4/5]",
  "aspect-[4/3] lg:aspect-[21/8]",
];
// Фото-слоты и sizes — по раскладке 7/5/12 колонок
const slots: PhotoSlot[] = ["frames-optical", "frames-sun", "frames-premium"];
const sizes = [
  "(min-width:1280px) 730px, (min-width:1024px) 58vw, 100vw",
  "(min-width:1280px) 515px, (min-width:1024px) 42vw, 100vw",
  "(min-width:1280px) 1232px, 100vw",
];

export default function Collections() {
  return (
    <Section id="collections">
      <Container>
        <div className="mb-16 max-w-2xl sm:mb-20">
          <Reveal>
            <Eyebrow>{collections.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={collections.heading} />
            </h2>
          </MotionFocus>
        </div>

        {/* group/cards — контейнер Focus Cards: наведённая карточка остаётся
            резкой, соседи уходят в лёгкий расфокус (только hover-устройства) */}
        <RevealGroup className="group/cards grid grid-cols-1 gap-5 lg:grid-cols-12">
          {collections.items.map((c, i) => (
            <RevealItem
              key={c.title}
              variants={imageReveal}
              className={cn("min-w-0", spans[i])}
            >
              <a
                href={c.href}
                className="group block transition-[filter,opacity] duration-500 ease-soft group-hover/cards:[&:not(:hover)]:opacity-70 group-hover/cards:[&:not(:hover)]:blur-[3px]"
              >
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-2xl transition duration-500 ease-soft group-hover:-translate-y-1.5 group-hover:shadow-[0_32px_64px_-28px_rgba(13,13,13,0.28)] active:scale-[0.985]",
                    aspects[i]
                  )}
                >
                  {/* hover-scale и скролл-параллакс — на РАЗНЫХ слоях,
                      иначе конфликт transform */}
                  <div className="absolute inset-0 transition-transform duration-700 ease-soft group-hover:scale-105">
                    <CardParallax>
                      <Photo
                        slot={slots[i]}
                        alt={c.title}
                        label={c.label}
                        sizes={sizes[i]}
                      />
                    </CardParallax>
                  </div>
                  {/* Градиент усилен до from-ink/60: фото светлые, подписи
                      должны читаться поверх */}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/0 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-90" />
                  <div className="absolute bottom-0 left-0 p-6 sm:p-8">
                    <span className="text-xs uppercase tracking-[0.2em] text-paper/70">
                      {c.meta}
                    </span>
                    <h3 className="mt-1.5 font-serif text-2xl text-paper sm:text-3xl">
                      {c.title}
                    </h3>
                  </div>
                </div>
              </a>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}

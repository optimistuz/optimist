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
import { FocalPlane } from "@/components/ui/focal-plane";
import { MotionFocus } from "@/components/ui/motion-focus";
import { Photo } from "@/components/ui/photo";
import { FloatFrame } from "@/components/ui/float-frame";
import { LensLoupe } from "@/components/ui/lens-loupe";
import { collections } from "@/content/home";
import { imageReveal } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { PHOTOS, type PhotoSlot } from "@/content/photos";

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
    <Section id="collections" className="relative">
      {/* Деко-оправа (правое поле, ПОД навигацией «Шкала наводки» z-40):
          чёрная оптическая в верхнем-правом гутере, рядом с заголовком
          (max-w-2xl слева — правый верх свободен), выше сетки карточек.
          z-0 под контентом, только desktop. Переиспользует deco-1 с
          другим наклоном/масштабом. */}
      <FloatFrame
        slot="deco-1"
        rotate={6}
        parallaxSpeed={0.9}
        entrance="focus"
        focal="scroll"
        sectionTone="offwhite"
        sizes="12vw"
        widthClass="w-[12vw]"
        className="absolute right-[-2vw] top-[6%] z-0 hidden lg:block"
      />
      <Container className="relative z-10">
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

        {/* Подписной эффект блока — лупа-линза (LensLoupe): наведение на кадр
            даёт оптическую лупу. По правилу «один подписной на блок» прежний
            Focus Cards (расфокус соседей) снят. */}
        <RevealGroup className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {collections.items.map((c, i) => (
            <RevealItem
              key={c.title}
              variants={imageReveal}
              className={cn("min-w-0", spans[i])}
            >
              <a href={c.href} className="group block">
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
                      {/* Фокальная плоскость — свой слой внутри параллакса:
                          не hover-scale и не слой Focus Cards */}
                      <FocalPlane className="absolute inset-0">
                        <Photo
                          slot={slots[i]}
                          alt={c.title}
                          label={c.label}
                          sizes={sizes[i]}
                        />
                      </FocalPlane>
                    </CardParallax>
                  </div>
                  {/* Градиент усилен до from-ink/60: фото светлые, подписи
                      должны читаться поверх */}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/0 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-90" />
                  {/* Каталожный ярлычок — музейная нумерация экспоната,
                      на премиальном тёмном стекле */}
                  <span className="glass-dark glass-sheen absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-paper">
                    {c.catalog}
                  </span>
                  <div className="absolute bottom-0 left-0 p-6 sm:p-8">
                    <span className="text-xs uppercase tracking-[0.2em] text-paper/70">
                      {c.meta}
                    </span>
                    <h3 className="mt-1.5 font-serif text-2xl text-paper sm:text-3xl">
                      {c.title}
                    </h3>
                    {/* CTA подъезжает из-под кромки на hover;
                        на тач-устройствах виден статично */}
                    <span className="mt-2.5 block overflow-hidden">
                      <span className="flex translate-y-full items-center gap-2 text-xs uppercase tracking-[0.2em] text-paper transition-transform duration-300 ease-soft group-hover:translate-y-0 [@media(hover:none)]:translate-y-0">
                        {collections.cta}
                        <span aria-hidden>→</span>
                      </span>
                    </span>
                  </div>
                  {/* Лупа-линза — увеличивает кадр под курсором (desktop) */}
                  <LensLoupe src={PHOTOS[slots[i]]!} />
                </div>
              </a>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}

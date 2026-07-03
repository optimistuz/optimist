import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import BrandMarquee from "@/components/ui/brand-marquee";
import { brands, lenses } from "@/content/home";

export default function Brands() {
  const list = brands.items;
  const lensList = lenses.items;

  return (
    <section id="brands" className="border-y border-line py-24 sm:py-32 lg:py-40">
      <Container>
        <Reveal className="mb-12 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Eyebrow>{brands.eyebrow}</Eyebrow>
          <p className="max-w-sm font-serif text-xl font-light text-ink sm:text-right">
            {brands.heading}
          </p>
        </Reveal>
      </Container>

      {/* Живая лента логотипов: rAF-маркиза, ускоряется от скролла,
          тормозит при наведении, замирает вне экрана (BrandMarquee) */}
      <BrandMarquee items={list} />

      {/* Блок «Линзы» — отдельный от оправ (экспертиза подбора). */}
      <Container>
        <Reveal className="mb-12 mt-24 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Eyebrow>{lenses.eyebrow}</Eyebrow>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ink/60 sm:text-right">
            {lenses.body}
          </p>
        </Reveal>
      </Container>

      <BrandMarquee items={lensList} />
    </section>
  );
}

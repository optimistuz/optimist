import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
import BrandMarquee from "@/components/ui/brand-marquee";
import { brands } from "@/content/home";

export default function Brands() {
  const list = brands.items;

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
    </section>
  );
}

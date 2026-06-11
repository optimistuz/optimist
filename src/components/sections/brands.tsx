import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal } from "@/components/ui/reveal";
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

      {/* Бесконечная лента логотипов (замедляется при наведении) */}
      <div className="marquee-group relative overflow-x-clip">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-offwhite to-transparent sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-offwhite to-transparent sm:w-32" />
        <div className="flex w-max animate-marquee">
          {[...list, ...list].map((name, i) => (
            <span
              key={i}
              className="mx-10 whitespace-nowrap font-sans text-2xl font-medium uppercase tracking-wide text-ink/30 transition-colors duration-300 hover:text-ink sm:mx-14 sm:text-3xl"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

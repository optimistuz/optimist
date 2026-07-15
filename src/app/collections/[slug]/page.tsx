import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import {
  COLLECTIONS,
  framePhotoPath,
  widthStepLabel,
  type Collection,
} from "@/content/catalog/frame";
import { COLLECTION_CONTENT } from "@/content/catalog/collection-content";
import { publishedFrames } from "@/content/frames";
import { site } from "@/content/home";

/**
 * Листинг коллекции (этап 12а, шаги 1–2). SSG-скелет: маршрут, метаданные
 * и хром готовы, товар придёт отдельно.
 *
 * Набор коллекций ЗАКРЫТ (optical/sun/premium): предрендерим ровно три,
 * всё прочее — 404 (`dynamicParams = false`), а не тихий SSR выдуманного slug.
 *
 * Каталог пуст (frames.ts) и до кадров артикул не бывает `published` — листинг
 * сейчас всегда пуст, и это честное состояние, не заглушка-обманка. Сетка
 * карточек с ракурсами, фильтры и бейдж «ваша ширина» — следующие сессии 12а:
 * им нужны published-SKU и кадры конвейера этапа 10.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return COLLECTIONS.map((slug) => ({ slug }));
}

function isCollection(slug: string): slug is Collection {
  return (COLLECTIONS as readonly string[]).includes(slug);
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  if (!isCollection(params.slug)) return {};
  const c = COLLECTION_CONTENT[params.slug];
  const path = `/collections/${params.slug}`;
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: `${c.title} · ${site.name}`,
      description: c.description,
    },
  };
}

export default function CollectionPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!isCollection(params.slug)) notFound();
  const collection = params.slug;
  const c = COLLECTION_CONTENT[collection];
  const items = publishedFrames().filter((f) => f.collection === collection);

  return (
    <div className="bg-offwhite pb-32 pt-32 sm:pt-40">
      <Container>
        <Breadcrumb
          items={[
            { label: site.name, href: "/" },
            { label: "Коллекции" },
            { label: c.title },
          ]}
        />

        <header className="mt-10 max-w-2xl">
          {/* brand-deep, а не brand: #FD0000 — графика, мелкий текст берёт
              #D40000 ради контраста AA (CLAUDE.md, «Красный»). */}
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-deep">
            {c.eyebrow}
          </p>
          <h1 className="mt-6 font-serif text-3xl font-light leading-[1.05] text-ink sm:text-5xl">
            {c.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink/70">
            {c.description}
          </p>
        </header>

        {items.length === 0 ? (
          <EmptyCollection />
        ) : (
          <ul className="mt-16 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((f) => (
              <li key={f.id}>
                <a href={`/frames/${f.slug}`} className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-paper">
                    <Image
                      src={framePhotoPath(f.id, "front")}
                      alt={f.name}
                      fill
                      sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw"
                      className="object-contain transition-transform duration-500 ease-soft group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-4 font-serif text-lg text-ink">{f.name}</p>
                  <p className="mt-1 text-sm text-ink/50">
                    {f.brand} · {widthStepLabel(f.widthStep)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}

function EmptyCollection() {
  return (
    <div className="mt-20 border-t border-ink/10 pt-14">
      <p className="max-w-xl text-lg leading-relaxed text-ink/70">
        Карточки этой коллекции появятся здесь после съёмки. Оправы уже лежат
        на&nbsp;полках салонов — приезжайте примерить вживую или запишитесь
        на&nbsp;подбор.
      </p>
      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
        <a
          href="/#cta"
          className="inline-block border-b border-ink/20 pb-0.5 text-ink transition-colors hover:border-brand hover:text-brand"
        >
          Записаться на&nbsp;подбор
        </a>
        <a
          href="/#salons"
          className="inline-block border-b border-ink/20 pb-0.5 text-ink transition-colors hover:border-brand hover:text-brand"
        >
          Салоны и&nbsp;адреса
        </a>
      </div>
    </div>
  );
}

import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { AnimatedLink } from "@/components/ui/animated-link";
import { OpenStatusBadge } from "@/components/ui/open-status";
import { Reveal } from "@/components/ui/reveal";
import { footerNote, nav, salons, site, socials } from "@/content/home";

const telHref = (phone: string) => "tel:" + phone.replace(/[^\d+]/g, "");

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-offwhite">
      <Container className="py-16 sm:py-20">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          {/* Бренд: логотип — последний элемент сайта,
              который «наводится на резкость» */}
          <div className="md:col-span-4">
            <Reveal variant="focus">
              <Logo variant="full" className="h-12 sm:h-14" />
            </Reveal>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-graphite">
              {site.tagline}. Заботимся о вашем зрении с {site.since} года.
            </p>
          </div>

          {/* Салоны (якорь #salons переехал на одноимённую секцию) */}
          <div className="md:col-span-4">
            <h3 className="text-xs font-medium uppercase tracking-eyebrow text-graphite">
              Салоны
            </h3>
            <ul className="mt-6 space-y-4">
              {salons.map((s) => (
                <li key={s.address} className="text-sm leading-snug">
                  <span className="text-ink">{s.address}</span>
                  <span className="mt-0.5 block text-graphite">
                    {s.district}
                    {s.note ? ` · ${s.note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Контакты */}
          <address id="contacts" className="not-italic md:col-span-2">
            <h3 className="text-xs font-medium uppercase tracking-eyebrow text-graphite">
              Контакты
            </h3>
            <ul className="mt-6 space-y-3 text-sm">
              <li>
                <a
                  href={telHref(site.phonePrimary)}
                  className="text-ink transition-colors hover:text-brand-deep"
                >
                  {site.phonePrimary}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${site.email}`}
                  className="text-ink transition-colors hover:text-brand-deep"
                >
                  {site.email}
                </a>
              </li>
              <li className="pt-2 text-graphite">{site.hours.weekdays}</li>
              <li className="text-graphite">{site.hours.weekend}</li>
              <li className="pt-2">
                <OpenStatusBadge />
              </li>
            </ul>
          </address>

          {/* Навигация + соцсети */}
          <nav aria-label="Навигация в подвале" className="md:col-span-2">
            <h3 className="text-xs font-medium uppercase tracking-eyebrow text-graphite">
              Разделы
            </h3>
            <ul className="mt-6 space-y-3 text-sm">
              {nav.map((item) => (
                <li key={item.href}>
                  <AnimatedLink href={item.href}>{item.label}</AnimatedLink>
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-xs font-medium uppercase tracking-eyebrow text-graphite">
              Соцсети
            </h3>
            <ul className="mt-6 space-y-3 text-sm">
              {socials.map((s) => (
                <li key={s.label}>
                  <AnimatedLink href={s.href}>{s.label}</AnimatedLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-line pt-8 text-xs text-graphite sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} «Оптимист». Все права защищены.</p>
          {/* Политика, до которой нельзя дойти, не опубликована (этап 11, шаг 5).
              Обычный <a>, а НЕ next/link: до этого шага Link не было в бандле
              «/» ни разу, и один его импорт затащил бы роутер в критический
              путь — замерено +9 КБ при остатке бюджета 1 КБ. Юридическую
              страницу открывают раз в жизни; полная загрузка тут уместна. */}
          <a
            href="/privacy"
            className="text-graphite transition-colors hover:text-ink"
          >
            Политика конфиденциальности
          </a>
          <p>Ташкент, Узбекистан</p>
          {/* Lenis перехватывает якорь и плавно везёт к началу */}
          <AnimatedLink href="#hero" className="text-xs">
            Наверх ↑
          </AnimatedLink>
        </div>

        {/* Тихий подарок долиставшим до конца — проявляется focus-входом */}
        <Reveal variant="focus" className="mt-8">
          <p className="text-xs leading-relaxed text-graphite/80">
            {footerNote}
          </p>
        </Reveal>
      </Container>
    </footer>
  );
}

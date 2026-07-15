import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { privacy, privacyMeta } from "@/content/privacy";
import { faceFit } from "@/content/home";

export const metadata: Metadata = {
  title: privacyMeta.title,
  description: privacyMeta.description,
};

/**
 * Политика конфиденциальности (этап 11, шаг 5).
 *
 * Статическая страница без единого эффекта — и это осознанно: в тексте, где
 * человек ищет, что мы делаем с его лицом и телефоном, «наведение резкости»
 * выглядело бы как фокус, отвлекающий от мелкого шрифта. Дорого здесь —
 * это внятно.
 *
 * ⚠️ Обещания о камере НЕ ПЕРЕСКАЗАНЫ, а взяты из `faceFit.consent.points` —
 * тех самых строк, которые человек читает перед включением камеры. Один
 * источник: пересказ однажды разъехался бы с оригиналом молча.
 *
 * Маршрут не «/», поэтому «Шкала наводки» здесь не рендерится, а якоря шапки
 * ведут на главную («/#salons») — см. header.tsx / section-rail.tsx.
 */
export default function PrivacyPage() {
  return (
    /* <div>, а НЕ <main>: единственный <main id="main"> живёт в layout.tsx,
       и второй ломал бы скип-линк «К содержанию» и разметку для скринридера
       (поймал `fizik` — в живом DOM было два <main>). */
    <div className="bg-offwhite pb-32 pt-36 sm:pt-44">
      <Container className="max-w-3xl">
        {/* brand-deep, а не brand: #FD0000 — это графика (линии, крупный
            акцент); мелкий текст берёт #D40000, иначе контраст ниже AA
            (CLAUDE.md, «Красный»). */}
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-deep">
          {privacy.eyebrow}
        </p>

        <h1 className="mt-6 whitespace-pre-line font-display text-4xl leading-[1.1] text-ink sm:text-5xl">
          {privacy.heading}
        </h1>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.15em] text-ink/40">
          {privacy.updated}
        </p>

        <p className="mt-10 text-lg leading-relaxed text-ink/80">{privacy.intro}</p>

        <div className="mt-16 space-y-16">
          {privacy.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28">
              {/* Волосяная линия — разделитель по умолчанию (CLAUDE.md) */}
              <div className="h-px w-full bg-ink/10" />

              <h2 className="mt-8 font-display text-2xl leading-tight text-ink sm:text-3xl">
                {section.title}
              </h2>

              <div className="mt-5 space-y-5 leading-relaxed text-ink/75">
                {section.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>

              {/* Дословные обещания consent-экрана — один источник, не пересказ */}
              {"promisesFromConsent" in section && section.promisesFromConsent ? (
                <ul className="mt-6 space-y-3 border-l border-brand/30 pl-6">
                  {faceFit.consent.points.map((point) => (
                    <li key={point} className="text-ink/85">
                      {point}
                    </li>
                  ))}
                </ul>
              ) : null}

              {"after" in section && Array.isArray(section.after) ? (
                <div className="mt-6 space-y-5 leading-relaxed text-ink/75">
                  {section.after.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              ) : null}
            </section>
          ))}

          <section className="scroll-mt-28">
            <div className="h-px w-full bg-ink/10" />
            <h2 className="mt-8 font-display text-2xl leading-tight text-ink sm:text-3xl">
              {privacy.contact.title}
            </h2>
            <p className="mt-5 leading-relaxed text-ink/75">{privacy.contact.body}</p>
            {/* Обычный <a>: next/link в этом проекте не используется нигде —
                он тянет роутер в бандл (см. footer.tsx). */}
            <a
              href="/#salons"
              className="mt-8 inline-block border-b border-ink/20 pb-0.5 text-ink transition-colors hover:border-brand hover:text-brand"
            >
              Телефоны и адреса салонов
            </a>
          </section>
        </div>
      </Container>
    </div>
  );
}

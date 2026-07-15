import type { Metadata, Viewport } from "next";
import { Literata, Manrope } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/smooth-scroll";
import { IntroProvider } from "@/components/ui/intro";
import Header from "@/components/layout/header";
import SectionRail from "@/components/layout/section-rail";
import Footer from "@/components/layout/footer";
import { salons, site } from "@/content/home";

// Дисплейный шрифт заголовков — вариативный editorial-серив с осью opsz и
// кириллицей: носитель эффекта «наведения» заголовков (B1, оси opsz + wght).
const literata = Literata({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-literata",
  axes: ["opsz"],
});

// Текст — чистый геометрический гротеск (полная кириллица)
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["300", "400", "500", "600", "700"],
});

const description =
  "Премиальная сеть салонов оптики «Оптимист» в Ташкенте. Диагностика зрения, авторский подбор оправ и линзы ведущих европейских производителей. С 2006 года.";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Оптимист — Салоны оптики в Ташкенте",
    template: "%s · Оптимист",
  },
  description,
  keywords: [
    "оптика Ташкент",
    "очки Ташкент",
    "проверка зрения",
    "оправы",
    "контактные линзы",
    "Оптимист",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    siteName: "Оптимист",
    title: "Оптимист — Салоны оптики в Ташкенте",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Оптимист — Салоны оптики в Ташкенте",
    description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#F6F4EF",
};

// Структурированные данные для поисковиков (schema.org/Optician):
// головной офис — основной address, остальные филиалы — department.
const addressOf = (salon: (typeof salons)[number]) => ({
  "@type": "PostalAddress",
  streetAddress: salon.address,
  addressLocality: "Ташкент",
  addressCountry: "UZ",
});

// Часы единые во всех салонах: ежедневно 10:00–19:00.
const openingHours = {
  "@type": "OpeningHoursSpecification",
  dayOfWeek: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  opens: "10:00",
  closes: "19:00",
};
// Каждый салон — со своим телефоном, координатами и часами.
const branchOf = (salon: (typeof salons)[number]) => ({
  "@type": "Optician",
  name: `${site.name} — ${salon.district}`,
  address: addressOf(salon),
  telephone: salon.phone,
  geo: {
    "@type": "GeoCoordinates",
    latitude: salon.lat,
    longitude: salon.lng,
  },
  openingHoursSpecification: openingHours,
});
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Optician",
  name: site.name,
  url: site.url,
  telephone: site.phonePrimary,
  email: site.email,
  address: addressOf(salons[0]),
  geo: {
    "@type": "GeoCoordinates",
    latitude: salons[0].lat,
    longitude: salons[0].lng,
  },
  openingHoursSpecification: openingHours,
  department: salons.slice(1).map(branchOf),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${literata.variable} ${manrope.variable}`}
    >
      <body className="font-sans antialiased">
        {/* Skip-link: первый фокусируемый элемент, проявляется плашкой */}
        <a
          href="#main"
          className="sr-only rounded-[4px] bg-ink px-5 py-3 text-sm font-medium text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-offwhite"
        >
          К содержанию
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <IntroProvider>
          <SmoothScroll>
            <Header />
            {/* «Шкала наводки» — сквозная навигация поверх сайта; как и
                шапка, живёт вне page-shell (не сжимается за мобильным меню).
                Рендерится только на «/»; на маршрутах витрины её сменяет
                CatalogNav — она смонтирована в collections/layout.tsx, чтобы
                не тяжелить критический путь «/» (см. тот файл). */}
            <SectionRail />
            {/* page-shell слегка сжимается за открытым мобильным меню
                (фокус-идиома); шапка и оверлеи остаются снаружи */}
            <div className="page-shell">
              <main id="main" tabIndex={-1} className="outline-none">
                {children}
              </main>
              <Footer />
            </div>
          </SmoothScroll>
        </IntroProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Manrope, Prata } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import SmoothScroll from "@/components/smooth-scroll";
import { IntroProvider } from "@/components/ui/intro";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { salons, site } from "@/content/home";

// Dev-переключатель шрифтов: условный dynamic-импорт, чтобы код компонента
// вообще не попадал в production-бандл (мёртвая ветка выбрасывается сборкой)
const FontSwitcher =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("@/components/ui/font-switcher"))
    : null;

// Заголовки — элегантный серив (полная кириллица)
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-cormorant",
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

// Кандидаты на дисплейный шрифт — на время выбора владельцем.
// После решения лишние шрифты и dev-переключатель удалить.
const prata = Prata({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-prata",
  weight: "400",
});

const jost = Jost({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-jost",
  weight: ["300", "400", "500"],
});

// Текст — чистый геометрический гротеск (полная кириллица)
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["300", "400", "500", "600", "700"],
});

const description =
  "Премиальная сеть салонов оптики «Оптимист» в Ташкенте. Диагностика зрения, авторский подбор оправ и линзы ведущих европейских производителей. С 2008 года.";

export const metadata: Metadata = {
  metadataBase: new URL("https://optimist-optics.uz"),
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

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Optician",
  name: site.name,
  url: "https://optimist-optics.uz",
  telephone: [site.phonePrimary, site.phoneSecondary],
  email: site.email,
  address: addressOf(salons[0]),
  department: salons.slice(1).map((salon) => ({
    "@type": "Optician",
    name: `${site.name} — ${salon.district}`,
    address: addressOf(salon),
  })),
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      opens: "09:00",
      closes: "20:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "10:00",
      closes: "18:00",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${cormorant.variable} ${prata.variable} ${jost.variable} ${manrope.variable}`}
    >
      <body className="font-sans antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <IntroProvider>
          <SmoothScroll>
            <Header />
            <main>{children}</main>
            <Footer />
          </SmoothScroll>
        </IntroProvider>
        {/* Dev-инструмент выбора дисплейного шрифта; в prod-сборку не попадает */}
        {FontSwitcher && <FontSwitcher />}
      </body>
    </html>
  );
}

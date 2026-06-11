import type { Config } from "tailwindcss";

const config: Config = {
  // hover-стили применяются только на устройствах с настоящим наведением —
  // «липкие» ховеры на тачах исчезают глобально
  future: { hoverOnlyWhenSupported: true },
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Фирменная палитра «Оптимист»
        paper: "#FFFFFF", // чистый белый — контраст / карточки
        offwhite: "#F6F4EF", // тёплый off-white — основной фон
        ink: "#0D0D0D", // почти-чёрный — текст
        graphite: "#6F6B64", // тёплый серый — вторичный текст
        line: "#E4DFD6", // тёплая волосяная линия — границы
        brand: {
          DEFAULT: "#FD0000", // графика: линии, eyebrow, крупный дисплейный акцент
          deep: "#D40000", // заливки кнопок, мелкий красный текст (AA ≥ 4.5)
          dark: "#B80000", // hover заливок
        },
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Крупная editorial-шкала, плавно адаптивная через clamp()
        "display-xl": [
          "clamp(3rem, 8.5vw, 8rem)",
          { lineHeight: "0.95", letterSpacing: "-0.02em" },
        ],
        "display-lg": [
          "clamp(2.5rem, 6vw, 5.25rem)",
          { lineHeight: "1.0", letterSpacing: "-0.015em" },
        ],
        "display-md": [
          "clamp(2rem, 4.5vw, 3.75rem)",
          { lineHeight: "1.05", letterSpacing: "-0.01em" },
        ],
      },
      maxWidth: {
        shell: "1280px",
      },
      letterSpacing: {
        eyebrow: "0.28em",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;

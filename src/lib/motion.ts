import type { Variants } from "motion/react";

/**
 * Единые токены анимации — чтобы всё движение на сайте было консистентным.
 * Базовый easing мягкий (editorial «ease-out»), длительности 0.3–0.9s.
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const DURATION = {
  fast: 0.3, // hover / микро-взаимодействия
  base: 0.6,
  slow: 0.9, // крупные появления
} as const;

/** Общая настройка зоны видимости для whileInView. */
export const VIEWPORT = { once: true, margin: "-80px" } as const;

/** Появление снизу с прозрачностью — основной приём. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.slow, ease: EASE },
  },
};

/** Родитель для «ступенчатого» (stagger) появления групп. */
export const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

/* ------------------------------------------------------------------
   Словарь «Наведение резкости» — ровно три глагола (см. CLAUDE.md).
   blur ≤ 8px, только на текстовых блоках, никогда на изображениях.
   ------------------------------------------------------------------ */

/** Текст: проявляется из лёгкого расфокуса в резкость. */
export const focusIn: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: DURATION.slow, ease: EASE },
  },
};

/**
 * Заголовки: строка выезжает из-под маски (родитель — overflow-hidden).
 * Доп. ось «наведения резкости» (B1): оптический размер доводится 20 → 72 —
 * вариативная Literata (ось opsz) оптически «резкостится» по мере оседания.
 * Шрифты без оси opsz игнорируют font-variation-settings — без вреда.
 */
export const maskLineChild: Variants = {
  // --opsz анимируем числом (motion интерполирует CSS-переменную надёжно;
  // сам fontVariationSettings motion не анимирует). Строка читает его через
  // style: font-variation-settings: "opsz" var(--opsz).
  hidden: { y: "110%", "--opsz": 20 },
  visible: {
    y: "0%",
    "--opsz": 72,
    transition: { duration: 0.9, ease: EASE },
  },
} as Variants;

/** Изображения: scale + opacity, БЕЗ blur (цена фильтра на мобильном GPU). */
export const imageReveal: Variants = {
  hidden: { opacity: 0, scale: 1.06 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.slow, ease: EASE },
  },
};

/**
 * imageReveal ДЛЯ КАРТОЧЕК (не полноэкранных кадров): к scale+opacity добавлен
 * лёгкий расфокус blur 4→0 — карточка «наводится на резкость», как текст.
 * Это ЖЕСТ ПОЯВЛЕНИЯ (≤8px по §3), поэтому blur на изображении здесь законен.
 * НЕ применять к полноэкранным фото (Atmosphere остаётся на imageReveal):
 * там живой фильтр запрещён — тяжёлый расфокус берётся запеканием/камерой.
 * Один владелец filter на узел (закон №1): фильтр висит на motion-обёртке
 * RevealItem — это ОТДЕЛЬНЫЙ узел от FocalPlane (у той свой filter внутри).
 */
export const imageRevealBlur: Variants = {
  hidden: { opacity: 0, scale: 1.06, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: DURATION.slow, ease: EASE },
  },
};

/**
 * Hero-фото: ЕДИНСТВЕННОЕ исключение из правила «blur не на изображениях» —
 * одноразовое появление с наведением на резкость (выражение концепции,
 * не скролл-эффект и не цикл). См. CLAUDE.md, «Хореография, волна 2».
 */
export const heroFocus: Variants = {
  hidden: { opacity: 0, scale: 1.05, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: DURATION.slow, ease: EASE },
  },
};

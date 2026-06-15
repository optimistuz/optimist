/**
 * Карта временных фотографий сайта.
 *
 * Источник — Pexels (лицензия Pexels: бесплатно, включая коммерческое
 * использование, атрибуция не обязательна). Все фото ВРЕМЕННЫЕ и будут
 * заменены собственной съёмкой салонов — это вопрос бренда.
 *
 * null — слот пуст: компонент <Photo> отрисует Placeholder,
 * а секции, которым фото обязательно, не рендерятся вовсе.
 */

export type PhotoSlot =
  | "street"
  | "book"
  | "hero"
  | "hero-float"
  | "deco-1"
  | "deco-2"
  | "deco-3"
  | "frames-optical"
  | "frames-sun"
  | "frames-premium"
  | "interior";

/**
 * Интринсик-размеры кадров «парящей» техники (mix-blend-mode: multiply).
 * FloatFrame рендерит next/image с явными width/height (НЕ fill) —
 * пропорция обязана быть известна до загрузки, чтобы не было сдвигов
 * макета и чтобы изолированная коробка совпала с кадром пиксель в пиксель.
 */
export const FLOAT_INTRINSIC: Partial<
  Record<PhotoSlot, { width: number; height: number }>
> = {
  "hero-float": { width: 2400, height: 1600 },
  "deco-1": { width: 1600, height: 1066 },
  "deco-2": { width: 1600, height: 1067 },
  "deco-3": { width: 1600, height: 1066 },
};

export const PHOTOS: Record<PhotoSlot, string | null> = {
  // Платановая аллея с уходящей перспективой.
  // Фото: Timo Volz — https://www.pexels.com/photo/trees-along-the-road-with-a-double-yellow-line-16915863/
  street: "/photos/street.jpg",

  // Разворот винтажной книги с основным текстом, резкость по всей странице.
  // Кадрировано до границ книги (шторка делит кадр — фон убран).
  // Фото: Jess Bailey Designs — https://www.pexels.com/photo/open-textbook-762687/
  book: "/photos/book.jpg",

  // Одна оправа-клабмастер крупным планом на чисто белом фоне.
  // Запас: в hero заменена «парящей» оправой (hero-float), слот сохранён.
  // Фото: Stephen Niemeier — https://www.pexels.com/photo/black-framed-clubmaster-style-eyeglasses-131018/
  hero: "/photos/hero.jpg",

  // «Парящая» оправа hero: чёрный фронт, белые дужки, вид 3/4, жёсткая
  // живая тень. Для mix-blend-mode: multiply — фон доведён до честного
  // (255,255,255). Нормализовано scripts/normalize-white.ps1:
  // кроп 6% по краям, gain R/G/B = 1.0699 / 1.0566 / 1.0356.
  // Фото: Daniel Balarezo — https://www.pexels.com/photo/sunglasses-on-a-white-surface-11199907/
  "hero-float": "/photos/hero-float.jpg",

  // Деко-точка А («Салоны», левое поле): чёрная прямоугольная оптическая
  // оправа анфас-3/4, глянцевый ацетат. Нормализовано scripts/normalize-white.ps1:
  // gain R/G/B = 1.0581 / 1.0581 / 1.0669, рамка доведена до (255,255,255).
  // Фото: Márcio Carvalho — https://www.pexels.com/photo/black-eyeglasses-on-white-background-25389281/
  "deco-1": "/photos/deco-1.jpg",

  // Деко-точка Б («Экспертиза», у таблицы Сивцева): пара восьмиугольных
  // оправ, чёрный ацетат + золотой металл, сине-градиентные линзы.
  // Нормализовано: gain R/G/B = 1.0759 / 1.0759 / 1.0479.
  // Фото: Volker Meyer — https://www.pexels.com/photo/close-up-shot-of-sunglasses-on-a-white-surface-6837219/
  "deco-2": "/photos/deco-2.jpg",

  // Деко-точка В («Позиционирование», правое поле): матовая чёрная оправа-
  // щиток (flat-top), вид 3/4, графичный силуэт без бликов. Нормализовано:
  // gain R/G/B = 1.0475 / 1.0537 / 1.0278, рамка доведена до (255,255,255).
  // Фото: Márcio Carvalho — https://www.pexels.com/photo/close-up-on-elegant-black-sunglasses-against-white-background-25389285/
  "deco-3": "/photos/deco-3.jpg",

  // Чёрная ацетатная оправа анфас крупным планом + черепаховая, светлый фон.
  // Фото: GlassesShop GS — https://www.pexels.com/photo/urban-chic-trendy-frames-for-everyday-look-28211037/
  "frames-optical": "/photos/frames-optical.jpg",

  // Черепаховые солнцезащитные крупным планом, солнечный контровой свет.
  // Фото: Justin Luck — https://www.pexels.com/photo/close-up-shot-of-a-pair-of-sunglasses-11882776/
  "frames-sun": "/photos/frames-sun.jpg",

  // Оправа розового золота на шёлке цвета шампань.
  // Фото: Laura Chouette — https://www.pexels.com/photo/sunglasses-on-fabric-21547041/
  "frames-premium": "/photos/frames-premium.jpg",

  // Тёплая стена с оправами в салоне оптики, мягкий расфокус.
  // Фото: Karolina Grabowska (kaboompics) — https://www.pexels.com/photo/eyeglasses-on-display-5201991/
  interior: "/photos/interior.jpg",
};

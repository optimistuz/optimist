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
  | "frames-optical"
  | "frames-sun"
  | "frames-premium"
  | "interior";

export const PHOTOS: Record<PhotoSlot, string | null> = {
  // Платановая аллея с уходящей перспективой.
  // Фото: Timo Volz — https://www.pexels.com/photo/trees-along-the-road-with-a-double-yellow-line-16915863/
  street: "/photos/street.jpg",

  // Разворот винтажной книги с основным текстом, резкость по всей странице.
  // Кадрировано до границ книги (шторка делит кадр — фон убран).
  // Фото: Jess Bailey Designs — https://www.pexels.com/photo/open-textbook-762687/
  book: "/photos/book.jpg",

  // Одна оправа-клабмастер крупным планом на чисто белом фоне.
  // Фото: Stephen Niemeier — https://www.pexels.com/photo/black-framed-clubmaster-style-eyeglasses-131018/
  hero: "/photos/hero.jpg",

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

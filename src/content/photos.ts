/**
 * Карта временных фотографий сайта.
 *
 * ⚠️ ИСТОЧНИКИ РАЗНЫЕ — этот файл НИКОГДА не лжёт об источнике и авторе кадра.
 *
 * 1. Интерьеры, улица, книга, каталожные подборки — Pexels (лицензия Pexels:
 *    бесплатно, включая коммерческое использование, атрибуция не обязательна).
 * 2. Кадры «парящей» техники (hero-float, deco-1/2/3) — КАТАЛОЖНЫЕ СНИМКИ
 *    ПРОИЗВОДИТЕЛЕЙ (Safilo, Emporio Armani, Pierre Cardin). Права у брендов.
 *    Владелец подтвердил (июль 2026), что письменное разрешение получено;
 *    реквизиты документа — реестр `docs/photo-permissions.md` (ПОЛЯ НА
 *    ЗАПОЛНЕНИИ: документ, срок, объём прав — включая право на модификацию,
 *    т. к. кадры прогнаны через normalize-white).
 *    Эти оправы — чужой мерч: они декоративны (FloatFrame: aria-hidden,
 *    pointer-events-none) и НЕ КЛИКАБЕЛЬНЫ, shoppable-ярлыки на них
 *    не вешаются никогда. Заменяются собственной съёмкой на этапе 10.
 *
 * Все фото ВРЕМЕННЫЕ и будут заменены собственной съёмкой салонов.
 *
 * null — слот пуст: компонент <Photo> отрисует Placeholder,
 * а секции, которым фото обязательно, не рендерятся вовсе.
 *
 * ---------------------------------------------------------------------
 * ПРОИЗВОДНЫЕ АССЕТЫ (запечены на билд-машине из кадров этой карты;
 * слотами НЕ являются — их запрашивают по прямому пути те секции,
 * которым нужен именно запечённый слой). Права и автор — те же, что
 * у исходника; строка здесь нужна, чтобы файл в `public/` не остался
 * без происхождения.
 *
 *   /photos/interior-blur.jpg    ← interior.jpg
 *     `node scripts/bake-blur.mjs blur public/photos/interior.jpg`
 *     (гаусс σ = 24, q70). Ambient bokeh под резким кадром «Атмосферы»
 *     (этап 3): настоящая ГРИП вместо живого фильтра.
 *
 *   /photos/street-highlights.jpg ← street.jpg
 *     `node scripts/bake-blur.mjs highlights public/photos/street.jpg --sigma=24`
 *     (порог яркости 0,78 · разлив σ = 24 · q80). Слой ХАЛЯЦИИ СВЕТОВ
 *     симулятора близорукости (этап 6, шаг 7): света выше порога
 *     сохранены, остальное — чёрное (чёрное под `mix-blend-mode: screen`
 *     прозрачно). Живого blur такого радиуса не существует — закон
 *     движка №2.
 *     ⚠️ σ = 24 — НЕ ДЕФОЛТ СКРИПТА (40) и не подбор на глаз: это тот же
 *     радиус, каким расфокус размывает ЭТОТ кадр на −6 дптр. Расфокус
 *     считается как blurCoeff 0,013 × ширина кадра = 15,4 CSS px, а кадр
 *     вписан в контейнер с масштабом 1184/1880 = 0,63 — значит 15,4 CSS px
 *     это 24 px в масштабе исходника. Разлив шире самой дефокусировки
 *     размазывал бы тот же свет тоньше, чем его размазывает сам дефект.
 *     ⚠️ АМПЛИТУДА ЭФФЕКТА ЖИВЁТ ЗДЕСЬ (порог + σ), а не в коде: у слоя
 *     нет множителя прозрачности, она равна силе дефекта один к одному
 *     (см. `vision-sim-types.ts`). Крутить силу халяции = перепекать слой
 *     этой командой, а не править константу.
 *     Пиксельная приёмка слоя — `node scripts/probe-halation.mjs`.
 * ---------------------------------------------------------------------
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

  // «Парящая» оправа hero: черепаховый (havana) ацетат, дужки сложены, вид
  // сверху; на линзе фирменные наклейки.
  // ⚠️ СЛОТ НЕ ИСПОЛЬЗУЕТСЯ: hero перешёл на FocusPortrait (78bc09e), ни один
  // FloatFrame его не запрашивает. Файл остаётся в public/ и отдаётся по прямой
  // ссылке — поэтому строка в docs/photo-permissions.md для него обязательна.
  // Для mix-blend-mode: multiply — фон доведён до честного (255,255,255).
  // Нормализовано scripts/normalize-white.ps1:
  // кроп 6% по краям, gain R/G/B = 1.0699 / 1.0566 / 1.0356.
  // Кадр: каталожный снимок SEVENTH STREET by Safilo. Права — Safilo Group.
  // Владелец подтвердил письменное разрешение (docs/photo-permissions.md,
  // реквизиты на заполнении). НЕ Pexels.
  "hero-float": "/photos/hero-float.jpg",

  // Деко-точка А («Салоны», левое поле): черепаховая ацетатная оптическая
  // оправа, вид 3/4, наклейки «SEVENTH STREET by Safilo» и «ACETATE FRONT» на
  // линзах. Нормализовано scripts/normalize-white.ps1:
  // gain R/G/B = 1.0581 / 1.0581 / 1.0669, рамка доведена до (255,255,255).
  // Кадр: каталожный снимок SEVENTH STREET by Safilo. Права — Safilo Group.
  // Владелец подтвердил письменное разрешение (docs/photo-permissions.md,
  // реквизиты на заполнении). НЕ Pexels.
  "deco-1": "/photos/deco-1.jpg",

  // Деко-точка Б («Экспертиза», у таблицы Сивцева): солнцезащитная оправа-
  // навигатор, черепаховый ацетат + золотой металл, коричневые линзы, логотип-
  // орёл на дужке. Нормализовано: gain R/G/B = 1.0759 / 1.0759 / 1.0479.
  // Кадр: каталожный снимок EMPORIO ARMANI. Права — правообладатель бренда,
  // публикация по письменному разрешению (docs/photo-permissions.md). НЕ Pexels.
  "deco-2": "/photos/deco-2.jpg",

  // Деко-точка В («Позиционирование», правое поле): чёрная глянцевая
  // прямоугольная оптическая оправа, вид 3/4, наклейки «XL» и «ACETATE FRONT».
  // Нормализовано: gain R/G/B = 1.0475 / 1.0537 / 1.0278, рамка → (255,255,255).
  // Кадр: каталожный снимок PIERRE CARDIN PARIS. Права — правообладатель бренда,
  // публикация по письменному разрешению (docs/photo-permissions.md). НЕ Pexels.
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

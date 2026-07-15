/**
 * Тело товара: словарь, миллиметры, ступени ширины, пути к кадрам.
 *
 * ⚠️ ЭТОТ МОДУЛЬ НЕ ЗНАЕТ ПРО ZOD — и это не случайность, а бюджет.
 * Витрина (карточки, фильтры, PDP) импортирует помощники ОТСЮДА, поэтому
 * в клиентский бандл не уезжает ни байта валидатора: zod живёт в
 * `schema.ts`, который читают только сборка и `validate-catalog.mjs`.
 * Импортируете `framePhotoPath` из `schema.ts` — тащите zod на телефон.
 *
 * Схема (`schema.ts`) строится ПОВЕРХ этих констант, а тип `Frame`
 * выводится из схемы. Один источник правды, две стороны: здесь — то, что
 * нужно в рантайме, там — то, что нужно гейту.
 */

/** Силуэты оправ — те же восемь, что знает подбор (`src/lib/fit-recommend.ts`). */
export const FRAME_KINDS = [
  "round",
  "oval",
  "rectangle",
  "square",
  "clubmaster",
  "aviator",
  "catEye",
  "geometric",
] as const;

/** Формы лица — те же шесть, что знает классификатор (`src/lib/face-shape.ts`). */
export const FACE_SHAPES = ["oval", "round", "square", "long", "heart", "diamond"] as const;

/**
 * Салоны. `id` — ключ наличия и маршрутизации резерва (этап 13): по нему
 * заявка уходит в тот салон, где оправа физически лежит.
 */
export const SALON_IDS = ["shastri", "yunusabad", "osiyo"] as const;
export type SalonId = (typeof SALON_IDS)[number];

/**
 * Жизненный цикл артикула. Различие несёт фотографический и правовой смысл,
 * а не косметический:
 *
 * - `draft` — тело товара уже машиночитаемо (мм, материал, цвета), но СВОИХ
 *   кадров ещё нет: студия впереди. Черновик живёт в данных, проходит
 *   мм-санити — и НЕ РЕНДЕРИТСЯ нигде. Так каталог наполняется настоящими
 *   артикулами, не дожидаясь фотографа, и ни одна карточка не выходит
 *   к клиенту без собственного кадра.
 * - `published` — есть свои кадры, прошедшие приёмку `ingest-frames.mjs`.
 *   Валидатор ТРЕБУЕТ файлы на диске.
 * - `archived` — снят с продажи: в листингах нет, прямая ссылка жива
 *   (SEO и чужие закладки не ломаем).
 *
 * Чужие каталожные кадры брендов (Safilo/Armani/Pierre Cardin) не делают
 * артикул `published` НИКОГДА: они декоративны и не кликабельны (CLAUDE.md).
 */
export const FRAME_STATUSES = ["draft", "published", "archived"] as const;

/**
 * Коллекции и направления — ЗАКРЫТЫЕ словари, и живут они ЗДЕСЬ, а не в схеме.
 * Причина та же, что у всего файла: `/collections` импортирует список, и если
 * бы он лежал в `schema.ts`, витрина утащила бы zod в бандл телефона.
 *
 * `DIRECTIONS` закрыт намеренно: свободная строка расползается («город» /
 * «Город» / «городской») и рассыпается в три разных фильтра, каждый с одной
 * оправой.
 */
export const COLLECTIONS = ["optical", "sun", "premium"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const DIRECTIONS = [
  "город",
  "работа",
  "вождение",
  "спорт",
  "вечер",
  "чтение",
  "дети",
] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * Миллиметры. Диапазоны — закон CLAUDE.md («Витрина» п. 2): за ними лежит
 * не «редкая оправа», а опечатка в таблице — 70 мм по линзе это не оправа,
 * это ошибка ввода.
 *
 * ⚠️ `totalWidth` тоже обязан иметь границы. Без них `totalWidth: 13`
 * (опечатка в «138») проходил гейт с честной ступенью 1, и бейдж «ваша
 * ширина» — тот самый, который мы публикуем как ГЕОМЕТРИЮ, не требующую
 * подписи врача, — начинал врать о геометрии (поймал `revizor-vitriny`).
 */
export const MM = {
  lens: { min: 40, max: 62 },
  bridge: { min: 14, max: 24 },
  temple: { min: 120, max: 155 },
  /**
   * ⚠️ Нижний край — 100, а не 115. При 115 честная ДЕТСКАЯ оправа
   * (линза 45, переносица 16, ширина 112 мм) отбраковывалась, а сочетание
   * 40+14 было невыразимо в принципе: `totalWidthBounds` давал окно 94–114,
   * и оно целиком лежало ниже минимума — пустое пересечение (поймал
   * `revizor-vitriny`). «Дети» — легальное направление словаря, и оператор,
   * заводящий детскую оправу с полки, был бы вынужден ПРИПИСАТЬ ей
   * миллиметры: соврать в тех самых данных, которые мы публикуем как
   * геометрию, не требующую подписи врача.
   */
  totalWidth: { min: 100, max: 155 },
} as const;

/**
 * Общая ширина обязана сходиться с геометрией оправы: две линзы плюс
 * переносица — это её костяк, а рамка и шарниры добавляют сверху немного.
 * Оправа с `lens 62 + bridge 24` и `totalWidth 128` физически не существует;
 * до этой сверки такая строка проходила гейт.
 */
export function totalWidthBounds(lens: number, bridge: number) {
  const core = 2 * lens + bridge;
  return { min: core, max: core + 20 };
}

/**
 * Ступени ширины — человеческая шкала вместо миллиметров. Считается из
 * `totalWidth` РОВНО ЗДЕСЬ и один раз: дубль этой лестницы в UI неизбежно
 * разъедется с данными (ровно так разошлась ширина кадра в этапе 10).
 *
 * ⚠️ Это ГЕОМЕТРИЯ, а не обещание посадки. Бейдж констатирует размер
 * («ваша ширина») и публикуется сразу, подписи оптометриста не ждёт
 * (CLAUDE.md, «Витрина» п. 6). Обещания посадки живут в `fitsFaces` —
 * они молчат до подписи врача (`docs/optometrist-review.md`).
 */
export const WIDTH_STEPS = [
  { step: 1, max: 128, label: "заметно уже среднего" },
  { step: 2, max: 134, label: "уже среднего" },
  { step: 3, max: 140, label: "средняя ширина" },
  { step: 4, max: 146, label: "шире среднего" },
  { step: 5, max: Number.POSITIVE_INFINITY, label: "заметно шире среднего" },
] as const;

export type WidthStep = 1 | 2 | 3 | 4 | 5;

/** Единственный способ получить ступень. Валидатор сверяет данные с ним. */
export function widthStepFor(totalWidth: number): WidthStep {
  const found = WIDTH_STEPS.find((s) => totalWidth <= s.max);
  return (found?.step ?? 5) as WidthStep;
}

export function widthStepLabel(step: WidthStep): string {
  return WIDTH_STEPS.find((s) => s.step === step)?.label ?? "";
}

/** Семь кадров пакшота, уходящих в веб (три архивных в `public/` не живут). */
export const WEB_SHOTS = [
  "front",
  "quarter",
  "side",
  "folded",
  "top",
  "macro-1",
  "macro-2",
] as const;

export type WebShot = (typeof WEB_SHOTS)[number];

/**
 * Единственный сборщик путей к кадрам. Лесенка @2x (docs/perf-budgets.md):
 * `front.jpg` — 1200 px (карточка, LCP), `front@2x.jpg` — 2400 px (лупа ×1,85).
 * Схема папок — та, что публикует `ingest-frames.mjs`.
 */
export function framePhotoPath(id: string, shot: WebShot, retina = false): string {
  return `/frames/${id}/${shot}${retina ? "@2x" : ""}.jpg`;
}

export function frameSpinPath(id: string, index: number): string {
  return `/frames/${id}/spin/${String(index).padStart(2, "0")}.jpg`;
}

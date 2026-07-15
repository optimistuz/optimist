/**
 * СЕССИЯ ПОДБОРА — всё КАМЕРНОЕ, и только в памяти вкладки.
 *
 * Закон (CLAUDE.md, «Витрина» п. 3 и «Примерка и камера»): форма лица,
 * вторая форма, камерный код, межзрачковое расстояние, миллиметры и ступень
 * ширины НЕ ЛОЖАТСЯ НА ДИСК НИКОГДА. Они живут здесь — в модульной памяти —
 * и умирают вместе с вкладкой. Ни localStorage, ни sessionStorage, ни cookie,
 * ни аналитики, ни сети.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ, если классификация и так лежит в состоянии камеры:
 * состояние компонента умирает при размонтировании. Клиент снял мерку и ушёл
 * в каталог — «ваша ширина» обязана его там встретить, а гонять биометрию
 * через пропсы между маршрутами нельзя (она бы всплыла в URL или в сторе).
 * Поэтому — синглтон на вкладку.
 *
 * ГРАНИЦА УТЕЧКИ. Наружу (в `localStorage["optimist-fit"]`, в заявку Telegram,
 * в аналитику) уходит ТОЛЬКО явный выбор пользователя: силуэт, артикул,
 * название, цвет, цена. Всё, что лежит здесь, — не уходит никуда.
 * Соседний модуль `fit-storage.ts` держит ту же границу на ВХОДЕ: записи
 * `source:"camera"` санитизируются по белому списку.
 *
 * ⚠️ `code` ЗДЕСЬ — камерный код формы лица. Одноимённое поле в
 * `optimist-fit` — код РЕКОМЕНДАЦИИ квиза. Это РАЗНЫЕ вещи с одним именем;
 * не переносить одно в другое (CLAUDE.md, «Витрина» п. 3).
 */
import type { Shape } from "./face-shape";
import type { WidthStep } from "@/content/catalog/frame";

export type FitSession = {
  /** Форма лица по классификатору камеры (НЕ само-декларация квиза). */
  face: Shape;
  /** Вторая по весу форма — для формулировки «овал с чертами удлинённого». */
  secondary?: Shape;
  /** Камерный код формы лица. */
  code?: string;
  /** «уверенно» vs «скорее всего» — тон формулировки, не бейдж. */
  confident?: boolean;
  /** Межзрачковое расстояние, мм (масштаб — по радужке ⌀ ≈ 11,7 мм). */
  pd?: number;
  /** Ширина лица, мм. */
  faceWidth?: number;
  /** Ступень ширины оправы, которая подходит по ГЕОМЕТРИИ (1..5). */
  widthStep?: WidthStep;
  /** Когда снято — в пределах вкладки. На диск не уходит. */
  ts: number;
};

let session: FitSession | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

/** Кладёт мерку в память вкладки. Диска не касается — по определению. */
export function setFitSession(data: Omit<FitSession, "ts">): void {
  session = { ...data, ts: Date.now() };
  emit();
}

export function getFitSession(): FitSession | null {
  return session;
}

/**
 * Буквальное стирание. Зовётся при остановке камеры вместе с `stopStream`
 * и обнулением ландмарок: «остановка камеры = буквальное стирание»
 * (CLAUDE.md). Пустой объект не оставляем — именно `null`.
 */
export function clearFitSession(): void {
  session = null;
  emit();
}

/** Подписка на появление/исчезновение мерки. Возвращает отписку. */
export function onFitSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Снимок для `useSyncExternalStore`. Ссылка стабильна, пока мерку не меняли,
 * поэтому React не уйдёт в бесконечный ре-рендер.
 */
export function subscribeFitSession(fn: () => void): () => void {
  return onFitSession(fn);
}

export function getFitSessionSnapshot(): FitSession | null {
  return session;
}

/**
 * Серверный снимок. На сервере мерки нет и быть не может: SSG-разметка
 * нейтральна, персонализация — только после маунта (CLAUDE.md, «Витрина»
 * п. 4). Возвращаем `null` всегда — это и есть отсутствие гидрационного шва.
 */
export function getFitSessionServerSnapshot(): FitSession | null {
  return null;
}

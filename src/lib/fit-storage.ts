/**
 * Единый контракт `localStorage["optimist-fit"]` — ВЫБОР пользователя и
 * квизовая само-декларация. Один вход (`writeFit`) и один выход (`readFit`),
 * чтобы нельзя было записать подбор и забыть разбудить форму записи.
 *
 * ГРАНИЦА УТЕЧКИ (CLAUDE.md, «Примерка и камера»): наружу уходит только явный
 * выбор пользователя — silhouette / frameId / frameName / color. Камерная
 * классификация (форма лица, secondary, PD, мм) живёт ТОЛЬКО в памяти вкладки
 * и сюда НЕ ПОПАДАЕТ никогда. Поле `face` заполняет исключительно квиз: там
 * это само-декларация — человек сам назвал форму лица.
 *
 * Каждая запись диспатчит `optimist-fit-updated`, поэтому форма записи узнаёт
 * о свежем подборе в ТОЙ ЖЕ сессии, без перезагрузки страницы.
 */
export const FIT_KEY = "optimist-fit";
export const FIT_EVENT = "optimist-fit-updated";
/** Свежесть подбора — 30 дней (та же величина, что у полки). */
export const FIT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export type FitSource = "quiz" | "camera";

export type FitData = {
  /** Форма лица — ТОЛЬКО квизовая само-декларация. Камера сюда не пишет. */
  face?: string;
  use?: string;
  style?: string;
  /** Силуэт оправы, который пользователь выбрал сам (примерка или квиз). */
  silhouette?: string;
  /** Текст рекомендации квиза. Для камеры не заполняется. */
  recommendation?: string;
  code?: string;
  frameId?: string;
  frameName?: string;
  color?: string;
  price?: number;
  source: FitSource;
  ts: number;
};

/** Пишет подбор и будит подписчиков (форма записи). Молча терпит приватный
 *  режим и переполненную квоту — подбор не критичен для работы страницы.
 *
 *  Запись проходит `sanitize` (см. ниже): граница утечки держится на ВХОДЕ, а не
 *  только на выходе. Иначе камерная классификация — форма лица, PD, мм (этапы
 *  7/14) — успела бы лечь на диск и пролежать до ближайшего `readFit`. */
export function writeFit(data: Omit<FitData, "ts">): void {
  const record = sanitize({ ...data, ts: Date.now() });
  try {
    window.localStorage.setItem(FIT_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent(FIT_EVENT));
  } catch {
    /* приватный режим / квота — молча */
  }
}

/**
 * Санитайзер камерной записи. Прежние сборки клали в localStorage классификацию
 * лица (face, secondary, code, recommendation) — она могла пролежать там 30 дней.
 * Для source==="camera" пропускаем ТОЛЬКО белый список границы утечки; всё
 * остальное отбрасываем, даже если оно уже записано на диск.
 */
function sanitize(data: FitData): FitData {
  if (data.source !== "camera") return data;
  const { silhouette, frameId, frameName, color, price, source, ts } = data;
  return { silhouette, frameId, frameName, color, price, source, ts };
}

/** Есть ли в камерной записи поля, которых там быть не должно. */
function isPoisoned(data: FitData): boolean {
  return (
    data.source === "camera" &&
    (data.face !== undefined ||
      data.recommendation !== undefined ||
      data.code !== undefined ||
      "secondary" in data)
  );
}

/**
 * Читает свежий подбор. Протухший (>30 дней) и битый — как отсутствующий.
 * Камерная классификация из старых записей НЕ возвращается и стирается с диска
 * (defense-in-depth: даже «отравленная» запись не всплывёт ни в UI, ни в заявке).
 */
export function readFit(): FitData | null {
  try {
    const raw = window.localStorage.getItem(FIT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as FitData;
    if (!data || typeof data.ts !== "number") return null;
    if (Date.now() - data.ts > FIT_MAX_AGE) return null;
    if (data.source !== "quiz" && data.source !== "camera") return null;
    const clean = sanitize(data);
    if (isPoisoned(data)) {
      // Перезаписываем очищенной записью, сохраняя исходный ts (не «освежаем»
      // подбор). Событие не диспатчим — это уборка, а не новый подбор.
      try {
        window.localStorage.setItem(FIT_KEY, JSON.stringify(clean));
      } catch {
        /* квота / приватный режим — молча */
      }
    }
    return clean;
  } catch {
    return null;
  }
}

/**
 * Подписка на появление свежего подбора: своё событие (та же вкладка) +
 * `storage` (другие вкладки). Возвращает отписку.
 */
export function onFitUpdated(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === FIT_KEY) fn();
  };
  window.addEventListener(FIT_EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FIT_EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

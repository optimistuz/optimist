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

/**
 * Откуда взялся подбор. `catalog` — человек выбрал КОНКРЕТНУЮ оправу в витрине
 * (карточка, PDP, полка): это не «подбор» в смысле квиза, а прямой выбор
 * товара, и заявка обязана его донести — менеджеру есть что снять с полки.
 *
 * ⚠️ Без этого источника запись `{frameId, frameName, color}` была бы
 * ВЫБРОШЕНА на входе (`readFit` не знал такого source), и строка «Оправа: …»
 * в заявке не появилась бы никогда — мёртвый код в честном обличье
 * (поймал `revizor-vitriny`).
 */
export type FitSource = "quiz" | "camera" | "catalog";

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
 * Белый список полей — ОБЩИЙ для всех источников: это и есть граница утечки.
 * Всё перечисленное здесь человек выбрал сам (силуэт, оправа, цвет, цена).
 */
const SHARED_FIELDS = [
  "silhouette",
  "frameId",
  "frameName",
  "color",
  "price",
  "source",
  "ts",
] as const;

/**
 * Что дозволено ДОПОЛНИТЕЛЬНО только квизу. Это само-декларация: человек сам
 * назвал форму лица и сам прочитал рекомендацию. Камера и каталог сюда писать
 * не могут ФИЗИЧЕСКИ — их записи режутся до `SHARED_FIELDS`.
 */
const QUIZ_ONLY_FIELDS = ["face", "use", "style", "recommendation", "code"] as const;

const allowedFields = (source: FitSource): readonly string[] =>
  source === "quiz" ? [...SHARED_FIELDS, ...QUIZ_ONLY_FIELDS] : SHARED_FIELDS;

/**
 * Санитайзер записи. Прежние сборки клали в localStorage классификацию лица
 * (face, secondary, code, recommendation) — она могла пролежать там 30 дней.
 *
 * ⚠️ Защита идёт ПО ПОЛЯМ, а не по источнику. Раньше проверялся только
 * `source === "camera"`, а для всех прочих запись пропускалась как есть —
 * и это была мина под этапы 12–13 (нашёл `strazh`): рядом живёт
 * `getFitSession()` с face/PD/мм, и один спред
 * `writeFit({ ...getFitSession(), frameId, source: "catalog" })` уложил бы
 * биометрию на диск, пройдя и вход, и выход, и проверку «отравления».
 * Теперь неизвестное поле выбрасывается ВСЕГДА, каким бы ни был источник:
 * белый список не нужно помнить — его нельзя обойти.
 */
function sanitize(data: FitData): FitData {
  const out: Record<string, unknown> = {};
  for (const key of allowedFields(data.source)) {
    const value = (data as unknown as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = value;
  }
  return out as unknown as FitData;
}

/** Есть ли в записи поля, которых при её источнике быть не должно. */
function isPoisoned(data: FitData): boolean {
  const allowed = new Set<string>(allowedFields(data.source));
  return Object.keys(data).some((key) => !allowed.has(key));
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
    if (data.source !== "quiz" && data.source !== "camera" && data.source !== "catalog")
      return null;
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

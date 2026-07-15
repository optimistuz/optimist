import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Транспорт заявки: сайт → Telegram-группа салонов. Серверных баз ПД нет
 * (CLAUDE.md, «Витрина» п. 5): заявка нигде не сохраняется, она пересылается.
 *
 * ЧТО СЮДА НЕ ПРИХОДИТ НИКОГДА: камерная классификация — форма лица, PD,
 * миллиметры, код (CLAUDE.md, «Граница утечки»). Наружу уходит только явный
 * выбор человека: силуэт, артикул, цвет, салон. Держится это не на совести
 * клиента, а на схеме ниже: `extras` — короткий список строк с жёсткими
 * потолками, а не свободное поле.
 *
 * ⚠️ Раньше `extras` уходили в Telegram БЕЗ ВАЛИДАЦИИ: кто угодно мог отправить
 * в рабочий чат салона простыню текста от имени сайта. Теперь их режет схема.
 */

const lastRequestByIp = new Map<string, number>();
/** Не чаще одной заявки в 10 с с адреса. Бонусный слой: на холодном старте
 *  Map пуста, и худший исход — дубль в чате (plan.md §10 Q7, дефолт). */
const RATE_LIMIT_MS = 10_000;

/**
 * Порог «нечеловечески быстрой» отправки. Число намеренно НИЗКОЕ.
 *
 * Соблазн поставить 3–5 с («столько человек печатает») — ловушка: клиент
 * с автозаполнением отправляет форму за секунду, и мы бы молча съели живую
 * заявку. Потерянный клиент дороже пропущенного спама, поэтому порог стоит
 * НИЖЕ человеческой способности, а не на «типичной» скорости: за 1,2 с нельзя
 * ни набрать имя и телефон, ни осмысленно нажать автозаполнение и кнопку.
 * Отсутствие поля (JS-таймер не сработал) отказом НЕ является.
 */
const MIN_FILL_MS = 1_200;

/** Строка для чата: непустая и с потолком — менеджер не должен получить простыню. */
const line = (max: number) => z.string().trim().min(1).max(max);

const payloadSchema = z.object({
  type: z.enum(["appointment", "callback"]),
  name: line(80),
  phone: line(32),
  service: line(80).optional(),
  date: line(40).optional(),
  /**
   * Контекст подбора: подбор, оправа, салон, удобное время — и позиции полки
   * (этап 13, до 7 штук).
   *
   * ⚠️ Потолок 6 был миной замедленного действия: полка на 7 позиций дала бы
   * 11 строк, схема вернула бы 400 — и клиент, отложивший семь оправ, увидел
   * бы «не удалось отправить заявку». Самый заинтересованный покупатель
   * получал бы отказ (поймал `revizor-vitriny`). Потолок держит длину
   * сообщения, но не режет живую заявку.
   */
  extras: z.array(line(160)).max(14).optional(),
  /** Honeypot: у человека это поле пустое. */
  company: z.string().max(200).optional(),
  /** Сколько миллисекунд форма прожила на экране до отправки. */
  elapsedMs: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const data = parsed.data;

  // Бот: заполнил скрытое поле ИЛИ отправил форму быстрее, чем её физически
  // можно заполнить. Отвечаем тихим «успехом» — бот не должен понять, что его
  // отбрили, и начать подбирать обход.
  const tooFast = data.elapsedMs !== undefined && data.elapsedMs < MIN_FILL_MS;
  if ((data.company && data.company.trim() !== "") || tooFast) {
    return NextResponse.json({ ok: true });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const last = lastRequestByIp.get(ip);
  if (last && now - last < RATE_LIMIT_MS) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }
  lastRequestByIp.set(ip, now);

  // extras несут подбор (честный источник) — они осмысленны в ОБОИХ режимах:
  // менеджеру, который перезванивает, контекст подбора нужен ровно так же.
  const lines =
    data.type === "callback"
      ? [
          "📞 ПЕРЕЗВОНИТЕ МНЕ",
          `Имя: ${data.name}`,
          `Телефон: ${data.phone}`,
          ...(data.extras ?? []),
        ].filter(Boolean)
      : [
          "📅 ЗАПИСЬ НА ПРИЁМ",
          `Имя: ${data.name}`,
          `Телефон: ${data.phone}`,
          data.service ? `Услуга: ${data.service}` : null,
          data.date ? `Дата: ${data.date}` : null,
          ...(data.extras ?? []),
        ].filter(Boolean);

  const message = (lines as string[]).join("\n");

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!tg.ok) {
      return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to send" }, { status: 502 });
  }
}

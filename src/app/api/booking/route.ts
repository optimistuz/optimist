import { NextResponse } from "next/server";

const lastRequestByIp = new Map<string, number>();
const RATE_LIMIT_MS = 10_000; // не чаще 1 заявки в 10 сек с одного адреса

type BookingPayload = {
  type: "appointment" | "callback";
  name: string;
  phone: string;
  service?: string;
  date?: string;
  extras?: string[];
  company?: string; // honeypot — должно оставаться пустым
};

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  let data: BookingPayload;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  // Honeypot: скрытое поле заполнено — это бот. Тихий «успех» без отправки.
  if (data.company && data.company.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (!data.name?.trim() || !data.phone?.trim()) {
    return NextResponse.json({ ok: false, error: "Name and phone required" }, { status: 400 });
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

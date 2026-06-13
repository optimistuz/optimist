"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { site } from "@/content/home";

/* ------------------------------------------------------------------
   Живой статус «Открыто · до 20:00» — текстовый, без пульсации
   (правило одной вечной анимации). Время — Asia/Tashkent через Intl,
   расписание — site.schedule (общие часы сети; различия филиалов — TODO).

   ГИДРАЦИЯ: до маунта рендерится нейтральная строка расписания —
   сервер и первый клиентский кадр совпадают байт в байт.
   ------------------------------------------------------------------ */

const NEUTRAL = "Ежедневно · 09:00–20:00";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const ruleFor = (day: number) =>
  site.schedule.find((r) => (r.days as number[]).includes(day)) ?? site.schedule[0];

/** Чистая функция статуса для момента времени (тестируется отдельно). */
export function statusFor(now: Date): { open: boolean; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday")
  );
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));

  const today = ruleFor(dayIndex);
  if (minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
    return { open: true, label: `Открыто · до ${today.close}` };
  }
  if (minutes < toMinutes(today.open)) {
    return { open: false, label: `Откроемся в ${today.open}` };
  }
  const tomorrow = ruleFor((dayIndex + 1) % 7);
  return { open: false, label: `Откроемся завтра в ${tomorrow.open}` };
}

/** Статус прямо сейчас; до маунта — null (нейтральная строка). */
export function useOpenStatus(): { open: boolean; label: string } | null {
  const [status, setStatus] = useState<{ open: boolean; label: string } | null>(
    null
  );

  useEffect(() => {
    const update = () => setStatus(statusFor(new Date()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, []);

  return status;
}

/**
 * Бейдж статуса: точка-маркер СТАТИЧНАЯ (открыто — brand, закрыто и
 * до маунта — ink/30), мелкий uppercase-текст.
 */
export function OpenStatusBadge({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const status = useOpenStatus();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.15em]",
        onDark ? "text-paper/60" : "text-graphite",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          status?.open ? "bg-brand" : onDark ? "bg-paper/30" : "bg-ink/30"
        )}
      />
      {status?.label ?? NEUTRAL}
    </span>
  );
}

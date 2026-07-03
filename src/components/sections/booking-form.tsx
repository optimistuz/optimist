"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { Magnetic } from "@/components/ui/magnetic";
import {
  services,
  fitQuiz,
  salons,
  ctaBlock,
  faceShapeLabels,
} from "@/content/home";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/cn";

type Status = "idle" | "submitting" | "success" | "error";

type Mode = "appointment" | "callback";

type FormValues = {
  name: string;
  phone: string;
  service: string;
  salon: string;
  date: string;
};

const EMPTY: FormValues = {
  name: "",
  phone: "",
  service: "",
  salon: "",
  date: "",
};

// Связка с квизом «Подбор»: форма читает свежий результат из localStorage.
type FitData = {
  face: string;
  use: string;
  style: string;
  recommendation: string;
  code?: string;
  ts: number;
};
const FIT_KEY = "optimist-fit";
const FIT_SERVICE = "Подбор оправы";
const FIT_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // свежесть подбора ≤ 30 дней

// Подбор из квиза знает 5 форм; подбор по лицу добавляет ромб — общий
// словарь faceShapeLabels закрывает все 6 (квиз остаётся первым источником).
const faceLabelOf = (v: string) =>
  fitQuiz.steps[0].options.find((o) => o.value === v)?.label ??
  faceShapeLabels[v] ??
  v;

/** Автоформат узбекского номера: +998 XX XXX-XX-XX, префикс закреплён. */
function formatUzPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  if (digits.length === 0) return "";
  let out = "+998 " + digits.slice(0, 2);
  if (digits.length > 2) out += " " + digits.slice(2, 5);
  if (digits.length > 5) out += "-" + digits.slice(5, 7);
  if (digits.length > 7) out += "-" + digits.slice(7, 9);
  return out;
}

const phoneDigits = (phone: string) =>
  phone.replace(/\D/g, "").replace(/^998/, "");

function validate(values: FormValues) {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Укажите имя";
  if (phoneDigits(values.phone).length !== 9)
    errors.phone = "Введите номер полностью: +998 и ещё 9 цифр";
  return errors;
}

type BookingPayload = {
  type: "appointment" | "callback";
  name: string;
  phone: string;
  service?: string;
  date?: string;
  extras?: string[];
  company: string; // honeypot
};

// Реальная отправка: заявка уходит на серверный обработчик /api/booking,
// который пересылает её в Telegram-группу. Токен — только в окружении Vercel.
async function postBooking(payload: BookingPayload): Promise<boolean> {
  try {
    const res = await fetch("/api/booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return res.ok && data?.ok === true;
  } catch {
    return false;
  }
}

/** «2026-06-14» → «14 июня 2026 г.» (ru-RU). Парсим как локальную дату. */
function formatDateRu(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Ссылка на Яндекс.Карты по адресу салона. */
const mapHrefFor = (address: string) =>
  "https://yandex.uz/maps/?text=" + encodeURIComponent(`${address}, Ташкент`);

/** Экранирование значений iCalendar (RFC 5545). */
const icsEscape = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");

/**
 * Сборка и скачивание .ics на клиенте (по клику — Date/Blob/URL доступны).
 * Событие на весь день выбранной даты: точное время подтверждаем по телефону.
 */
function downloadIcs({
  date,
  summary,
  location,
  description,
}: {
  date: string;
  summary: string;
  location: string;
  description: string;
}) {
  const start = new Date(date + "T00:00:00");
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Optimist//Booking//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:optimist-${ymd(start)}-${start.getTime()}@optimist.uz`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    location ? `LOCATION:${icsEscape(location)}` : "",
    `DESCRIPTION:${icsEscape(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "optimist-priem.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const fieldBase =
  "w-full rounded-[4px] border border-paper/15 bg-paper/5 px-4 py-3 text-sm text-paper placeholder:text-paper/40 transition-colors duration-300 ease-soft focus:border-brand focus:outline-none";
const fieldClasses = "mt-2 " + fieldBase;

const labelClasses =
  "block text-xs font-medium uppercase tracking-[0.15em] text-paper/60";

/**
 * Тонкая галочка валидного поля — прорисовывается (pathLength, 0.3 с).
 * На тёмной CTA-форме цвет paper/70 (на светлой теме был бы brand).
 * Reduced-motion: статичный знак без прорисовки.
 */
function FieldCheck({ reduce }: { reduce: boolean }) {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-paper/70">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <motion.path
          d="M5 12.5 10 17.5 19 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={reduce ? undefined : { pathLength: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
        />
      </svg>
    </span>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-brand">
      {message}
    </p>
  );
}

/**
 * Тонкая галочка в круге — подтверждение принятой заявки.
 * Круг прорисовывается (0.4 с), затем галочка (0.35 с).
 * Reduced-motion: статичный знак без прорисовки.
 */
function CheckIcon({ reduce }: { reduce: boolean }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <motion.circle
        cx="28"
        cy="28"
        r="27"
        strokeWidth="1"
        className="stroke-paper/40"
        initial={reduce ? false : { pathLength: 0 }}
        animate={reduce ? undefined : { pathLength: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      />
      <motion.path
        d="M18 28.5 25 35.5 38 21.5"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand"
        initial={reduce ? false : { pathLength: 0 }}
        animate={reduce ? undefined : { pathLength: 1 }}
        transition={{ delay: 0.4, duration: 0.35, ease: EASE }}
      />
    </svg>
  );
}

/**
 * Форма записи на приём (тёмная тема CTA-секции).
 * Бэкенда нет — отправка имитируется, см. TODO в sendBooking.
 * Ошибки появляются после первой попытки отправки, дальше — живые.
 */
export default function BookingForm() {
  const reduce = useReduceAfterMount();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [attempted, setAttempted] = useState(false);
  // min для даты — завтрашний день, вычисляется на клиенте
  const [minDate, setMinDate] = useState("");
  // Подбор из квиза (читается после маунта — гидрация не меняется)
  const [fit, setFit] = useState<FitData | null>(null);
  const [fitApplied, setFitApplied] = useState(false);
  // Поля, с которых ушёл фокус (для галочки валидности) + удобное время
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [timePref, setTimePref] = useState("");
  // Тип заявки: запись на приём (по умолчанию) или обратный звонок (Шаг B).
  const [mode, setMode] = useState<Mode>("appointment");
  const isAppointment = mode === "appointment";

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setMinDate(
      `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(
        tomorrow.getDate()
      )}`
    );
  }, []);

  // Mounted-гейт: localStorage читаем только на клиенте, после маунта.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FIT_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as FitData;
      if (!data || typeof data.ts !== "number") return;
      if (Date.now() - data.ts > FIT_MAX_AGE) return; // несвежий — игнорируем
      setFit(data);
      setFitApplied(true);
      setValues((v) => ({ ...v, service: FIT_SERVICE }));
    } catch {
      /* приватный режим / битый JSON — молча */
    }
  }, []);

  // Услуга «Подбор оправы» появляется в селекте, только когда подбор учтён.
  const baseServices = services.items.map((s) => s.title);
  const serviceOptions =
    fitApplied && !baseServices.includes(FIT_SERVICE)
      ? [FIT_SERVICE, ...baseServices]
      : baseServices;

  // Отмена предзаполнения крестиком: убираем чипс и предвыбор, но НЕ localStorage.
  const cancelFit = () => {
    setFitApplied(false);
    setValues((v) => ({
      ...v,
      service: v.service === FIT_SERVICE ? "" : v.service,
    }));
  };

  const errors = attempted ? validate(values) : {};

  const markTouched = (f: string) => setTouched((t) => ({ ...t, [f]: true }));
  const fieldValid = (f: "name" | "phone") =>
    f === "name"
      ? values.name.trim().length > 0
      : phoneDigits(values.phone).length === 9;
  // Галочка появляется по уходу фокуса с валидного поля ИЛИ после первой
  // попытки отправки; с ошибкой взаимоисключающа (ошибка — только у невалидного).
  const showCheck = (f: "name" | "phone") =>
    fieldValid(f) && (attempted || !!touched[f]);

  const set = (field: keyof FormValues) => (value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;

    // Honeypot: бот заполнил скрытое поле — тихий «успех» без отправки
    if (honeypot) {
      setStatus("success");
      return;
    }

    setAttempted(true);
    if (Object.keys(validate(values)).length > 0) return;

    // Доп. строки заявки — только для записи на приём: подбор из квиза, салон, время.
    // Для обратного звонка нужны лишь имя и телефон.
    const extras: string[] = [];
    if (isAppointment) {
      if (fitApplied && fit) {
        extras.push(
          `Подбор из квиза: ${faceLabelOf(fit.face).toLowerCase()} · ${fit.recommendation}`
        );
      }
      if (values.salon) extras.push(`Салон: ${values.salon}`);
      if (timePref) extras.push(`Удобное время: ${timePref}`);
    }

    const payload: BookingPayload = {
      type: mode,
      name: values.name.trim(),
      phone: values.phone,
      service: isAppointment ? values.service || undefined : undefined,
      date: isAppointment && values.date ? formatDateRu(values.date) : undefined,
      extras: isAppointment ? extras : undefined,
      company: honeypot,
    };

    setStatus("submitting");
    const ok = await postBooking(payload);
    setStatus(ok ? "success" : "error");
  };

  const resetForm = () => {
    setValues(EMPTY);
    setHoneypot("");
    setAttempted(false);
    setStatus("idle");
    setTouched({});
    setTimePref("");
  };

  if (status === "success") {
    const c = ctaBlock.confirm;
    const firstName = values.name.trim().split(/\s+/)[0];
    const chosenSalon = salons.find((s) => s.address === values.salon);
    // Сводка заявки — только заполненные строки
    const summaryRows: { label: string; value: string }[] = [];
    if (values.service)
      summaryRows.push({ label: c.labels.service, value: values.service });
    if (values.date)
      summaryRows.push({ label: c.labels.date, value: formatDateRu(values.date) });
    if (timePref) summaryRows.push({ label: c.labels.time, value: timePref });
    if (values.salon)
      summaryRows.push({ label: c.labels.salon, value: values.salon });
    if (fitApplied && fit)
      summaryRows.push({
        label: c.labels.fit,
        value: `${faceLabelOf(fit.face).toLowerCase()} · ${fit.recommendation}`,
      });

    const addToCalendar = () =>
      downloadIcs({
        date: values.date,
        summary: c.event,
        location: values.salon ? `${values.salon}, Ташкент` : "«Оптимист», Ташкент",
        description: [
          values.service && `Услуга: ${values.service}`,
          timePref && `Удобнее: ${timePref}`,
          c.eventNote,
        ]
          .filter(Boolean)
          .join("\n"),
      });

    return (
      <motion.div
        // «Наводится на резкость»: подтверждение проявляется из расфокуса (A1)
        initial={reduce ? false : { opacity: 0, filter: "blur(8px)" }}
        animate={reduce ? {} : { opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="flex h-full min-h-[20rem] flex-col items-start justify-center"
        role="status"
      >
        <CheckIcon reduce={Boolean(reduce)} />
        {/* Личное обращение — подъезжает пружиной после прорисовки знака */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.55, type: "spring", stiffness: 220, damping: 22 }}
          className="mt-7 font-serif text-2xl font-light leading-snug text-paper sm:text-3xl"
        >
          {c.greeting}
          {firstName}.
        </motion.p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper/60 sm:text-base">
          {isAppointment ? c.promise : c.promiseCallback}
        </p>

        {isAppointment && summaryRows.length > 0 && (
          <dl className="mt-8 w-full max-w-sm space-y-2.5 border-t border-paper/15 pt-6 text-sm">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex justify-between gap-6">
                <dt className="shrink-0 text-paper/45">{row.label}</dt>
                <dd className="text-right text-paper/80">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {isAppointment && (
          <>
        <p className="mt-6 max-w-sm text-sm leading-relaxed text-paper/55">
          {c.bring}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          {values.date && (
            <button
              type="button"
              onClick={addToCalendar}
              className="tracking-wide text-paper underline decoration-paper/30 underline-offset-4 transition-colors duration-300 hover:decoration-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {c.calendar}
            </button>
          )}
          {chosenSalon && (
            <a
              href={mapHrefFor(chosenSalon.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-wide text-paper/70 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {c.map}
            </a>
          )}
        </div>
          </>
        )}

        <button
          type="button"
          onClick={resetForm}
          className="mt-8 text-sm tracking-wide text-paper/50 underline decoration-paper/20 underline-offset-4 transition-colors duration-300 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {c.again}
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative">
      {/* Honeypot — скрытое поле-ловушка для ботов */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="booking-company">
          Не заполняйте это поле
          <input
            id="booking-company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {/* Переключатель типа заявки: запись на приём ↔ обратный звонок (Шаг B).
          Фокус-идиома: активный пункт резкий, неактивный приглушён; пилюля
          подъезжает (layoutId) — отклик на действие, не вечная анимация. */}
      <div
        role="radiogroup"
        aria-label="Тип заявки"
        className="mb-8 inline-flex rounded-full border border-paper/15 p-1"
      >
        {(["appointment", "callback"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m)}
              className={cn(
                "relative rounded-full px-4 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                active ? "text-paper" : "text-paper/55 hover:text-paper"
              )}
            >
              {active && (
                <motion.span
                  layoutId="booking-mode-pill"
                  className="absolute inset-0 rounded-full bg-paper/[0.08]"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 400, damping: 34 }
                  }
                />
              )}
              <span className="relative z-10">{ctaBlock.modes[m]}</span>
            </button>
          );
        })}
      </div>

      {/* Тихий чипс подбора из квиза — над полями; крестик отменяет предзаполнение.
          Только в режиме записи на приём (для обратного звонка подбор не нужен). */}
      {isAppointment && fitApplied && fit && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-[4px] border border-paper/15 bg-paper/5 px-4 py-3">
          <p className="text-sm leading-relaxed text-paper/70">
            <span className="text-brand">✓</span> Учтём ваш подбор:{" "}
            {faceLabelOf(fit.face).toLowerCase()} · {fit.recommendation}
          </p>
          <button
            type="button"
            onClick={cancelFit}
            aria-label="Не учитывать подбор из квиза"
            className="shrink-0 rounded-sm text-paper/50 transition-colors duration-200 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            ✕
          </button>
        </div>
      )}

      {/* form-focal/form-field — фокальная плоскость формы: активное поле
          резкое, остальные приглушаются (globals.css; без blur — текст
          в полях должен читаться) */}
      <div className="form-focal grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="form-field">
          <label htmlFor="booking-name" className={labelClasses}>
            Имя *
          </label>
          <div className="relative mt-2">
            <input
              id="booking-name"
              type="text"
              autoComplete="name"
              placeholder="Как к вам обращаться"
              value={values.name}
              onChange={(e) => set("name")(e.target.value)}
              onBlur={() => markTouched("name")}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "booking-name-error" : undefined}
              className={cn(fieldBase, "pr-10", errors.name && "border-brand")}
            />
            {showCheck("name") && <FieldCheck reduce={Boolean(reduce)} />}
          </div>
          <FieldError id="booking-name-error" message={errors.name} />
        </div>

        <div className="form-field">
          <label htmlFor="booking-phone" className={labelClasses}>
            Телефон *
          </label>
          <div className="relative mt-2">
            <input
              id="booking-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123-45-67"
              value={values.phone}
              onChange={(e) => set("phone")(formatUzPhone(e.target.value))}
              onBlur={() => markTouched("phone")}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? "booking-phone-error" : undefined}
              className={cn(fieldBase, "pr-10", errors.phone && "border-brand")}
            />
            {showCheck("phone") && <FieldCheck reduce={Boolean(reduce)} />}
          </div>
          <FieldError id="booking-phone-error" message={errors.phone} />
        </div>

        {/* Услуга · дата · салон — только для записи на приём (Шаг B) */}
        {isAppointment && (
          <>
        <div className="form-field">
          <label htmlFor="booking-service" className={labelClasses}>
            Услуга
          </label>
          {/* appearance-none + свой тонкий шеврон: нативная стрелка ОС
              не из нашего мира */}
          <div className="relative">
            <select
              id="booking-service"
              value={values.service}
              onChange={(e) => set("service")(e.target.value)}
              className={cn(
                fieldClasses,
                "appearance-none pr-10",
                !values.service && "text-paper/40"
              )}
            >
              <option value="" className="bg-paper text-ink">
                Выберите услугу
              </option>
              {serviceOptions.map((title) => (
                <option key={title} value={title} className="bg-paper text-ink">
                  {title}
                </option>
              ))}
              <option value="Другое" className="bg-paper text-ink">
                Другое
              </option>
            </select>
            <svg
              width="12"
              height="8"
              viewBox="0 0 12 8"
              fill="none"
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 mt-1 -translate-y-1/2 text-paper/60"
            >
              <path
                d="M1 1.5 6 6.5 11 1.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="booking-date" className={labelClasses}>
            Дата
          </label>
          <input
            id="booking-date"
            type="date"
            min={minDate}
            value={values.date}
            onChange={(e) => set("date")(e.target.value)}
            className={fieldClasses}
            // нативный календарь и его иконка — в тёмном исполнении
            style={{ colorScheme: "dark" }}
          />
        </div>

        {/* Удобный салон — на весь ряд (адреса длинные). Уходит в заявку
            и в персональное подтверждение (A1). */}
        <div className="form-field sm:col-span-2">
          <label htmlFor="booking-salon" className={labelClasses}>
            Удобный салон
          </label>
          <div className="relative">
            <select
              id="booking-salon"
              value={values.salon}
              onChange={(e) => set("salon")(e.target.value)}
              className={cn(
                fieldClasses,
                "appearance-none pr-10",
                !values.salon && "text-paper/40"
              )}
            >
              <option value="" className="bg-paper text-ink">
                Подскажем ближайший
              </option>
              {salons.map((s) => (
                <option
                  key={s.address}
                  value={s.address}
                  className="bg-paper text-ink"
                >
                  {s.address}
                  {s.note ? ` · ${s.note}` : ""}
                </option>
              ))}
            </select>
            <svg
              width="12"
              height="8"
              viewBox="0 0 12 8"
              fill="none"
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 mt-1 -translate-y-1/2 text-paper/60"
            >
              <path
                d="M1 1.5 6 6.5 11 1.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
          </>
        )}
      </div>

      {/* Удобное время — необязательный одиночный выбор; уходит в текст заявки.
          Чипсы в стиле «Мастерской» (тёмная тема CTA). Только при записи (Шаг B). */}
      {isAppointment && (
      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-paper/60">
          Удобнее
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Утро", "День", "Вечер"].map((t) => {
            const sel = timePref === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={sel}
                onClick={() => setTimePref(sel ? "" : t)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  sel
                    ? "border-paper/50 bg-paper/[0.08] text-paper"
                    : "border-paper/15 text-paper/60 hover:text-paper"
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {status === "error" && (
        <p role="alert" className="mt-6 text-sm text-brand">
          Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам:
          +998&nbsp;99&nbsp;824&nbsp;00&nbsp;84.
        </p>
      )}

      <div className="mt-8">
        <Magnetic>
          <Button type="submit" disabled={status === "submitting"}>
            {status === "submitting"
              ? "Отправляем…"
              : isAppointment
                ? ctaBlock.button.label
                : ctaBlock.callbackButton}
          </Button>
        </Magnetic>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Magnetic } from "@/components/ui/magnetic";
import { services } from "@/content/home";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/cn";

type Status = "idle" | "submitting" | "success";

type FormValues = {
  name: string;
  phone: string;
  service: string;
  date: string;
};

const EMPTY: FormValues = { name: "", phone: "", service: "", date: "" };

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

// TODO: подключить реальную отправку (Telegram-бот / e-mail / CRM — решение владельца)
async function sendBooking(values: FormValues): Promise<void> {
  void values; // данные формы уйдут в реальный канал отправки
  // Имитация сетевого запроса
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

const fieldClasses =
  "mt-2 w-full rounded-[4px] border border-paper/15 bg-paper/5 px-4 py-3 text-sm text-paper placeholder:text-paper/40 transition-colors duration-300 ease-soft focus:border-brand focus:outline-none";

const labelClasses =
  "block text-xs font-medium uppercase tracking-[0.15em] text-paper/60";

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
  const reduce = useReducedMotion();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [attempted, setAttempted] = useState(false);
  // min для даты — завтрашний день, вычисляется на клиенте
  const [minDate, setMinDate] = useState("");

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

  const errors = attempted ? validate(values) : {};

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

    setStatus("submitting");
    await sendBooking(values);
    setStatus("success");
  };

  const resetForm = () => {
    setValues(EMPTY);
    setHoneypot("");
    setAttempted(false);
    setStatus("idle");
  };

  if (status === "success") {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={reduce ? {} : { opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex h-full min-h-[20rem] flex-col items-start justify-center"
        role="status"
      >
        <CheckIcon reduce={Boolean(reduce)} />
        {/* Текст подъезжает пружиной после прорисовки знака */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{
            delay: 0.7,
            type: "spring",
            stiffness: 220,
            damping: 22,
          }}
          className="mt-7 font-serif text-2xl font-light leading-snug text-paper sm:text-3xl"
        >
          Заявка принята — мы перезвоним в течение 30 минут
        </motion.p>
        <button
          type="button"
          onClick={resetForm}
          className="mt-8 text-sm tracking-wide text-paper/60 underline decoration-paper/30 underline-offset-4 transition-colors duration-300 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Отправить ещё заявку
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

      {/* form-focal/form-field — фокальная плоскость формы: активное поле
          резкое, остальные приглушаются (globals.css; без blur — текст
          в полях должен читаться) */}
      <div className="form-focal grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="form-field">
          <label htmlFor="booking-name" className={labelClasses}>
            Имя *
          </label>
          <input
            id="booking-name"
            type="text"
            autoComplete="name"
            placeholder="Как к вам обращаться"
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "booking-name-error" : undefined}
            className={cn(fieldClasses, errors.name && "border-brand")}
          />
          <FieldError id="booking-name-error" message={errors.name} />
        </div>

        <div className="form-field">
          <label htmlFor="booking-phone" className={labelClasses}>
            Телефон *
          </label>
          <input
            id="booking-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+998 90 123-45-67"
            value={values.phone}
            onChange={(e) => set("phone")(formatUzPhone(e.target.value))}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "booking-phone-error" : undefined}
            className={cn(fieldClasses, errors.phone && "border-brand")}
          />
          <FieldError id="booking-phone-error" message={errors.phone} />
        </div>

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
              {services.items.map((s) => (
                <option key={s.index} value={s.title} className="bg-paper text-ink">
                  {s.title}
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
      </div>

      <div className="mt-8">
        <Magnetic>
          <Button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Отправляем…" : "Записаться на приём"}
          </Button>
        </Magnetic>
      </div>
    </form>
  );
}

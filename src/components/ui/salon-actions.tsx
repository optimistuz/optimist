"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion";

/* ------------------------------------------------------------------
   Тихие утилиты филиала: «Маршрут» (deep-link на Яндекс.Карты, без API
   и ключей) и «Скопировать адрес» (clipboard с фолбэком execCommand).
   После копирования текст на 1,5 с сменяется «✓ Скопировано» (галочка
   прорисовывается). Reduced-motion: смена текста без анимации.
   ------------------------------------------------------------------ */

const linkClass =
  "inline-flex items-center gap-1.5 rounded-sm text-sm text-graphite transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function SalonActions({ address }: { address: string }) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const full = `${address}, Ташкент`;
  const mapHref = "https://yandex.uz/maps/?text=" + encodeURIComponent(full);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(full);
      } else {
        // Фолбэк: временный input + execCommand
        const ta = document.createElement("textarea");
        ta.value = full;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* буфер недоступен — молча */
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <a href={mapHref} target="_blank" rel="noopener noreferrer" className={linkClass}>
        Маршрут
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path
            d="M2 9 9 2M4 2h5v5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>

      <button type="button" onClick={copy} className={linkClass} aria-live="polite">
        {copied ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <motion.path
                d="M2.5 7.5 6 11 11.5 3.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? false : { pathLength: 0 }}
                animate={reduce ? undefined : { pathLength: 1 }}
                transition={{ duration: 0.3, ease: EASE }}
              />
            </svg>
            Скопировано
          </span>
        ) : (
          "Скопировать адрес"
        )}
      </button>
    </div>
  );
}

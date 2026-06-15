"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FaceIcon } from "@/components/ui/face-icon";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";
import { recommendByFace } from "@/lib/fit-recommend";
import type { Shape } from "@/lib/face-shape";
import {
  faceFit,
  faceResultGenitive,
  faceResultPhrase,
  faceShapeLabels,
  site,
} from "@/content/home";

/* ------------------------------------------------------------------
   Экран результата подбора по лицу (Блок 6).
   «Наводится на резкость» (blur 6→0). Мягкие формулировки: при смеси —
   «<форма>, с лёгкими чертами <вторичной>», уверенность словами.
   1–2 рекомендованных силуэта с абзацем «почему» (карта — общая с
   квизом, помечена ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ в fit-recommend). Ручная
   правка чипсами форм. Сноска про оптометриста → #cta. Telegram-share.
   Запись в localStorage и предзаполнение формы — на стороне родителя.
   ------------------------------------------------------------------ */

const ALL_SHAPES: Shape[] = [
  "oval",
  "round",
  "square",
  "long",
  "heart",
  "diamond",
];

export function FaceResult({
  face,
  secondary,
  mixture,
  confident,
  manual,
  reduce,
  onPickFace,
}: {
  face: Shape;
  secondary: Shape;
  mixture: boolean;
  confident: boolean;
  manual: boolean;
  reduce: boolean;
  onPickFace: (s: Shape) => void;
}) {
  const r = faceFit.result;
  const rec = recommendByFace(face);

  // Заголовок с грамматикой смеси
  const phrase = faceResultPhrase[face] ?? faceShapeLabels[face] ?? face;
  const headline =
    mixture && !manual
      ? `${r.prefix} ${phrase}, ${r.mix} ${faceResultGenitive[secondary] ?? ""}`
      : `${r.prefix} ${phrase}`;

  // Метка уверенности (при ручном выборе — «Ваш выбор»)
  const confLabel = manual
    ? r.manualChosen
    : confident
    ? r.confidently
    : r.likely;

  // Telegram-share — как в квизе
  const shareUrl =
    "https://t.me/share/url?url=" +
    encodeURIComponent(site.url) +
    "&text=" +
    encodeURIComponent(
      r.shareText + (rec.directions[0] ? `: ${rec.directions[0].name}` : "")
    );

  const anim = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(6px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.6, ease: EASE },
      };
  const Wrap = reduce ? "div" : motion.div;

  return (
    <Wrap {...anim} className="mt-8" aria-live="polite">
      <p className="text-xs uppercase tracking-[0.2em] text-brand-deep">
        {confLabel}
      </p>
      <h3 className="mt-3 max-w-2xl font-serif text-2xl font-light leading-snug text-ink sm:text-3xl">
        {headline}
      </h3>

      {/* 1–2 направления с «почему» */}
      <ul className="mt-8 space-y-6">
        {rec.directions.map((d) => (
          <li key={d.name} className="border-l border-line pl-5 sm:pl-6">
            <p className="font-medium text-ink">{d.name}</p>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-graphite sm:text-base">
              {d.why}
            </p>
          </li>
        ))}
      </ul>

      {/* Поправить вручную — чипсы шести форм (фокус-идиома) */}
      <div className="mt-10">
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-graphite">
          {r.manualTitle}
        </p>
        <div
          role="radiogroup"
          aria-label={r.manualTitle}
          className="mt-3 flex flex-wrap gap-2"
        >
          {ALL_SHAPES.map((s) => {
            const sel = face === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => onPickFace(s)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  sel
                    ? "border-brand text-ink"
                    : "border-line text-graphite hover:border-ink/40 hover:text-ink"
                )}
              >
                <span className={sel ? "text-brand" : "text-ink"}>
                  <FaceIcon shape={s} className="h-4 w-3" />
                </span>
                {faceShapeLabels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Сноска про оптометриста + действия */}
      <p className="mt-8 max-w-xl text-sm leading-relaxed text-graphite">
        {r.footnote}
      </p>
      <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-graphite/70">
        {r.optometristNote}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
        <Button href={r.cta.href}>{r.cta.label}</Button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {r.share}
        </a>
      </div>
    </Wrap>
  );
}

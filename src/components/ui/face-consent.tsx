"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { EASE } from "@/lib/motion";
import { faceFit } from "@/content/home";

/* ------------------------------------------------------------------
   Экран согласия — ПЕРЕД доступом к камере (Блок 2.1).
   Спокойный экран: обещание приватности тремя пунктами тонкими линиями.
   primary «Включить камеру», текстовая «Лучше три вопроса» (→ квиз).
   Доступность: заголовок-якорь, видимый фокус, кнопки с клавиатуры.
   reduced-motion: без появления (статично).
   ------------------------------------------------------------------ */

export function FaceConsent({
  reduce,
  onEnable,
  onDecline,
  onBack,
}: {
  reduce: boolean;
  onEnable: () => void;
  onDecline: () => void;
  onBack: () => void;
}) {
  const c = faceFit.consent;
  const Wrap = reduce ? "div" : motion.div;
  const anim = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16, filter: "blur(6px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        transition: { duration: 0.5, ease: EASE },
      };

  return (
    <Wrap
      {...anim}
      className="mx-auto max-w-xl"
      role="group"
      aria-labelledby="face-consent-title"
    >
      {/* Назад к выбору пути */}
      <button
        type="button"
        onClick={onBack}
        className="group mb-8 inline-flex items-center gap-2 text-sm text-graphite transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span
          aria-hidden
          className="transition-transform duration-200 group-hover:-translate-x-0.5"
        >
          ←
        </span>
        {faceFit.camera.backToChoose}
      </button>

      {/* Иконка-«глаз» тонкой линией — мотив оптики, не свечение */}
      <svg
        viewBox="0 0 48 28"
        aria-hidden="true"
        className="h-7 w-12 text-brand"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 14 C 10 4, 38 4, 46 14 C 38 24, 10 24, 2 14 Z" />
        <circle cx="24" cy="14" r="5" />
      </svg>

      <h3
        id="face-consent-title"
        className="mt-6 font-serif text-2xl font-light leading-snug text-ink sm:text-3xl"
      >
        {c.title}
      </h3>

      {/* Три пункта тонкими линиями-разделителями */}
      <ul className="mt-8 border-t border-line">
        {c.points.map((point) => (
          <li
            key={point}
            className="flex items-center gap-3 border-b border-line py-4 text-sm leading-relaxed text-graphite sm:text-base"
          >
            <span aria-hidden className="h-px w-5 shrink-0 bg-brand" />
            {point}
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-md text-sm leading-relaxed text-graphite/80">
        {c.note}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button onClick={onEnable}>{c.enable}</Button>
        <button
          type="button"
          onClick={onDecline}
          className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {c.decline}
        </button>
      </div>
    </Wrap>
  );
}

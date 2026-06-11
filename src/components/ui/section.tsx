import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Тональная шкала фонов: offwhite — основной тёплый фон страницы,
 * paper — чистый белый «лист» с волосяными границами (тихая глубина),
 * ink — почти-чёрный акцентный блок.
 */
const tones = {
  offwhite: "",
  paper: "bg-paper border-y border-line",
  ink: "bg-ink text-paper",
} as const;

export type SectionTone = keyof typeof tones;

/** Секция с единым вертикальным ритмом (много «воздуха»). */
export function Section({
  children,
  id,
  className,
  tone = "offwhite",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: SectionTone;
}) {
  return (
    <section
      id={id}
      className={cn("py-24 sm:py-32 lg:py-40", tones[tone], className)}
    >
      {children}
    </section>
  );
}

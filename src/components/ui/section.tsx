import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DrawnBorder } from "@/components/ui/drawn-border";

/**
 * Тональная шкала фонов: offwhite — основной тёплый фон страницы,
 * paper — чистый белый «лист» с волосяными границами (тихая глубина),
 * ink — почти-чёрный акцентный блок.
 * У paper-секций верхняя граница РИСУЕТСЯ при входе во вьюпорт
 * (DrawnBorder, один раз); нижняя — статичная.
 */
const tones = {
  offwhite: "",
  paper: "relative border-b border-line bg-paper",
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
      {tone === "paper" && <DrawnBorder />}
      {children}
    </section>
  );
}

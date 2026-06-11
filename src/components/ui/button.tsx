import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary";

// Общее: типографика, плавность, фокус. Геометрию (радиус/отступы/фон)
// задаёт каждый вариант отдельно — чтобы они не конфликтовали при склейке.
const base =
  "group inline-flex items-center justify-center gap-2 text-sm font-medium tracking-wide transition-all duration-300 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-offwhite";

const variants: Record<Variant, string> = {
  // Прямоугольная, малый радиус 4px, компактнее по высоте.
  // Заливка brand-deep (#D40000, контраст AA); hover — затемнение + сдвиг вверх.
  primary:
    "rounded-[4px] px-7 py-2.5 bg-brand-deep text-white active:scale-[0.98] hover:bg-brand-dark hover:-translate-y-px",
  // Текст с анимированным подчёркиванием, без заливки и рамки.
  secondary: "relative px-0 py-1 text-ink hover:text-ink",
};

/**
 * Кнопка-ссылка (или обычная кнопка).
 * primary — прямоугольная красная (общий стиль всех CTA-кнопок сайта).
 * secondary — текст с подчёркиванием, вырастающим слева направо при наведении.
 */
export function Button({
  children,
  href,
  variant = "primary",
  className,
  type = "button",
  disabled = false,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const classes = cn(base, variants[variant], className);

  const inner = (
    <>
      {children}
      {variant === "secondary" && (
        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-brand transition-transform duration-300 ease-soft group-hover:scale-x-100" />
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes} aria-label={ariaLabel}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type={type}
      className={cn(classes, disabled && "pointer-events-none opacity-60")}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {inner}
    </button>
  );
}

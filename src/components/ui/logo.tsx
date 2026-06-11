import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * Фирменный логотип «Оптимист» (настоящие PNG из brand/, не имитация шрифтом).
 * - onDark=false → тёмные буквы, для светлого фона
 * - onDark=true  → светлые буквы, для тёмного фона
 *
 * variant:
 * - "mark" — знак БЕЗ подписи «САЛОН ОПТИКИ». Подпись при высоте шапки ~44px
 *   превращается в нечитаемые 7px — поэтому в шапке знак без подписи.
 * - "full" — полный логотип с подписью (подвал, где он крупный).
 *
 * Высоту задаёт caller через className (например, h-12); ширина — авто,
 * чтобы соотношение сторон сохранялось и логотип не искажался.
 * sizes + quality заданы так, чтобы next/image отдавал точно подходящую
 * по размеру (с запасом под retina) и резкую картинку, без мыла от даунскейла.
 */

type Variant = "mark" | "full";

// Реальные размеры файлов после обрезки прозрачных полей
const SIZES: Record<Variant, { w: number; h: number }> = {
  mark: { w: 3607, h: 1065 },
  full: { w: 3607, h: 1109 },
};

const SRC: Record<Variant, { light: string; dark: string }> = {
  // light/dark — про цвет БУКВ: dark-файл для светлого фона и наоборот
  mark: { dark: "/logo-mark-dark.png", light: "/logo-mark-light.png" },
  full: { dark: "/logo-dark.png", light: "/logo-light.png" },
};

export function Logo({
  className,
  onDark = false,
  priority = false,
  variant = "mark",
}: {
  className?: string;
  onDark?: boolean;
  priority?: boolean;
  variant?: Variant;
}) {
  return (
    <Image
      src={onDark ? SRC[variant].light : SRC[variant].dark}
      alt="Оптимист — салон оптики"
      width={SIZES[variant].w}
      height={SIZES[variant].h}
      priority={priority}
      quality={90}
      sizes="(min-width: 640px) 180px, 150px"
      className={cn("w-auto", className)}
    />
  );
}

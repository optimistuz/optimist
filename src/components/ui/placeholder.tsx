import { cn } from "@/lib/cn";

/**
 * Аккуратная заглушка вместо фото: мягкий нейтральный градиент + блик +
 * едва заметная подпись. Выглядит дорого даже без изображения.
 * Заполняет родителя — позже легко заменить на <Image fill .../>.
 */
export function Placeholder({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ?? "Изображение"}
      className={cn(
        "relative h-full w-full overflow-hidden bg-gradient-to-br from-[#ece8e0] via-[#e6e1d8] to-[#d8d2c7]",
        className
      )}
    >
      {/* мягкий диагональный блик */}
      <div className="pointer-events-none absolute -left-1/3 top-0 h-full w-2/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      {/* тонкая внутренняя рамка — «дорогой» край */}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.06]" />
      {label && (
        <span className="absolute bottom-4 left-4 z-10 text-[10px] font-medium uppercase tracking-[0.25em] text-ink/30">
          {label}
        </span>
      )}
    </div>
  );
}

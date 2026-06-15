/**
 * Шесть форм лица — циркульной линией в стиле чертежа «Мастерской».
 * Используется и в квизе (5 форм), и в ручной правке подбора по лицу
 * (+ ромб). Чистый presentational-компонент без состояния.
 */
export function FaceIcon({
  shape,
  className = "h-14 w-12 sm:h-16 sm:w-14",
}: {
  shape: string;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 64 80" aria-hidden="true" className={className}>
      {shape === "oval" && <ellipse cx="32" cy="40" rx="18" ry="30" {...common} />}
      {shape === "round" && <circle cx="32" cy="40" r="25" {...common} />}
      {shape === "square" && (
        <rect x="9" y="14" width="46" height="52" rx="16" {...common} />
      )}
      {shape === "heart" && (
        <path
          d="M10 28 C10 16 24 14 32 22 C40 14 54 16 54 28 C54 46 44 60 32 74 C20 60 10 46 10 28 Z"
          {...common}
        />
      )}
      {shape === "long" && <ellipse cx="32" cy="40" rx="15" ry="34" {...common} />}
      {shape === "diamond" && (
        <path d="M32 8 L55 40 L32 72 L9 40 Z" {...common} />
      )}
    </svg>
  );
}

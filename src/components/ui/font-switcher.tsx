"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Временный инструмент выбора типографики; после решения владельца
 * лишние шрифты и переключатель удалить.
 * Подключается в layout.tsx только при NODE_ENV === "development".
 */

const FONTS = [
  { label: "Cormorant", value: "var(--font-cormorant)" },
  { label: "Prata", value: "var(--font-prata)" },
  { label: "Jost", value: "var(--font-jost)" },
];

export default function FontSwitcher() {
  const [active, setActive] = useState(FONTS[0].value);

  const apply = (value: string) => {
    document.documentElement.style.setProperty("--font-display", value);
    setActive(value);
  };

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-1 rounded-full border border-line bg-paper/90 p-1 shadow-[0_4px_16px_-8px_rgba(13,13,13,0.25)] backdrop-blur-sm">
      {FONTS.map((font) => (
        <button
          key={font.label}
          type="button"
          onClick={() => apply(font.value)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-medium transition-colors duration-200",
            active === font.value
              ? "bg-ink text-paper"
              : "text-graphite hover:text-ink"
          )}
        >
          {font.label}
        </button>
      ))}
    </div>
  );
}

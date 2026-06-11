/** Крошечный помощник для склейки классов Tailwind (отбрасывает пустые/ложные). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

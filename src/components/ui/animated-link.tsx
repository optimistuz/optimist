"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Ссылка с тонким подчёркиванием, вырастающим слева направо при наведении.
 * active — постоянное подчёркивание (текущая секция) + aria-current.
 *
 * ⚠️ ЯКОРЬ ЗНАЕТ, ГДЕ СТОИТ (CLAUDE.md, «Витрина» п. 7: хром route-aware).
 * Секции `#about`, `#salons`, `#hero` живут только на «/». Вне её голый
 * якорь означает «/privacy#salons» — адрес без такого якоря. Левый клик
 * спасал `smooth-scroll` (цели нет → уводил на главную), но средний клик,
 * Ctrl+клик, «копировать адрес ссылки» и краулер получали битую ссылку
 * (поймал `fizik`: шапка закон исполнила, подвал — нет).
 *
 * Починка живёт ЗДЕСЬ, а не в подвале: `AnimatedLink` — единственная общая
 * точка обоих, и его JS уже едет на «/» (им пользуется шапка). Отдельный
 * клиентский компонент для подвала стоил бы бандла на ровном месте, а его
 * на «/» остался 1 КБ (docs/perf-budgets.md).
 *
 * Абсолютные адреса (соцсети, tel:, mailto:) и уже готовые «/#…» из шапки
 * не трогаются — условие смотрит ровно на ведущую решётку.
 */
export function AnimatedLink({
  href,
  children,
  className,
  onClick,
  active = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const pathname = usePathname();
  const resolved = href.startsWith("#") && pathname !== "/" ? `/${href}` : href;

  return (
    <a
      href={resolved}
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative inline-block rounded-sm text-ink/70 transition-colors duration-300 hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-4 focus-visible:ring-offset-offwhite",
        active && "text-ink",
        className
      )}
    >
      {children}
      <span
        className={cn(
          "absolute -bottom-1 left-0 h-px w-full origin-left bg-brand transition-transform duration-300 ease-soft group-hover:scale-x-100 group-focus-visible:scale-x-100",
          active ? "scale-x-100" : "scale-x-0"
        )}
      />
    </a>
  );
}

import { cn } from "@/lib/cn";

export type Crumb = { label: string; href?: string };

/**
 * Хлебная крошка-волосок для маршрутов витрины (CLAUDE.md, «Витрина» п. 7:
 * на маршрутах витрины — крошка вместо «Шкалы наводки», которая живёт на «/»).
 *
 * Серверный компонент: разметка статична, в клиентский бандл не уезжает.
 * Ссылки — обычный `<a>` (сквозная навигация); next/link в проекте не
 * используется нигде — он тащит роутер в критический путь.
 *
 * Последний пункт — текущая страница: не ссылка, `aria-current="page"`.
 */
export function Breadcrumb({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Хлебные крошки"
      className={cn(
        "text-xs uppercase tracking-[0.15em] text-ink/45",
        className
      )}
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-x-2">
              {item.href && !last ? (
                <a
                  href={item.href}
                  className="transition-colors hover:text-brand"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "text-ink/70" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <span aria-hidden className="text-ink/25">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

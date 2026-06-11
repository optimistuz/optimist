import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Ссылка с тонким подчёркиванием, вырастающим слева направо при наведении.
 * active — постоянное подчёркивание (текущая секция) + aria-current.
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
  return (
    <a
      href={href}
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

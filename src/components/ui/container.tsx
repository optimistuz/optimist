import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Центрирование контента + адаптивные боковые отступы. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-shell px-6 sm:px-8 lg:px-12",
        className
      )}
    >
      {children}
    </div>
  );
}

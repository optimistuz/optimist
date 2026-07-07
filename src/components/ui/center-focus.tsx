"use client";

import { useRef, type ReactNode } from "react";
import { useCenterFocus } from "@/lib/use-center-focus";

/**
 * Тонкий клиентский слой над списком: метит `.is-centered` у элементов
 * `selector`, попавших в центр вьюпорта (тач-эквивалент фокус-идиомы,
 * см. use-center-focus). Контент остаётся серверным — сюда передаётся
 * как children, клиентским становится только эта обёртка.
 */
export function CenterFocus({
  selector,
  className,
  children,
}: {
  selector: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCenterFocus(ref, selector);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

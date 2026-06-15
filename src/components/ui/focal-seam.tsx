"use client";

import { motion } from "motion/react";
import { Container } from "@/components/ui/container";
import { EASE } from "@/lib/motion";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { cn } from "@/lib/cn";

/**
 * «Шов наводки» — переход между ГЛАВАМИ в грамматике сайта (наведение
 * резкости). Волосок наводится из центра к краям, в центре — фокус-метка
 * в виде линзы (кольцо со зрачком brand): тот же оптический мотив, что у
 * кнопки навигации, — связывает систему. Метка проявляется из расфокуса
 * (blur → 0). Это НЕ вечная анимация — одноразовое появление при входе во
 * вьюпорт. Мотив работает редкостью: ставить только на стыках глав.
 *
 * tone="dark" — для светлой метки над тёмными секциями.
 */
export function FocalSeam({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const reduce = useReduceAfterMount();
  const line = tone === "dark" ? "bg-paper/20" : "bg-line";
  const ring = tone === "dark" ? "border-paper/45" : "border-ink/30";

  const lens = (
    <span
      className={cn(
        "relative flex h-3.5 w-3.5 items-center justify-center rounded-full border",
        ring
      )}
    >
      <span className="h-1 w-1 rounded-full bg-brand" />
    </span>
  );

  if (reduce) {
    return (
      <div aria-hidden className={cn("py-7 sm:py-9", className)}>
        <Container>
          <div className="mx-auto flex max-w-xl items-center justify-center gap-3">
            <span className={cn("h-px flex-1", line)} />
            {lens}
            <span className={cn("h-px flex-1", line)} />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div aria-hidden className={cn("py-7 sm:py-9", className)}>
      <Container>
        <motion.div
          className="mx-auto flex max-w-xl items-center justify-center gap-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
        >
          <motion.span
            className={cn("h-px flex-1 origin-right", line)}
            variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
            transition={{ duration: 0.9, ease: EASE }}
          />
          <motion.span
            className="shrink-0"
            variants={{
              hidden: { opacity: 0, scale: 0.82, filter: "blur(5px)" },
              visible: { opacity: 1, scale: 1, filter: "blur(0px)" },
            }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.28 }}
          >
            {lens}
          </motion.span>
          <motion.span
            className={cn("h-px flex-1 origin-left", line)}
            variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        </motion.div>
      </Container>
    </div>
  );
}

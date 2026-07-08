import { useEffect, useRef, useState } from "react";

/**
 * Общий per-line механизм «прочитано» для скролл-титров (этап 3) и
 * «Зоны ясного зрения» (этап 4).
 *
 * Возвращает `registers` — массив СТАБИЛЬНЫХ callback-ref'ов (по одному на
 * строку) и `read` — булев массив «строка прочитана».
 *
 * Как только строка проходит центральную полосу вьюпорта, IntersectionObserver
 * (once) вешает на неё класс `.line-read` и выставляет `read[i] = true`. В
 * globals.css `.scroll-titre.line-read` = резкое состояние + `animation: none`,
 * поэтому прочитанная строка НЕ возвращается в расфокус при скролле назад.
 * `read[i]` нужен фолбэк-ветке (Motion useScroll) — она замораживает строку
 * резкой по этому флагу (CSS-класс inline-стиль Motion не переспорит).
 *
 * Наблюдение снимается сразу после метки (once). Слушатель один на секцию.
 */
export function useReadLines(count: number): {
  registers: ((el: HTMLElement | null) => void)[];
  read: boolean[];
} {
  const els = useRef<(HTMLElement | null)[]>(Array(count).fill(null));
  const ioRef = useRef<IntersectionObserver | null>(null);
  const [read, setRead] = useState<boolean[]>(() => Array(count).fill(false));

  // Стабильные callback-ref'ы: сами (раз)наблюдают строку при (пере)монтаже
  // (нужно, т.к. фолбэк-ветка меняет <p> на motion.p уже после первого маунта).
  const registers = useRef(
    Array.from({ length: count }, (_, i) => (el: HTMLElement | null) => {
      const prev = els.current[i];
      if (prev && ioRef.current) ioRef.current.unobserve(prev);
      els.current[i] = el;
      if (el && ioRef.current && !el.classList.contains("line-read")) {
        ioRef.current.observe(el);
      }
    })
  ).current;

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("line-read");
          io.unobserve(e.target);
          const i = els.current.indexOf(e.target as HTMLElement);
          if (i >= 0) {
            setRead((prev) =>
              prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))
            );
          }
        }
      },
      // Тонкая полоса у центра вьюпорта: строка «прочитана», проходя центр.
      { rootMargin: "-45% 0% -45% 0%", threshold: 0 }
    );
    ioRef.current = io;
    for (const el of els.current) {
      if (el && !el.classList.contains("line-read")) io.observe(el);
    }
    return () => {
      io.disconnect();
      ioRef.current = null;
    };
  }, []);

  return { registers, read };
}

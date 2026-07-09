import { useEffect, useRef, useState } from "react";

/**
 * Общий per-line механизм «прочитано» для «Зоны ясного зрения» (этап 4;
 * изначально — для скролл-титров этапа 3, ныне заменённых ClarityZone).
 *
 * Возвращает `registers` — массив СТАБИЛЬНЫХ callback-ref'ов (по одному на
 * строку), `read` — булев массив «строка прочитана», и `markRead(i)` —
 * внешний триггер (пятно ясного зрения).
 *
 * Как только строка проходит центральную полосу вьюпорта, IntersectionObserver
 * (once) вешает на неё класс `.line-read` и выставляет `read[i] = true`. В
 * globals.css `.clarity-blur.line-read` = резкое состояние, поэтому прочитанная
 * строка резка везде и не возвращается в расфокус. `read[i]` доступен и в JS
 * (ClarityZone читает его для дрейфа пятна).
 *
 * Наблюдение снимается сразу после метки (once). Слушатель один на секцию.
 */
export function useReadLines(count: number): {
  registers: ((el: HTMLElement | null) => void)[];
  read: boolean[];
  markRead: (i: number) => void;
} {
  const els = useRef<(HTMLElement | null)[]>(Array(count).fill(null));
  const ioRef = useRef<IntersectionObserver | null>(null);
  const [read, setRead] = useState<boolean[]>(() => Array(count).fill(false));

  // Внешний триггер «прочитано» (этап 4: строка прошла через пятно ясного
  // зрения раньше центра). Делает то же, что IO: метит `.line-read`, снимает
  // наблюдение, выставляет read[i]. Стабильна.
  const markRead = useRef((i: number) => {
    const el = els.current[i];
    if (el) {
      if (ioRef.current) ioRef.current.unobserve(el);
      el.classList.add("line-read");
    }
    setRead((prev) => (prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))));
  }).current;

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

  return { registers, read, markRead };
}

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * prefers-reduced-motion, но ТОЛЬКО после маунта.
 *
 * Сервер не знает пользовательского предпочтения и всегда рендерит
 * анимационную ветку. Если компонент ветвит разметку или inline-`style`
 * по reduced-motion, то под включённым «уменьшить движение» первая
 * клиентская отрисовка расходится с серверной — hydration-mismatch.
 *
 * Решение (приём из hero.tsx / FloatFrame, REPORT-3): до маунта возвращаем
 * false (= серверная, анимационная ветка), а честное значение — после
 * гидратации. Так первый клиентский кадр совпадает с серверным, а статичная
 * ветка включается следующим тиком. Вынесено в общий хук, чтобы один и тот
 * же гейт стоял во всех компонентах, ветвящих рендер по reduce.
 *
 * Использовать ТОЛЬКО там, где reduce влияет на рендер (разметку/style).
 * Для логики в эффектах берите useReducedMotion напрямую — там гейт не нужен
 * и лишь вызвал бы лишний перезапуск эффекта.
 */
export function useReduceAfterMount(): boolean {
  const prefersReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!prefersReduce;
}

import { useEffect, type RefObject } from "react";
import { useOpticalCapability } from "./use-optical-capability";

/**
 * Тач-эквивалент фокус-идиомы (этап 2, «Мобильный паритет»).
 *
 * На грубом указателе нет `:hover`, которым десктоп наводит резкость на одну
 * строку списка / логотип ленты. Здесь ту же грамматику даёт скролл: элемент,
 * попавший в ЦЕНТРАЛЬНУЮ полосу вьюпорта, получает класс `.is-centered`
 * (резкий), соседи в globals.css отступают (blur 2px + приглушение).
 *
 * Гейт — через ЕДИНЫЙ шлюз `useOpticalCapability` (закон движка №5: новые
 * эффекты не заводят собственных медиа-запросов). Эффект живёт только когда
 * `full && !pointerFine` — то есть после маунта, вне reduced-motion и на
 * грубом указателе (на `pointer: fine` работает `:hover`, поэтому молчим).
 *
 * Контейнеру навешивается позитивный маркер `.center-focus` — ТОЛЬКО пока
 * эффект активен. За счёт этого CSS-правила тач-идиомы не срабатывают ни до
 * гидратации, ни под reduce, ни на десктопе: контент там резкий/статичный.
 *
 * @param ref      контейнер (список или лента).
 * @param selector CSS-селектор наблюдаемых элементов внутри контейнера;
 *                 если не передан — наблюдается сам контейнер (лента целиком).
 *
 * Это отклик на скролл, а не вечный цикл: класс переключается вертикальным
 * скроллом страницы через IntersectionObserver, ничего не тикает в rAF.
 */
export function useCenterFocus(
  ref: RefObject<HTMLElement | null>,
  selector?: string
): void {
  const { full, pointerFine } = useOpticalCapability();
  const active = full && !pointerFine;

  useEffect(() => {
    const container = ref.current;
    if (!container || !active) return;

    const targets: Element[] = selector
      ? Array.from(container.querySelectorAll(selector))
      : [container];
    if (targets.length === 0) return;

    container.classList.add("center-focus");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle("is-centered", entry.isIntersecting);
        }
      },
      // Полоса — средние 20% вьюпорта по вертикали: элемент считается
      // «наведённым», пока пересекает центр экрана.
      { rootMargin: "-40% 0% -40% 0%", threshold: 0 }
    );
    for (const t of targets) io.observe(t);

    return () => {
      io.disconnect();
      container.classList.remove("center-focus");
      for (const t of targets) t.classList.remove("is-centered");
    };
  }, [ref, active, selector]);
}

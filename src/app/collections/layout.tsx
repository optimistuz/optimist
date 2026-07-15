import type { ReactNode } from "react";
import CatalogNav from "@/components/layout/catalog-nav";

/**
 * Лейаут маршрутов коллекций. CatalogNav (мобильная кнопка-линза навигации)
 * монтируется ЗДЕСЬ, а не в корневом layout: на «/» она не нужна (там «Шкала
 * наводки»), но её код в корневом layout стоил «/» ровно 1 КБ и съедал весь
 * остаток бюджета критического пути (196 → 197, потолок docs/perf-budgets.md).
 * В группе витрины вес несут только её маршруты — там запаса вдоволь (92 КБ).
 *
 * ⚠️ Этап 12б: маршруты `/frames/*` — тоже витрина, им нужна та же CatalogNav.
 * Либо смонтировать её в их лейауте, либо свести collections и frames под общий
 * route-group `(vitrina)` с одним лейаутом.
 */
export default function CollectionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <CatalogNav />
    </>
  );
}

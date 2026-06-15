"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "@/lib/motion";

/* ------------------------------------------------------------------
   Переход между маршрутами — «наведение резкости» при смене страницы.
   template.tsx перемонтируется на КАЖДОЙ смене маршрута (не на hash-
   навигации внутри одной страницы) — идеальный хук для enter-анимации.

   ⚠️ Главную (`/`) НЕ оборачиваем: transform/filter/opacity на обёртке
   создают stacking context и сломали бы multiply-бленд FloatFrame
   (см. CLAUDE.md, «Парящие оправы»), а у неё и так есть прелоадер «op»
   и масочные reveal'ы. Вторичные страницы (404 и будущие) FloatFrame не
   несут — там наведение резкости безопасно и уместно.

   Хром (шапка, «Шкала наводки», подвал) живёт в layout — он ВНЕ template
   и при переходе не мигает, только контент наводится на резкость.
   ------------------------------------------------------------------ */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (pathname === "/") return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(8px)", y: 14, scale: 0.992 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

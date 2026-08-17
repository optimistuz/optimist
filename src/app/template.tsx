"use client";

import { useEffect, useState, type ReactNode } from "react";
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

   ⚠️ ЭТО ФОЛБЭК, А НЕ ОСНОВНОЙ ПУТЬ (этап 8). Рэк-фокус маршрутов делает
   БРАУЗЕР — междокументными View Transitions (`@view-transition` в
   globals.css, ноль JavaScript). Там, где они есть, эта анимация обязана
   молчать: иначе резкость наводится ДВАЖДЫ — сперва снимком перехода,
   потом ещё раз этой обёрткой. Живой она остаётся для браузеров без
   междокументных VT (сегодня — Firefox), и там ничего не изменилось.
   ------------------------------------------------------------------ */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  /* Фиче-детект междокументных VT. Признак — `pagereveal`: это событие
     нового документа, которое несёт объект перехода, и есть оно РОВНО у тех
     браузеров, что умеют анимировать смену документа. `startViewTransition`
     таким признаком НЕ является: он есть и там, где работают только
     внутристраничные переходы, и фолбэк выключился бы зря.

     Ветвление — ПОСЛЕ маунта (закон гидрации CLAUDE.md): на сервере и в
     первом клиентском рендере состояние одинаково, разметка совпадает.
     Гасится не сам эффект, а его ДЛИТЕЛЬНОСТЬ — узел не пересоздаётся,
     дети не перемонтируются. */
  const [browserVT, setBrowserVT] = useState(false);
  useEffect(() => {
    if ("onpagereveal" in window) setBrowserVT(true);
  }, []);

  if (pathname === "/") return <>{children}</>;

  return (
    <motion.div
      /* Страховка без JS: Motion сериализует `initial` в SSR, и без
         гидратации страница осталась бы невидимой (opacity 0). Класс
         доводит обёртку до конечного состояния через 5 с — юридический
         документ обязан читаться и с мёртвым JavaScript (см. globals.css). */
      className="route-enter-failsafe"
      initial={{ opacity: 0, filter: "blur(8px)", y: 14, scale: 0.992 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0, scale: 1 }}
      transition={{ duration: reduce || browserVT ? 0 : 0.6, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

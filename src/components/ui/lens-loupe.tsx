"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useOpticalCapability } from "@/lib/use-optical-capability";
import type { PointerProbe } from "@/components/gl/lens-types";

/* ------------------------------------------------------------------
   ЛУПА-ЛИНЗА — ТРИГГЕР И ПОВЕРХНОСТЬ ЖЕСТОВ (этап 5).
   Здесь НЕТ ни линзы, ни лупы: только «где палец» и «пора грузить».

   ⚠️ ЗАЧЕМ РАСЩЕПЛЕНИЕ. Карточки Collections живут на «/», а бюджет
   критического пути главной израсходован почти целиком (реестр
   docs/perf-budgets.md). Полный диспетчер линзы — long-press, wheel-зум,
   SVG-обод, CSS-фолбэк — стоил критическому пути ~0,8 КБ gz ЕЩЁ ДО
   всякого ogl (замерено `next build` до и после). Нужен он ровно тому,
   кто навёл курсор или задержал палец: до первого касания этот код не
   нужен НИКОМУ.

   ⚠️ ПОЧЕМУ ТРИГГЕР НЕ ИСЧЕЗАЕТ, А ОСТАЁТСЯ ПОВЕРХНОСТЬЮ. Если подменить
   его реализацией, та смонтируется, когда указатель УЖЕ внутри: ни
   `pointerenter`, ни начавшийся `pointerdown` она не увидит, и линза не
   появится, пока человек не подвигает рукой заново. Поэтому обработчики
   остаются здесь (они дёшевы — три записи в ref), а тяжёлая часть читает
   этот ref и ничего не знает о событиях.

   Ветвление — через единый шлюз `useOpticalCapability` (закон №5);
   локального matchMedia здесь больше нет. `reduce` → не рендерим ничего.
   ------------------------------------------------------------------ */

const LensImpl = dynamic(
  () => import("@/components/gl/lens-impl").then((m) => m.LensImpl),
  { ssr: false }
);

export function LensLoupe({ src }: { src: string }) {
  const { full } = useOpticalCapability();
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);

  const probe = useRef<PointerProbe>({
    x: 0,
    y: 0,
    inside: false,
    down: false,
    downAt: 0,
    drift: 0,
    touch: false,
  });

  const arm = () => {
    if (armedRef.current) return;
    armedRef.current = true;
    setArmed(true);
  };

  const write = (e: React.PointerEvent, patch: Partial<PointerProbe>) => {
    const p = probe.current;
    p.x = e.clientX;
    p.y = e.clientY;
    p.touch = e.pointerType !== "mouse";
    Object.assign(p, patch);
  };

  if (!full) return null; // выбор пользователя «меньше движения» — линзы нет

  return (
    <div
      aria-hidden
      className="absolute inset-0 z-20"
      onPointerEnter={(e) => {
        write(e, { inside: true });
        if (e.pointerType === "mouse") arm();
      }}
      onPointerLeave={(e) => write(e, { inside: false, down: false })}
      onPointerMove={(e) => {
        const p = probe.current;
        if (p.down) p.drift += Math.hypot(e.clientX - p.x, e.clientY - p.y);
        write(e, {});
      }}
      onPointerDown={(e) => {
        write(e, { down: true, downAt: performance.now(), drift: 0, inside: true });
        arm(); // грузим, пока палец держится: чанк успеет к сроку long-press
      }}
      onPointerUp={(e) => write(e, { down: false })}
      onPointerCancel={(e) => write(e, { down: false, inside: false })}
      // Тач-скролл по карточке не отнимаем: долгое нажатие ловится по времени.
      style={{ touchAction: "pan-y" }}
    >
      {armed && <LensImpl src={src} probe={probe} />}
    </div>
  );
}

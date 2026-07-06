import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Единый шлюз способностей устройства — закон движка №5 (CLAUDE.md).
 * Новые эффекты НЕ заводят собственных matchMedia: они спрашивают этот хук.
 *
 * Возвращает два флага с РАЗНОЙ природой:
 *
 * - `full` — включён ли ПОЛНЫЙ оптический опыт. Сейчас
 *   `mounted && !reduce && desktopMatch`, где
 *   desktopMatch = «(pointer: fine) and (min-width: 1024px)».
 *   desktopMatch на ЭТОМ этапе (1) СОХРАНЯЕТСЯ — это чистый рефакторинг без
 *   смены поведения. Снимается ОДНИМ изменением здесь на этапе 2 (мобильный
 *   паритет). Это ЕДИНАЯ точка отката: если реальный парк устройств просядет,
 *   условие возвращается сюда и только сюда.
 *
 * - `pointerFine` — «(pointer: fine)», признак ПРИРОДЫ ввода, НЕ perf-гейт.
 *   Им гейтятся drag, cursorTilt, magnetic (на грубом указателе они ломали бы
 *   UX). Этот флаг НЕ снимается на этапе 2 — природа ввода не меняется от
 *   политики производительности.
 *
 * Паттерн mounted-гейта — как в useReduceAfterMount: сервер не знает ни
 * reduced-motion, ни типа указателя и всегда рендерит анимационную ветку;
 * до маунта возвращаем false/false (совпадает с сервером), честные значения —
 * после гидратации. Так первый клиентский кадр не расходится с серверным.
 */
export interface OpticalCapability {
  full: boolean;
  pointerFine: boolean;
}

export function useOpticalCapability(): OpticalCapability {
  const prefersReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);
  const [desktopMatch, setDesktopMatch] = useState(false);

  useEffect(() => {
    setMounted(true);
    const fineMq = window.matchMedia("(pointer: fine)");
    // desktopMatch — единая точка отката (снимается этапом 2)
    const deskMq = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
    const update = () => {
      setPointerFine(fineMq.matches);
      setDesktopMatch(deskMq.matches);
    };
    update();
    fineMq.addEventListener("change", update);
    deskMq.addEventListener("change", update);
    return () => {
      fineMq.removeEventListener("change", update);
      deskMq.removeEventListener("change", update);
    };
  }, []);

  const reduce = mounted && !!prefersReduce;
  return {
    full: mounted && !reduce && desktopMatch,
    pointerFine: mounted && pointerFine,
  };
}

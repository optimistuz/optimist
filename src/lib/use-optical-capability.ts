import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Единый шлюз способностей устройства — закон движка №5 (CLAUDE.md).
 * Новые эффекты НЕ заводят собственных matchMedia: они спрашивают этот хук.
 *
 * Возвращает два флага с РАЗНОЙ природой:
 *
 * - `full` — включён ли ПОЛНЫЙ оптический опыт: `mounted && !reduce`.
 *   С этапа 2 (мобильный паритет) телефон получает полный опыт наравне с
 *   десктопом — `desktopMatch` снят. Это ЕДИНАЯ точка отката: если реальный
 *   парк устройств просядет, perf-гейт возвращается ТОЛЬКО сюда (дописать
 *   обратно `&& matchMedia("(min-width:1024px)").matches`), и больше нигде.
 *
 * - `pointerFine` — «(pointer: fine)», признак ПРИРОДЫ ввода, НЕ perf-гейт.
 *   Им гейтятся drag, cursorTilt, magnetic (на грубом указателе они ломали бы
 *   UX). Природа ввода не меняется от политики производительности — этот флаг
 *   этапом 2 НЕ снимается.
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

  useEffect(() => {
    setMounted(true);
    const fineMq = window.matchMedia("(pointer: fine)");
    const update = () => setPointerFine(fineMq.matches);
    update();
    fineMq.addEventListener("change", update);
    return () => fineMq.removeEventListener("change", update);
  }, []);

  const reduce = mounted && !!prefersReduce;
  return {
    full: mounted && !reduce,
    pointerFine: mounted && pointerFine,
  };
}

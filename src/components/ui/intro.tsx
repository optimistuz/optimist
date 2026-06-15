"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";

const IntroContext = createContext(false);

/** true, когда интро завершено (или его не было) — hero можно играть. */
export function useIntroDone() {
  return useContext(IntroContext);
}

// useLayoutEffect нельзя вызывать при SSR — на сервере подменяем на useEffect
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Phase = "pending" | "playing" | "done";

/**
 * Решение «играть или нет» принимается ОДИН раз за загрузку страницы и
 * кэшируется на уровне модуля (StrictMode в dev-режиме гоняет эффекты
 * дважды — без кэша интро гасло само).
 *
 * Правило показа:
 * - перезагрузка (F5, хард-ресет) — играет ВСЕГДА. Важно: смотреть надо
 *   на тип навигации, а не на referrer — перезагрузка сохраняет referrer
 *   исходного перехода, и после одного внутреннего перехода интро
 *   глушилось бы навсегда;
 * - обычный переход — играет, только если пришли извне (прямой набор
 *   адреса, закладка, внешняя ссылка). Внутренний переход (referrer
 *   того же origin — например, «Вернуться к ясности» с 404) не играет;
 * - возврат по истории (back/forward) — не играет.
 */
let decision: Exclude<Phase, "pending"> | null = null;

function decideIntro(): Exclude<Phase, "pending"> {
  if (decision) return decision;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let play = true;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const type = nav?.type ?? "navigate";
    if (type === "reload") {
      play = true;
    } else if (type === "back_forward") {
      play = false;
    } else {
      play = !(
        document.referrer !== "" &&
        new URL(document.referrer).origin === window.location.origin
      );
    }
  } catch {
    play = true; // API недоступен — считаем заход внешним
  }
  decision = reduced || !play ? "done" : "playing";
  return decision;
}

/**
 * Прелоадер «op»: знак рисуется обводкой, моргает и растворяется (≤1,8 с).
 * Клик — пропуск; reduced-motion — без интро.
 *
 * SSR всегда рендерит оверлей (фон совпадает с фоном страницы — вспышки нет).
 * До первого кадра на клиенте решаем: внутренний переход или reduced-motion →
 * оверлей немедленно размонтируется и introDone = true с первого кадра.
 */
export function IntroProvider({ children }: { children: ReactNode }) {
  // Интро — атрибут ТОЛЬКО главной страницы: на остальных (404 и будущих)
  // оверлей не рендерится даже на сервере
  const isHome = usePathname() === "/";
  const [phase, setPhase] = useState<Phase>("pending");

  useIsomorphicLayoutEffect(() => {
    setPhase(isHome ? decideIntro() : "done");
  }, [isHome]);

  // СТРАХОВКА ЗАВЕРШЕНИЯ ИНТРО (исправляет «первый заход — контент скрыт»).
  // Весь hero ждёт introDone (phase === "done"). Если прелоадер по любой
  // причине не доиграл до done — холодная dev-компиляция, прерванная/не
  // запустившаяся анимация оверлея, фоновая вкладка, медленная сеть — флаг
  // оставался "playing", а CSS-страховка прячет лишь сам оверлей (не флипает
  // introDone), и контент застревал скрытым до рефреша. Жёсткий таймаут
  // гарантирует: контент появится максимум через ~2,2 с в любом случае.
  useEffect(() => {
    if (phase === "done") return;
    const t = window.setTimeout(() => setPhase("done"), 2200);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <IntroContext.Provider value={phase === "done"}>
      {isHome && phase !== "done" && (
        <IntroOverlay
          playing={phase === "playing"}
          onDone={() => setPhase("done")}
        />
      )}
      {children}
    </IntroContext.Provider>
  );
}

/* Тайминг сценария (сумма ≤ 1,8 с):
   o 0→0.45 · чаша p 0.30→0.75 (перекрытие −0.15) · ножка 0.75→1.05 ·
   зрачки «вспыхивают» 0.85→1.05 · моргание (scaleY 0.08 и обратно)
   1.05→1.31 · пауза · растворение 1.4→1.8 */
const BLINK = {
  delay: 1.05,
  duration: 0.26,
  times: [0, 0.5, 1],
  ease: "easeInOut" as const,
};

/** Зрачок: красная точка по центру глаза, лёгкий pop с перелётом. */
function Pupil({ cx }: { cx: number }) {
  return (
    <motion.circle
      cx={cx}
      cy="62"
      r="10"
      fill="#FD0000"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.2, 1], opacity: 1 }}
      transition={{
        scale: { delay: 0.85, duration: 0.2, times: [0, 0.7, 1], ease: "easeOut" },
        opacity: { delay: 0.85, duration: 0.08 },
      }}
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
    />
  );
}

function IntroOverlay({
  playing,
  onDone,
}: {
  playing: boolean;
  onDone: () => void;
}) {
  return (
    <motion.div
      aria-hidden="true"
      onClick={onDone}
      initial={{ opacity: 1 }}
      animate={playing ? { opacity: 0 } : undefined}
      transition={{ delay: 1.4, duration: 0.4, ease: EASE }}
      onAnimationComplete={onDone}
      className={cn(
        "fixed inset-0 z-[60] grid cursor-pointer place-items-center bg-offwhite",
        // Страховка до гидратации: JS не пришёл за ~5 с → оверлей
        // растворяется чистым CSS и открывает серверный контент
        !playing && "intro-failsafe"
      )}
    >
      {playing && (
        // Знак «op» — мотив логотипа (обводка), не его замена
        <svg
          viewBox="0 0 260 150"
          fill="none"
          className="h-auto w-64 sm:w-80"
        >
          {/* Глаз «o»: моргает группа целиком — зрачок сжимается с веком */}
          <motion.g
            animate={{ scaleY: [1, 0.08, 1] }}
            transition={{ scaleY: BLINK }}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          >
            <motion.circle
              cx="70"
              cy="62"
              r="45"
              stroke="#FD0000"
              strokeWidth="6"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, ease: EASE }}
            />
            <Pupil cx={70} />
          </motion.g>
          {/* Глаз — чаша «p» */}
          <motion.g
            animate={{ scaleY: [1, 0.08, 1] }}
            transition={{ scaleY: BLINK }}
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
          >
            <motion.circle
              cx="180"
              cy="62"
              r="45"
              stroke="#FD0000"
              strokeWidth="6"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.3, duration: 0.45, ease: EASE }}
            />
            <Pupil cx={180} />
          </motion.g>
          <motion.line
            x1="135"
            y1="62"
            x2="135"
            y2="146"
            stroke="#FD0000"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.75, duration: 0.3, ease: EASE }}
          />
        </svg>
      )}
    </motion.div>
  );
}

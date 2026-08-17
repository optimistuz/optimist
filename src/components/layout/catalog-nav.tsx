"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "@/components/smooth-scroll";
import { EASE } from "@/lib/motion";

/**
 * Навигация каталога — мобильная кнопка-линза на маршрутах витрины.
 *
 * «Шкала наводки» (section-rail) живёт ТОЛЬКО на «/»: её точки суть секции
 * главной. А на мобиле рейл был ЕДИНСТВЕННОЙ навигацией (бургер шапки убран),
 * и маршрут витрины остался бы без навигации вовсе (CLAUDE.md, «Витрина» п. 7).
 * Здесь — тот же жест линзы, но пункты ведут между контурами. Десктоп-навигацию
 * на этих маршрутах даёт шапка (route-aware якоря → «/#…»).
 *
 * Пункты — обычный `<a>` (сквозная навигация); next/link в проекте не живёт.
 */
const ITEMS = [
  { label: "Главная", href: "/" },
  { label: "Коллекции", href: "/collections/optical" },
  { label: "Запись", href: "/#cta" },
  { label: "Салоны", href: "/#salons" },
];

export default function CatalogNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const lenis = useLenis();
  const isCatalog =
    pathname.startsWith("/collections") || pathname.startsWith("/frames");

  // Стоп-скролл фона + закрытие по Escape — как у листа «Шкалы наводки».
  // body.overflow — страховка для reduced-motion (там Lenis не создаётся).
  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      lenis?.start();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, lenis]);

  // Ранний возврат — ПОСЛЕ всех хуков (порядок хуков неизменен между рендерами).
  if (!isCatalog) return null;

  return (
    <div className="lg:hidden">
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Навигация каталога"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: EASE }}
            // vt-catalog-lens — своё имя снимка VT (хром витрины вне
            // рэк-фокуса root). Отличается от vt-rail-lens намеренно: узлы
            // живут на разных маршрутах, общее имя дало бы морф там, где
            // кнопки разного назначения.
            className="vt-catalog-lens glass-dark glass-sheen fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-paper"
          >
            {/* «Линза» — кольцо со зрачком (мотив оптики, не гамбургер) */}
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-paper/85">
              <span className="h-2 w-2 rounded-full bg-brand" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="fixed inset-0 z-[55] flex flex-col bg-offwhite/55 backdrop-blur-xl backdrop-saturate-150 motion-reduce:bg-offwhite/95 motion-reduce:backdrop-blur-none"
          >
            <div className="flex items-center justify-between px-8 pt-8">
              <span className="text-xs uppercase tracking-eyebrow text-graphite">
                Навигация
              </span>
              <button
                type="button"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
                className="relative flex h-10 w-10 items-center justify-center"
              >
                <span className="absolute h-px w-6 rotate-45 bg-ink" />
                <span className="absolute h-px w-6 -rotate-45 bg-ink" />
              </button>
            </div>

            <nav
              aria-label="Навигация каталога"
              className="flex flex-1 flex-col justify-center gap-0.5 px-8"
            >
              {ITEMS.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.45,
                    ease: EASE,
                    delay: 0.08 + i * 0.035,
                  }}
                  className="flex items-center gap-3 py-1 font-serif text-3xl text-ink/70 transition-colors hover:text-ink"
                >
                  <span className="h-px w-5 shrink-0 bg-ink/20" />
                  {item.label}
                </motion.a>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

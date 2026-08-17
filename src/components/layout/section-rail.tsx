"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { useLenis } from "@/components/smooth-scroll";
import { sections } from "@/content/home";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * «Шкала наводки» — сквозная навигация поверх всего сайта.
 *
 * Идиома: навигация ведёт себя как диоптрийная линейка симулятора «Зрение».
 * Текущая секция — резкая красная засечка, соседние отступают (фокус-идиома).
 * Непрерывный волосок-прогресс справа показывает позицию чтения (привязан
 * к скроллу — не бесконечная анимация, останавливается вместе со скроллом).
 *
 * Десктоп (≥lg): вертикальная шкала у правого края, подписи всплывают по
 * наведению, клик — плавный скролл (перехватывает SmoothScroll, offset −80).
 * Мобильный: кнопка-линза — ЕДИНСТВЕННАЯ навигация (бургер шапки убран),
 * раскрывается в полноэкранный список всех разделов. Первый пункт = «Наверх».
 *
 * Над тёмными секциями ([data-rail-invert] — ink-фон, тёмное фото) шкала
 * инвертируется в светлую, иначе тёмный текст навигации тонет в чёрном.
 *
 * Не дублирует разметку секций — только читает их id. «Подбор» и «Атмосфера»
 * намеренно вне списка (см. content/home.ts).
 */
export default function SectionRail() {
  const pathname = usePathname();
  const atHome = pathname === "/";
  const [activeId, setActiveId] = useState<string>(sections[0].id);
  const [invert, setInvert] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const lenis = useLenis();
  const darkEls = useRef<HTMLElement[]>([]);

  // Активная секция: середина вьюпорта (полоса 10% по центру) — по ВСЕМ
  // секциям карты, не по шести пунктам меню.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45%" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // [pathname], а не []: секции есть только на «/». Иначе при первом заходе
    // не на главную наблюдатель не создастся никогда, и после SPA-перехода
    // на «/» шкала замрёт на первой точке (взводится с next/link, этап 12а).
  }, [pathname]);

  // Инверсия над тёмными секциями: список тёмных узлов кэшируем один раз,
  // а на скролле лишь проверяем, накрывает ли тёмная секция центр вьюпорта
  // (там по вертикали стоит шкала). setState с тем же boolean React гасит.
  useEffect(() => {
    darkEls.current = Array.from(
      document.querySelectorAll<HTMLElement>("[data-rail-invert]")
    );
    // Тот же случай: список тёмных секций пересобирается при смене маршрута,
    // иначе инверсия шкалы над тёмными главами умрёт молча.
  }, [pathname]);
  useMotionValueEvent(scrollY, "change", () => {
    // Вне «/» рельс рисует null, но подписка на скролл живёт (хук нельзя
    // вызвать условно). Считать «тёмные» секции чужой страницы незачем —
    // выходим сразу: работа без рендера это просто работа впустую.
    if (!atHome) return;
    const center = window.innerHeight / 2;
    const over = darkEls.current.some((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= center && r.bottom >= center;
    });
    setInvert(over);
  });

  // Лист (мобильный): фокус-идиома — страница за листом слегка сжимается
  // (класс menu-open на <html>, transform в globals.css). Раньше этим
  // заведовала шапка с бургером — переехало сюда вместе с навигацией.
  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", open);
    return () => document.documentElement.classList.remove("menu-open");
  }, [open]);

  // Стоп-скролл фона + закрытие по Escape. Lenis останавливаем явно;
  // body.overflow — страховка для reduced-motion (Lenis там не создаётся).
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

  // «Шкала наводки» — карта ГЛАВНОЙ: её точки суть секции «/». На других
  // маршрутах она показывала бы карту чужой страницы (CLAUDE.md, «Витрина»
  // п. 7: SectionRail только на «/»). Ранний возврат стоит ПОСЛЕ всех хуков —
  // порядок хуков обязан быть неизменным между рендерами.
  if (!atHome) return null;

  return (
    <>
      {/* ДЕСКТОП: вертикальная шкала наводки у правого края */}
      <nav
        aria-label="Карта разделов"
        className="vt-rail rail-list group/rail fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-row items-stretch gap-3 lg:flex xl:right-7"
      >
        <ul className="flex flex-col justify-center gap-3.5">
          {sections.map((s) => {
            const active = activeId === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active ? "true" : undefined}
                  className="rail-item group/item relative flex items-center justify-end gap-3 py-0.5 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "whitespace-nowrap text-[11px] uppercase tracking-[0.18em] transition-all duration-300 ease-soft",
                      active
                        ? invert
                          ? "text-paper opacity-100"
                          : "text-ink opacity-100"
                        : cn(
                            "translate-x-1 opacity-0 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-focus-visible/item:translate-x-0 group-focus-visible/item:opacity-100",
                            invert ? "text-paper/70" : "text-graphite"
                          )
                    )}
                  >
                    {s.label}
                  </span>
                  <span
                    className={cn(
                      "h-px shrink-0 transition-all duration-300 ease-soft",
                      active
                        ? "w-7 bg-brand"
                        : invert
                          ? "w-4 bg-paper/30 group-hover/item:w-5 group-hover/item:bg-paper/60"
                          : "w-4 bg-ink/25 group-hover/item:w-5 group-hover/item:bg-ink/50"
                    )}
                  />
                </a>
              </li>
            );
          })}
        </ul>

        {/* Непрерывный волосок-прогресс: «наводка» по мере чтения.
            scaleY привязан к scrollYProgress (скролл, не бесконечный цикл). */}
        <span
          className={cn(
            "relative w-px self-stretch overflow-hidden rounded-full transition-colors duration-500",
            invert ? "bg-paper/20" : "bg-line"
          )}
        >
          <motion.span
            aria-hidden
            style={{ scaleY: scrollYProgress }}
            className="absolute inset-0 origin-top bg-brand/80"
          />
        </span>
      </nav>

      {/* МОБИЛЬНЫЙ: кнопка-линза (единственная навигация) + лист разделов */}
      <div className="lg:hidden">
        <AnimatePresence>
          {!open && (
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Разделы сайта"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={cn(
                // vt-rail-lens — своё имя снимка VT. Имя ОБЯЗАНО отличаться от
                // vt-rail: два узла с одним именем в документе отменяют
                // переход целиком. Десктопная шкала и мобильная кнопка —
                // разные узлы, живут под разными брейкпоинтами.
                "vt-rail-lens glass-sheen fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full transition-colors duration-500",
                // Стеклянная линза: тёмное матовое стекло на светлом фоне;
                // над тёмной секцией — светлое (как инверсия шкалы)
                invert ? "glass text-ink" : "glass-dark text-paper"
              )}
            >
              {/* «Линза» — кольцо со зрачком (мотив оптики, не гамбургер) */}
              <span
                className={cn(
                  "relative flex h-6 w-6 items-center justify-center rounded-full border transition-colors duration-500",
                  invert ? "border-ink/80" : "border-paper/85"
                )}
              >
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
                  Разделы
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
                aria-label="Карта разделов"
                className="flex flex-1 flex-col justify-center gap-0.5 px-8"
              >
                {sections.map((s, i) => {
                  const active = activeId === s.id;
                  return (
                    <motion.a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "true" : undefined}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.45,
                        ease: EASE,
                        delay: 0.08 + i * 0.035,
                      }}
                      className={cn(
                        "flex items-center gap-3 py-1 font-serif text-3xl transition-colors",
                        active ? "text-ink" : "text-ink/55"
                      )}
                    >
                      <span
                        className={cn(
                          "h-px shrink-0 transition-all",
                          active ? "w-8 bg-brand" : "w-5 bg-ink/20"
                        )}
                      />
                      {s.label}
                    </motion.a>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { AnimatedLink } from "@/components/ui/animated-link";
import { useLenis, useScrollVelocity } from "@/components/smooth-scroll";
import { nav } from "@/content/home";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/cn";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { scrollY } = useScroll();
  const lenis = useLenis();
  const velocity = useScrollVelocity();

  useMotionValueEvent(scrollY, "change", (y) => {
    setScrolled(y > 40);
  });

  // Умная шапка: направление = знак velocity (Lenis), порог |v| > 2.
  // Выше 200px не прячемся. При reduced-motion Lenis нет, velocity всегда 0 —
  // шапка не прячется вовсе.
  useMotionValueEvent(velocity, "change", (v) => {
    if (scrollY.get() < 200) {
      setHidden(false);
    } else if (v > 2) {
      setHidden(true);
    } else if (v < -2) {
      setHidden(false);
    }
  });

  // Активная секция: середина экрана (полоса 10% по центру) определяет
  // текущий пункт навигации
  useEffect(() => {
    const sections = nav
      .map((item) => document.getElementById(item.href.slice(1)))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45%" }
    );
    sections.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Фокус-идиома: страница за меню уходит в расфокус и слегка сжимается
  // (класс на <html> — page-shell живёт в layout, transform в globals.css)
  useEffect(() => {
    document.documentElement.classList.toggle("menu-open", open);
    return () => document.documentElement.classList.remove("menu-open");
  }, [open]);

  // Блокируем скролл фона и закрываем меню по Escape.
  // Lenis останавливаем явно; body.overflow остаётся страховкой для
  // reduced-motion-режима, где Lenis не создаётся.
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

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-[400ms] ease-soft",
        // Стеклянная шапка: мир расфокусируется за ней (идиома фокуса)
        scrolled || open
          ? "border-b border-line bg-offwhite/70 shadow-[0_6px_24px_-14px_rgba(13,13,13,0.18)] backdrop-blur-md"
          : "border-b border-transparent bg-offwhite/0",
        // Прячемся только при закрытом меню; focus-within возвращает шапку
        // при табе с клавиатуры
        hidden && !open && "-translate-y-full focus-within:translate-y-0"
      )}
    >
      <Container className="flex h-20 items-center justify-between">
        <a
          href="#hero"
          aria-label="Оптимист — на главную"
          className="relative z-50"
        >
          <Logo variant="mark" className="h-11 sm:h-12" priority />
        </a>

        {/* Десктоп-навигация */}
        <nav
          aria-label="Основная навигация"
          className="hidden items-center gap-8 lg:flex"
        >
          {nav.map((item) => (
            <AnimatedLink
              key={item.href}
              href={item.href}
              active={activeId === item.href.slice(1)}
              className="text-sm"
            >
              {item.label}
            </AnimatedLink>
          ))}
        </nav>

        <div className="hidden lg:block">
          <Button
            href="#cta"
            className="text-xs uppercase tracking-[0.15em]"
          >
            Записаться
          </Button>
        </div>

        {/* Бургер (мобильный) */}
        <button
          type="button"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="relative z-50 flex h-10 w-10 flex-col items-center justify-center gap-1.5 lg:hidden"
        >
          <span
            className={cn(
              "block h-px w-6 bg-ink transition-all duration-300 ease-soft",
              open && "translate-y-[3.5px] rotate-45"
            )}
          />
          <span
            className={cn(
              "block h-px w-6 bg-ink transition-all duration-300 ease-soft",
              open && "-translate-y-[3.5px] -rotate-45"
            )}
          />
        </button>
      </Container>

      {/* Полноэкранное мобильное меню */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="fixed inset-0 z-40 flex flex-col bg-offwhite/40 backdrop-blur-[6px] motion-reduce:bg-offwhite/90 motion-reduce:backdrop-blur-none lg:hidden"
          >
            <nav
              aria-label="Мобильная навигация"
              className="flex flex-1 flex-col justify-center gap-1 px-8"
            >
              {nav.map((item, i) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.12 + i * 0.06 }}
                  className="py-1.5 font-serif text-4xl text-ink"
                >
                  {item.label}
                </motion.a>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  ease: EASE,
                  delay: 0.12 + nav.length * 0.06,
                }}
                className="mt-8"
              >
                <Button href="#cta" className="w-full">
                  Записаться на приём
                </Button>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

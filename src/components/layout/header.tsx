"use client";

import { useEffect, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { AnimatedLink } from "@/components/ui/animated-link";
import { useScrollVelocity } from "@/components/smooth-scroll";
import { nav } from "@/content/home";
import { cn } from "@/lib/cn";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { scrollY } = useScroll();
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

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-[400ms] ease-soft",
        // Стеклянная шапка: мир расфокусируется за ней (идиома фокуса).
        // .glass — единый премиальный рецепт (тинт + blur+saturate + кромка
        // + верхний блик + тень глубины); до скролла шапка прозрачна.
        scrolled
          ? "glass border-x-0 border-t-0"
          : "border-b border-transparent bg-offwhite/0",
        // focus-within возвращает спрятанную шапку при табе с клавиатуры
        hidden && "-translate-y-full focus-within:translate-y-0"
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

        {/* Мобильная навигация переехала в «Шкалу наводки» (кнопка-линза):
            бургер убран, единая сквозная навигация — см. section-rail.tsx */}
      </Container>
    </header>
  );
}

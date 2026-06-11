"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { AnimatedLink } from "@/components/ui/animated-link";
import { Magnetic } from "@/components/ui/magnetic";
import { MotionFocus } from "@/components/ui/motion-focus";
import { Photo } from "@/components/ui/photo";
import { useIntroDone } from "@/components/ui/intro";
import { hero } from "@/content/home";
import { DURATION, EASE, heroFocus } from "@/lib/motion";

const lineParent: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
// Маска + лёгкий расфокус: заголовок «наводится на резкость» при загрузке
const lineChild: Variants = {
  hidden: { y: "110%", opacity: 0, filter: "blur(6px)" },
  visible: {
    y: "0%",
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: EASE },
  },
};

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  // Сервер не знает prefers-reduced-motion и всегда рендерит анимационную
  // ветку; при включённом reduce первая клиентская отрисовка расходилась
  // с серверной — hydration-warning (REPORT-3). Гейт через mounted: до
  // маунта рендерим серверный вариант, честное значение — после.
  const prefersReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && !!prefersReduce;
  // КРИТИЧНО: всё появление hero ждёт окончания прелоадера «op».
  // Повторный визит / reduced-motion → introDone = true с первого кадра.
  const introDone = useIntroDone();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Едва заметный parallax фото + плавное исчезновение подсказки скролла
  const imageY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const hintOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  return (
    <section
      ref={ref}
      id="hero"
      className="relative flex min-h-[100dvh] items-center overflow-hidden pb-16 pt-28"
    >
      <Container className="grid w-full grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-8">
        {/* Текст */}
        <div className="lg:col-span-7">
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={reduce ? {} : introDone ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
            className="mb-8 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-eyebrow text-graphite"
          >
            <span className="h-px w-8 bg-brand" />
            {hero.eyebrow}
          </motion.p>

          <MotionFocus>
          <h1 className="font-serif text-display-xl font-light text-ink">
            {reduce ? (
              <>
                {hero.titleLines.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
                <span className="block text-brand">{hero.titleAccent}</span>
              </>
            ) : (
              <motion.span
                variants={lineParent}
                initial="hidden"
                animate={introDone ? "visible" : "hidden"}
                className="block"
              >
                {hero.titleLines.map((l) => (
                  <span key={l} className="block overflow-hidden">
                    <motion.span variants={lineChild} className="block">
                      {l}
                    </motion.span>
                  </span>
                ))}
                <span className="block overflow-hidden">
                  <motion.span
                    variants={lineChild}
                    className="block text-brand"
                  >
                    {hero.titleAccent}
                  </motion.span>
                </span>
              </motion.span>
            )}
          </h1>
          </MotionFocus>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={reduce ? {} : introDone ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
            className="mt-8 max-w-xl text-base leading-relaxed text-graphite sm:text-lg"
          >
            {hero.subtitle}
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={reduce ? {} : introDone ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: EASE, delay: 0.85 }}
            className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4"
          >
            <Magnetic>
              <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
            </Magnetic>
            <AnimatedLink href={hero.secondaryCta.href} className="text-sm">
              {hero.secondaryCta.label}
            </AnimatedLink>
          </motion.div>
        </div>

        {/* Фото: одноразовое «наведение на резкость» + лёгкий параллакс.
            Кадр горизонтальный, поэтому пропорция 4:3 — оправа видна целиком. */}
        <div className="lg:col-span-5">
          <motion.div
            style={reduce ? undefined : { y: imageY }}
            variants={reduce ? undefined : heroFocus}
            initial={reduce ? false : "hidden"}
            animate={reduce ? undefined : introDone ? "visible" : "hidden"}
            transition={{ duration: DURATION.slow, ease: EASE, delay: 0.25 }}
            className="relative ml-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-[2rem]"
          >
            <Photo
              slot="hero"
              alt="Классическая оправа крупным планом на белом фоне"
              label={hero.imageLabel}
              priority
              sizes="(min-width:1024px) 40vw, 90vw"
            />
          </motion.div>
        </div>
      </Container>

      {/* Подсказка скролла: мягкая пульсация линии, исчезает при начале скролла */}
      <motion.div
        style={reduce ? undefined : { opacity: hintOpacity }}
        className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={reduce ? {} : introDone ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: EASE, delay: 1.1 }}
          className="flex flex-col items-center gap-3 text-graphite"
        >
          <span className="text-[10px] uppercase tracking-[0.3em]">Листайте</span>
          <span className="relative block h-10 w-px overflow-hidden bg-line">
            <motion.span
              aria-hidden
              animate={reduce ? {} : { y: ["-60%", "160%"] }}
              transition={{
                duration: 1.9,
                ease: "easeInOut",
                repeat: Infinity,
                repeatDelay: 0.35,
              }}
              className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent to-brand"
            />
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
}

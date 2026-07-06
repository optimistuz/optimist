"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { AnimatedLink } from "@/components/ui/animated-link";
import { Magnetic } from "@/components/ui/magnetic";
import { MotionFocus } from "@/components/ui/motion-focus";
import { FocusPortrait } from "@/components/ui/focus-portrait";
import { useIntroDone } from "@/components/ui/intro";
import { hero } from "@/content/home";
import { EASE } from "@/lib/motion";
import { useOpticalCapability } from "@/lib/use-optical-capability";

/**
 * Строка заголовка, ведомая мастер-прогрессом `p` (единая волна с портретом).
 * Появление масочное (внутренний span выезжает из-под overflow-hidden) + ось
 * opsz 20→72 (вариативная Literata «дорезкает» буквы). Текст наводится РАНЬШЕ
 * портрета — смысл доезжает к ~середине волны (решение владельца: читаемость
 * важнее долгой наводки). Блюр текста живёт на обёртке-колонке (см. ниже), а не
 * здесь — иначе двойной фильтр (MotionFocus уже держит velocity-фильтр на h1).
 * Внешний span несёт прощальный y по скроллу, внутренний — появление: транформы
 * не дерутся.
 */
function RevealLine({
  p,
  index,
  scrollY,
  className,
  children,
}: {
  p: MotionValue<number>;
  index: number;
  scrollY: MotionValue<number>;
  className?: string;
  children: ReactNode;
}) {
  const start = 0.06 + index * 0.05;
  const y = useTransform(p, [start, start + 0.2], ["110%", "0%"]);
  const opacity = useTransform(p, [start, start + 0.2], [0, 1]);
  const opsz = useTransform(p, [start, start + 0.34], [20, 72]);
  return (
    <motion.span style={{ y: scrollY }} className="block overflow-hidden">
      <motion.span
        // --opsz анимируем числом (motion надёжно интерполирует CSS-переменную;
        // сам fontVariationSettings motion не анимирует). Каст — тип MotionStyle
        // в этой версии не знает произвольных CSS-переменных.
        style={
          {
            y,
            opacity,
            "--opsz": opsz,
            fontVariationSettings: '"opsz" var(--opsz, 72)',
          } as MotionStyle
        }
        className={`block${className ? " " + className : ""}`}
      >
        {children}
      </motion.span>
    </motion.span>
  );
}

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  // Сервер не знает prefers-reduced-motion и всегда рендерит анимационную
  // ветку; гейт через mounted: до маунта серверный вариант, честное значение —
  // после (иначе hydration-mismatch, REPORT-3).
  const prefersReduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && !!prefersReduce;

  // Полноценная сцена (блюр + фокус-окна + блик) — единый шлюз способностей.
  // desktopMatch внутри useOpticalCapability пока сохраняется (снимается
  // этапом 2 — мобильный паритет); поведение идентично прежнему детекту.
  const { full } = useOpticalCapability();
  const scene = full;

  // КРИТИЧНО: вся волна ждёт окончания прелоадера «op». Повторный визит /
  // reduced-motion → introDone = true с первого кадра.
  const introDone = useIntroDone();

  // ОДИН мастер-прогресс волны фокуса (0→1) — кормит и текст, и портрет.
  // ~3,2 с (решение владельца): медленнее прежних 2 с, чертёж успевает
  // «прочитаться», кульминация не смазана. Прелоадер перетекает в волну
  // (малый delay), без второй паузы.
  const p = useMotionValue(0);
  useEffect(() => {
    if (reduce) {
      p.set(1); // финальный резкий кадр без анимации
      return;
    }
    if (!introDone) return;
    // Ровный ease-in-out (НЕ expo-out EASE): expo «выстреливает» прогресс в
    // начале — фаза рисования чертежа пролетала бы за ~1 с. Здесь 3,4 с тратятся
    // равномерно: мягкий старт (близорукое утро) → ровная, читаемая середина
    // (рисование) → плавный «снап» в резкость.
    const controls = animate(p, 1, {
      duration: 3.4,
      ease: "linear",
      delay: 0.1,
    });
    return () => controls.stop();
  }, [reduce, introDone, p]);

  // «Близорукое утро» текста: мягкий расфокус колонки, наведённый РАНО (к ~0.4
  // прогресса = ~1,3 с) — заголовок дочитывается быстро. filter снимаем в «none»
  // на финале, чтобы не держать постоянный композитный слой (резкость текста).
  const textBlur = useTransform(p, [0.06, 0.4], [6, 0]);
  const textFilter = useTransform(textBlur, (b) =>
    b <= 0.03 ? "none" : `blur(${b}px)`
  );

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  // Плавное исчезновение подсказки скролла при начале прокрутки
  const hintOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  // Прощальная хореография: строки заголовка уезжают вверх на разных скоростях
  // (параллакс глубины), подзаголовок и кнопки растворяются. Портрет уходит из
  // фокуса («сняла очки») — это живёт внутри FocusPortrait через exit.
  const lineY0 = useTransform(scrollYProgress, [0, 1], [0, -108]); // ×0.9
  const lineY1 = useTransform(scrollYProgress, [0, 1], [0, -120]); // ×1.0
  const lineY2 = useTransform(scrollYProgress, [0, 1], [0, -132]); // ×1.1
  const lineYs = [lineY0, lineY1, lineY2];
  const farewellOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section
      ref={ref}
      id="hero"
      className="relative flex min-h-[100dvh] items-center overflow-hidden pb-16 pt-28"
    >
      {/* Десктоп: крупный портрет привязан к правому-верхнему углу. Лежит ПОД
          текстом (z-0), курсор не ловит. Полная сцена (scene) + скролл-выход. */}
      <div className="pointer-events-none absolute right-0 top-0 z-0 hidden w-[60%] -translate-y-[7%] lg:block xl:w-[55%] 2xl:w-[50%]">
        <FocusPortrait
          className="w-full"
          progress={p}
          scene={scene}
          exit={scene ? scrollYProgress : undefined}
        />
      </div>

      <Container className="relative z-10 grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-10">
        {/* Текст */}
        <div className="relative z-10 lg:col-span-7">
          {/* Обёртка-колонка несёт «близорукий» блюр всего текста одной волной
              (eyebrow + заголовок + подзаголовок + кнопки). MotionFocus внутри
              держит свой velocity-фильтр на h1 — это РАЗНЫЕ элементы, конфликта
              нет; во время интро velocity ≈ 0. */}
          <motion.div style={scene ? { filter: textFilter } : undefined}>
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
                  <>
                    {hero.titleLines.map((l, i) => (
                      <RevealLine key={l} p={p} index={i} scrollY={lineYs[i]}>
                        {l}
                      </RevealLine>
                    ))}
                    <RevealLine
                      key="accent"
                      p={p}
                      index={hero.titleLines.length}
                      scrollY={lineYs[2]}
                      className="text-brand"
                    >
                      {hero.titleAccent}
                    </RevealLine>
                  </>
                )}
              </h1>
            </MotionFocus>

            {/* Обёртки прощания: opacity по скроллу живёт на родителе,
                интро-анимация — на ребёнке (не делят свойство) */}
            <motion.div style={reduce ? undefined : { opacity: farewellOpacity }}>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={reduce ? {} : introDone ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, ease: EASE, delay: 0.7 }}
                className="mt-8 max-w-xl text-base leading-relaxed text-graphite sm:text-lg"
              >
                {hero.subtitle}
              </motion.p>
            </motion.div>

            <motion.div style={reduce ? undefined : { opacity: farewellOpacity }}>
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
            </motion.div>
          </motion.div>
        </div>

        {/* Мобайл: портрет в потоке сверху, крупно. На десктопе — абсолютный
            слой выше (этот скрыт). scene=false: без блюра сцены (правило мобайла). */}
        <div aria-hidden className="order-first lg:hidden">
          <FocusPortrait
            className="mx-auto w-[86vw] max-w-[440px]"
            progress={p}
            scene={false}
          />
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

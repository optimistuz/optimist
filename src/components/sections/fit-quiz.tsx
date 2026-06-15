"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Reveal, RevealLines } from "@/components/ui/reveal";
import { MotionFocus } from "@/components/ui/motion-focus";
import QuizFlow from "@/components/sections/fit-quiz-flow";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";
import { fitQuiz, faceFit } from "@/content/home";

/* ------------------------------------------------------------------
   Секция «Подбор» — координатор двух путей.
   Главный путь — подбор по лицу (камера). Запасной — квиз из трёх
   вопросов (QuizFlow, без регресса). Вход контекстный — пункта меню нет.

   Камера-путь подключён ЛЕНИВО через next/dynamic { ssr: false }:
   MediaPipe (WASM) и getUserMedia не должны исполняться при SSR/сборке,
   а пакет не должен попадать в стартовый бандл «/» (тянется только по
   клику «Подобрать по лицу»).
   ------------------------------------------------------------------ */

// Скелет на время подгрузки чанка камеры — держит высоту, без скачка.
function FaceFitLoading() {
  return (
    <div className="mx-auto max-w-xl">
      <div
        className="h-72 w-full animate-pulse rounded-lg border border-line bg-paper/40"
        aria-hidden
      />
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}

const FaceFit = dynamic(() => import("@/components/ui/face-fit"), {
  ssr: false,
  loading: () => <FaceFitLoading />,
});

type Path = "choose" | "camera" | "quiz";

/** Карточка выбора пути — фокус-идиома: наведённая резкая, соседняя
    приглушается (blur 1px + opacity 0.5). accent — камера (главный путь). */
function PathCard({
  badge,
  title,
  desc,
  accent,
  dim,
  reduce,
  onChoose,
  onHover,
}: {
  badge: string;
  title: string;
  desc: string;
  accent?: boolean;
  dim: boolean;
  reduce: boolean;
  onChoose: () => void;
  onHover: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      style={{
        filter: dim && !reduce ? "blur(1px)" : "none",
        opacity: dim ? 0.5 : 1,
        transition: reduce
          ? undefined
          : "filter 250ms ease, opacity 250ms ease",
      }}
      className={cn(
        "glass glass-sheen group flex flex-col items-start rounded-lg p-6 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-8",
        accent
          ? "border-brand/60 hover:border-brand"
          : "hover:border-ink/40"
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 text-xs font-medium uppercase tracking-eyebrow",
          accent ? "text-brand-deep" : "text-graphite"
        )}
      >
        <span
          aria-hidden
          className={cn("h-px w-5", accent ? "bg-brand" : "bg-graphite/50")}
        />
        {badge}
      </span>
      <span className="mt-5 font-serif text-2xl font-light leading-snug text-ink">
        {title}
      </span>
      <span className="mt-3 text-sm leading-relaxed text-graphite sm:text-base">
        {desc}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-6 inline-flex items-center gap-2 text-sm font-medium",
          accent ? "text-brand-deep" : "text-ink"
        )}
      >
        Выбрать
        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
          →
        </span>
      </span>
    </button>
  );
}

export default function FitQuiz() {
  const reduce = useReduceAfterMount();
  const [path, setPath] = useState<Path>("choose");
  const [hovered, setHovered] = useState<"camera" | "quiz" | null>(null);

  const fade = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(6px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        transition: { duration: 0.3, ease: EASE },
      };
  const View = reduce ? "div" : motion.div;

  return (
    <Section id="fit">
      <Container>
        <div className="mb-12 max-w-2xl sm:mb-16">
          <Reveal>
            <Eyebrow>{fitQuiz.eyebrow}</Eyebrow>
          </Reveal>
          <MotionFocus>
            <h2 className="mt-6 font-serif text-display-md font-light leading-[1.05] text-ink">
              <RevealLines text={fitQuiz.heading} />
            </h2>
          </MotionFocus>
          <Reveal delay={0.1} className="mt-6 max-w-xl">
            <p className="text-base leading-relaxed text-graphite sm:text-lg">
              {fitQuiz.lead}
            </p>
          </Reveal>
        </div>

        {path === "choose" && (
          <View key="choose" {...fade} className="mx-auto max-w-3xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <PathCard
                badge={faceFit.choose.cameraBadge}
                title={faceFit.choose.cameraTitle}
                desc={faceFit.choose.cameraDesc}
                accent
                dim={hovered === "quiz"}
                reduce={reduce}
                onChoose={() => setPath("camera")}
                onHover={(on) => setHovered(on ? "camera" : null)}
              />
              <PathCard
                badge={faceFit.choose.quizBadge}
                title={faceFit.choose.quizTitle}
                desc={faceFit.choose.quizDesc}
                dim={hovered === "camera"}
                reduce={reduce}
                onChoose={() => setPath("quiz")}
                onHover={(on) => setHovered(on ? "quiz" : null)}
              />
            </div>
          </View>
        )}

        {path === "camera" && (
          <View key="camera" {...fade}>
            <FaceFit
              reduce={reduce}
              onUseQuiz={() => setPath("quiz")}
              onExitToChoice={() => setPath("choose")}
            />
          </View>
        )}

        {path === "quiz" && (
          <View key="quiz" {...fade}>
            <QuizFlow reduce={reduce} onExitToChoice={() => setPath("choose")} />
          </View>
        )}
      </Container>
    </Section>
  );
}

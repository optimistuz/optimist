"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { FaceIcon } from "@/components/ui/face-icon";
import { cn } from "@/lib/cn";
import { EASE } from "@/lib/motion";
import { recommend } from "@/lib/fit-recommend";
import { fitQuiz, fitResult, site } from "@/content/home";

/* ------------------------------------------------------------------
   Квиз «Подбор» — запасной путь (три шага: форма лица → что носите →
   характер оправы). Вынесен из секции без изменения логики: фокус-идиома
   выбора, результат «наводится на резкость», запись в localStorage,
   Telegram-share. Стал веткой стартового экрана «Подбора» (главный путь —
   камера). Регресс квиза — нулевой.
   ------------------------------------------------------------------ */

type Answers = Record<string, string>;

/**
 * Группа карточек-ответов одного шага — семантический radiogroup.
 * Фокус-идиома: наведённая/сфокусированная карточка резкая, соседние —
 * blur 1px + opacity 0.5; выбранная получает волосяную рамку brand.
 * Клавиатура: стрелки двигают выбор (radio), Enter/Space — подтверждают.
 */
function RadioCards({
  options,
  value,
  withIcon,
  label,
  reduce,
  onSelect,
  onCommit,
}: {
  options: readonly { value: string; label: string }[];
  value?: string;
  withIcon?: boolean;
  label: string;
  reduce: boolean;
  onSelect: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const activeIndex = hovered ?? (selectedIndex >= 0 ? selectedIndex : null);
  const tabTarget = selectedIndex >= 0 ? selectedIndex : 0;

  const move = (i: number) => {
    const n = options.length;
    const j = ((i % n) + n) % n;
    refs.current[j]?.focus();
    onSelect(options[j].value);
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(i - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onCommit(options[i].value);
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-3 sm:gap-4",
        withIcon
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid-cols-1 sm:grid-cols-3"
      )}
    >
      {options.map((o, i) => {
        const selected = value === o.value;
        const dim = activeIndex !== null && i !== activeIndex;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === tabTarget ? 0 : -1}
            onClick={() => onCommit(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            style={{
              filter: dim && !reduce ? "blur(1px)" : "none",
              opacity: dim ? 0.5 : 1,
              transition: reduce
                ? undefined
                : "filter 250ms ease, opacity 250ms ease",
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-md border bg-paper/40 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              withIcon ? "px-3 py-6 sm:py-7" : "px-5 py-7 sm:py-9",
              selected
                ? "border-brand text-ink"
                : "border-line text-graphite hover:border-ink/40 hover:text-ink"
            )}
          >
            {withIcon && (
              <span className={selected ? "text-brand" : "text-ink"}>
                <FaceIcon shape={o.value} />
              </span>
            )}
            <span
              className={cn(
                withIcon ? "text-sm" : "text-base sm:text-lg",
                "font-medium tracking-wide"
              )}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function QuizFlow({
  reduce,
  onExitToChoice,
}: {
  reduce: boolean;
  onExitToChoice: () => void;
}) {
  const total = fitQuiz.steps.length;
  // view: 0..total-1 — шаги; total — экран результата
  const [view, setView] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});

  const isResult = view >= total;
  const step = !isResult ? fitQuiz.steps[view] : null;

  const select = (key: string) => (v: string) =>
    setAnswers((a) => ({ ...a, [key]: v }));

  const commit = (key: string) => (v: string) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    // Лёгкая пауза, чтобы выбор «прочитался», затем переход
    window.setTimeout(() => setView((s) => s + 1), reduce ? 0 : 160);
  };

  // Назад: с первого шага — к выбору пути, иначе на предыдущий шаг.
  const back = () => {
    if (view === 0) onExitToChoice();
    else setView((s) => Math.max(0, s - 1));
  };
  const restart = () => {
    setAnswers({});
    setView(0);
  };

  const complete =
    isResult && !!answers.face && !!answers.use && !!answers.character;
  const rec = complete
    ? recommend(answers.face, answers.use, answers.character)
    : null;

  // Результат → localStorage: форма записи подхватывает свежий подбор.
  useEffect(() => {
    if (!complete || !rec) return;
    try {
      window.localStorage.setItem(
        "optimist-fit",
        JSON.stringify({
          face: answers.face,
          use: answers.use,
          style: answers.character,
          recommendation: rec.directions.map((d) => d.name).join(" + "),
          code: rec.code,
          source: "quiz",
          ts: Date.now(),
        })
      );
    } catch {
      /* приватный режим / переполнена квота — молча */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, rec?.code]);

  // Telegram-share: канонический URL сайта + текст с первым направлением.
  const shareUrl =
    "https://t.me/share/url?url=" +
    encodeURIComponent(site.url) +
    "&text=" +
    encodeURIComponent(
      fitQuiz.shareText +
        (rec?.directions[0] ? `: ${rec.directions[0].name}` : "")
    );

  // Грамматика перехода: кроссфейд + blur (одноразовое «наведение»).
  const anim = reduce
    ? {}
    : {
        initial: { opacity: 0, filter: "blur(6px)" },
        animate: { opacity: 1, filter: "blur(0px)" },
        exit: { opacity: 0, filter: "blur(6px)" },
        transition: { duration: 0.22, ease: EASE },
      };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Прогресс шагов */}
      <div className="mb-8 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.2em] text-graphite tabular-nums">
          {isResult ? (
            <span className="text-brand-deep">Готово</span>
          ) : (
            <>
              <span className="font-medium text-ink">
                {String(view + 1).padStart(2, "0")}
              </span>
              {" — "}
              {String(total).padStart(2, "0")}
            </>
          )}
        </span>
        {!isResult && (
          <button
            type="button"
            onClick={back}
            className="group inline-flex items-center gap-2 text-sm text-graphite transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            >
              ←
            </span>
            {view === 0 ? "К выбору" : fitQuiz.back}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {step ? (
          <motion.div key={`step-${view}`} {...anim}>
            <h3 className="mb-6 font-serif text-2xl font-light text-ink sm:text-3xl">
              {step.title}
            </h3>
            <RadioCards
              options={step.options}
              value={answers[step.key]}
              withIcon={step.key === "face"}
              label={step.title}
              reduce={reduce}
              onSelect={select(step.key)}
              onCommit={commit(step.key)}
            />
            {step.help && (
              <p className="mt-6 text-sm leading-relaxed text-graphite/80">
                {step.help}
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div key="result" {...anim} aria-live="polite">
            <p className="text-xs uppercase tracking-[0.2em] text-brand-deep">
              {fitQuiz.resultLabel}
            </p>
            {rec && (
              <>
                <h3 className="mt-4 max-w-2xl font-serif text-2xl font-light leading-snug text-ink sm:text-3xl">
                  {rec.headline}
                </h3>
                <ul className="mt-8 space-y-6">
                  {rec.directions.map((d) => (
                    <li
                      key={d.name}
                      className="border-l border-line pl-5 sm:pl-6"
                    >
                      <p className="font-medium text-ink">{d.name}</p>
                      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-graphite sm:text-base">
                        {d.why}
                      </p>
                    </li>
                  ))}
                </ul>
                {rec.sun && (
                  <p className="mt-6 max-w-xl text-sm leading-relaxed text-graphite/90">
                    {fitResult.sunLine}
                  </p>
                )}
                <p className="mt-8 text-sm tracking-wide text-graphite">
                  {fitQuiz.bothSalons}
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                  <Button href={fitQuiz.resultCta.href}>
                    {fitQuiz.resultCta.label}
                  </Button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {fitQuiz.share}
                  </a>
                  <button
                    type="button"
                    onClick={restart}
                    className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {fitQuiz.restart}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

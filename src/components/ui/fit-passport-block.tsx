"use client";

import { useSyncExternalStore } from "react";
import {
  subscribeFitSession,
  getFitSessionSnapshot,
  getFitSessionServerSnapshot,
} from "@/lib/fit-session";
import { widthStepLabel } from "@/content/catalog/frame";
// ⚠️ Тексты — из отдельного модуля, а НЕ из `home.ts`: тот целиком лежит
// в критическом чанке «/», и строки паспорта ехали бы всем, хотя сам блок
// ленивый (нашёл `hronometrist`). Не менять на импорт из `home.ts`.
import { fitPassportCopy } from "@/content/fit-passport-copy";

/* ------------------------------------------------------------------
   ПАСПОРТ ПОСАДКИ — блок «ваши миллиметры» (этап 7, шаг 3).

   ЧТО ЗДЕСЬ ЕСТЬ: геометрия — PD, ширина лица, ступень ширины оправы.
   Это ЗАМЕР, поэтому публикуется сразу, без подписи оптометриста
   (CLAUDE.md, «Витрина» п. 6).

   ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ до подписи врача: стилевого скора посадки
   («вам подойдёт вот такая оправа») — он за гейтом §10 Q9.

   ПОЧЕМУ ОБЩИЙ КОМПОНЕНТ, а не копия в каждом результате: мерка одна,
   и формулировка допуска обязана быть одна. Две копии разъезжаются —
   и одна из них однажды забудет слова «ориентир, не рецепт».

   ПРЕЕМСТВЕННОСТЬ (замена шага 7): мерка живёт в памяти вкладки, поэтому
   человек, снявший её камерой и ушедший в квиз, видит свои миллиметры и
   там. Ранжирование силуэтов по ступени ширины ждёт артикулов с мм
   в каталоге — сортировать абстрактные силуэты не по чему.

   Персонализация строго после маунта: серверный снимок — всегда null,
   поэтому SSG-разметка нейтральна и шва гидрации нет.
   ------------------------------------------------------------------ */

/** Русская запятая в дробях + неразрывный пробел перед единицей. */
const mm = (v: number) => `${String(v).replace(".", ",")} мм`;

export function FitPassportBlock({ className = "" }: { className?: string }) {
  const fit = useSyncExternalStore(
    subscribeFitSession,
    getFitSessionSnapshot,
    getFitSessionServerSnapshot
  );

  // Мерки нет вовсе (камеру не включали) — блока тоже нет. Пустой заголовок
  // «Ваши миллиметры» без чисел выглядел бы поломкой.
  if (!fit) return null;

  const p = fitPassportCopy;
  const hasMm = typeof fit.pd === "number" && typeof fit.faceWidth === "number";

  return (
    <div className={`border-t border-line pt-6 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-[0.15em] text-graphite">
        {p.title}
      </p>

      {hasMm ? (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-xs text-graphite">{p.pd}</dt>
              <dd className="mt-1 font-serif text-xl font-light text-ink">
                {mm(fit.pd as number)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-graphite">{p.faceWidth}</dt>
              <dd className="mt-1 font-serif text-xl font-light text-ink">
                {mm(fit.faceWidth as number)}
              </dd>
            </div>
            {fit.widthStep && (
              <div>
                <dt className="text-xs text-graphite">{p.widthStep}</dt>
                <dd className="mt-1 font-serif text-xl font-light text-ink">
                  {widthStepLabel(fit.widthStep)}
                </dd>
              </div>
            )}
          </dl>

          {/* ⚠️ Ступень — не замер, а ВЫВОД из допущения «ширина оправы ≈
              ширина лица по скулам» (`fit-passport.ts`, помечено ПРОВЕРИТЬ
              ОПТОМЕТРИСТАМИ). Стоя третьей в ряду с двумя измеренными
              числами, она читается как такой же факт — оговорка обязана
              стоять здесь, а не в общем допуске ниже (`revizor-vitriny`). */}
          {fit.widthStep && (
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-graphite/70">
              {p.stepNote}
            </p>
          )}
          {/* Допуск и врач — РЯДОМ с числами, а не мелким шрифтом внизу
              страницы: оговорка, которую не читают, оговоркой не является. */}
          <p className="mt-4 max-w-xl text-xs leading-relaxed text-graphite/70">
            {p.tolerance}
          </p>
          {/* CTA к врачу — ССЫЛКОЙ и РЯДОМ с числами: кнопка записи лежит
              четырьмя блоками ниже, за чипсами ручной правки, и оговорка без
              действия оговоркой не работает (нашёл `strazh`). */}
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-graphite/70">
            {p.doctorNote}{" "}
            <a
              href="/#cta"
              className="text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {p.doctorCta}
            </a>
          </p>
        </>
      ) : (
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-graphite">
          {p.absent}
        </p>
      )}
    </div>
  );
}

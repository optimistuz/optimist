"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { useGaze } from "@/lib/use-gaze";
import { useTicker } from "@/components/smooth-scroll";
import { useReadLines } from "@/lib/use-read-lines";
import { cn } from "@/lib/cn";

/**
 * «Зона ясного зрения» (этап 4, подписной момент №2) — манифест Positioning
 * как опыт «до/после очков» без единого слова.
 *
 * Механика (решено жюри): ДВА DOM-слоя одного текста. Нижний — дубль в
 * СТАТИЧНОМ расфокусе (`.clarity-blur`, blur 5px, aria-hidden); прочитанная
 * строка (`.line-read`) в нём становится резкой, поэтому read-строки резки
 * ВЕЗДЕ. Верхний — резкий реальный текст (a11y), обрезан пятном ясного зрения
 * `clip-path: circle(--clarity-r at --gx --gy)`. В анимации двигается ТОЛЬКО
 * clip-path (var-ы), НОЛЬ живых фильтров. Координаты пишет единый тикер с lerp
 * от useGaze; при простое/на Android пятно ДРЕЙФУЕТ к первой непрочитанной
 * строке (и «прочитывает» её проходом). Reduce — один резкий слой.
 */
const LERP = 0.12;
const IDLE_FRAMES = 80; // ~1.3 с покоя ввода → переход на дрейф

type Line = { node: ReactNode; className?: string };

export function ClarityZone({ lines }: { lines: Line[] }) {
  const reduce = useReduceAfterMount();
  const rootRef = useRef<HTMLDivElement>(null);
  const sharpRef = useRef<HTMLDivElement>(null);
  const gaze = useGaze(rootRef);
  const gazeRef = useRef(gaze);
  gazeRef.current = gaze;
  const ticker = useTicker();
  const { registers, read, markRead } = useReadLines(lines.length);
  const readRef = useRef(read);
  readRef.current = read;
  const lineEls = useRef<(HTMLElement | null)[]>(Array(lines.length).fill(null));

  useEffect(() => {
    if (reduce || !ticker) return;
    const root = rootRef.current;
    const sharp = sharpRef.current;
    if (!root || !sharp) return;

    let cx = root.clientWidth / 2;
    let cy = root.clientHeight * 0.4;
    let lastX = 0;
    let lastY = 0;
    let idle = IDLE_FRAMES;
    let running = false;
    let inView = false;
    const tops: number[] = [];
    const bots: number[] = [];

    const tick = () => {
      // Ввод «пошевелился»? (мышь/тап меняют relX/relY; гиро — нет → дрейф).
      // Чтение motion-value лейаут НЕ трогает — потому идёт первым.
      const gx = gazeRef.current.x.get();
      const gy = gazeRef.current.y.get();
      if (Math.abs(gx - lastX) > 0.002 || Math.abs(gy - lastY) > 0.002) idle = 0;
      else idle++;
      lastX = gx;
      lastY = gy;
      const drifting = idle >= IDLE_FRAMES;

      // Полный покой: дрейфовать некуда (всё прочитано), ввод молчит → пятно
      // стоит. Выходим ДО единого чтения лейаута; ввод разбудит на след. кадре.
      if (drifting && readRef.current.every(Boolean)) return;

      const rect = root.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0) return;

      // Все чтения лейаута — ДО записи var-ов (никакого read-after-write).
      tops.length = 0;
      bots.length = 0;
      let firstUnread = -1;
      for (let i = 0; i < lineEls.current.length; i++) {
        const el = lineEls.current[i];
        if (!el) {
          tops.push(NaN);
          bots.push(NaN);
          continue;
        }
        const lr = el.getBoundingClientRect();
        tops.push(lr.top - rect.top);
        bots.push(lr.bottom - rect.top);
        if (firstUnread < 0 && !readRef.current[i]) firstUnread = i;
      }

      let tx: number;
      let ty: number;
      if (!drifting) {
        // Следуем за взглядом (−1…1 относительно центра контейнера → px).
        tx = (gx * 0.5 + 0.5) * w;
        ty = (gy * 0.5 + 0.5) * h;
      } else if (firstUnread >= 0) {
        // Дрейф к первой непрочитанной строке (её и «прочитаем» проходом).
        tx = w / 2;
        ty = (tops[firstUnread] + bots[firstUnread]) / 2;
      } else {
        tx = cx;
        ty = cy;
      }
      cx += (tx - cx) * LERP;
      cy += (ty - cy) * LERP;
      // Var-ы пишем на самого потребителя (.clarity-sharp), а не на родителя:
      // иначе наследование инвалидирует стиль всего поддерева каждый кадр.
      sharp.style.setProperty("--gx", `${cx.toFixed(1)}px`);
      sharp.style.setProperty("--gy", `${cy.toFixed(1)}px`);

      // Строка «прочитана», когда пятно проходит её по вертикали (или центр
      // вьюпорта — это делает IO внутри useReadLines), что раньше.
      for (let i = 0; i < lineEls.current.length; i++) {
        if (readRef.current[i]) continue;
        if (cy >= tops[i] && cy <= bots[i]) markRead(i);
      }
    };

    const start = () => {
      if (!running && inView) {
        running = true;
        ticker.addTick(tick);
      }
    };
    const stop = () => {
      if (running) {
        running = false;
        ticker.removeTick(tick);
      }
    };
    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        if (inView) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(root);
    return () => {
      stop();
      io.disconnect();
    };
  }, [reduce, ticker, markRead]);

  // Reduce: один резкий слой — обычный статичный текст.
  if (reduce) {
    return (
      <div className="space-y-2">
        {lines.map((l, i) => (
          <p key={i} className={l.className}>
            {l.node}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="clarity-zone relative">
      {/* Нижний дубль (aria-hidden): расфокус; прочитанные строки резки. */}
      <div aria-hidden className="absolute inset-0 space-y-2">
        {lines.map((l, i) => (
          <p
            key={i}
            ref={(el) => {
              registers[i](el);
              lineEls.current[i] = el;
            }}
            className={cn("clarity-blur", l.className)}
          >
            {l.node}
          </p>
        ))}
      </div>
      {/* Верхний слой: резкий реальный текст, обрезан пятном ясного зрения. */}
      <div ref={sharpRef} className="clarity-sharp relative space-y-2">
        {lines.map((l, i) => (
          <p key={i} className={l.className}>
            {l.node}
          </p>
        ))}
      </div>
    </div>
  );
}

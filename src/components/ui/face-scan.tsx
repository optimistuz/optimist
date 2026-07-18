"use client";

import { useEffect, useRef, useState } from "react";
import type { Pt } from "@/lib/face-shape";
import { faceFit } from "@/content/home";

/* ------------------------------------------------------------------
   Кино-скан (Блок 5) — поверх видео, ТОЛЬКО во время анализа.
   В духе фокус-грамматики: красные линии (#FD0000), не свечение.
   Слои:
   - горизонтальная линия-сканер с тонким градиентным следом 24px
     (без glow — запрет), проход сверху вниз и обратно ~1.6 с;
   - вспышки узлов 478-mesh у текущей высоты линии — будто линия
     «считывает» геометрию;
   - угловые брекеты-видоискатель (ink), слегка «дышат» к боксу лица;
   - бегущая строка статуса (моноширинная) — честно, что меряем.

   НЕ вечная анимация: компонент живёт лишь в subphase «analyzing»;
   завершение (наведение на резкость) ведёт родитель.
   Прогресс честный (5.3): при потере/наклоне лица (waiting) скан
   «ждёт» — статус «выровняйте лицо», узлы/линия приглушаются.

   reduced-motion (5.4): без линии и вспышек — статичная рамка-
   видоискатель + «Анализируем…», никакого мелькания.
   ------------------------------------------------------------------ */

const RED = "#FD0000";
const PERIOD = 1600; // мс на полный проход вниз-вверх
const TRAIL = 24; // px след линии
const MESH_BAND = 26; // px — полоса «считывания» у линии

// Узлы mesh для вспышек: разрежённая выборка по сетке 478 (каждый 6-й).
const NODES: number[] = (() => {
  const a: number[] = [];
  for (let i = 0; i < 468; i += 6) a.push(i);
  return a;
})();

/** Угловые брекеты-видоискатель — общий для анимной и статичной веток. */
function corners(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  breath: number,
  color: string
) {
  const len = Math.max(14, box.w * 0.12);
  const o = breath; // «дыхание» — смещение наружу
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  const L = box.x - o;
  const R = box.x + box.w + o;
  const T = box.y - o;
  const B = box.y + box.h + o;
  const seg = (hx: number, hy: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(hx + dx * len, hy);
    ctx.lineTo(hx, hy);
    ctx.lineTo(hx, hy + dy * len);
    ctx.stroke();
  };
  seg(L, T, 1, 1);
  seg(R, T, -1, 1);
  seg(L, B, 1, -1);
  seg(R, B, -1, -1);
}

function faceBox(
  lm: Pt[],
  project: (nx: number, ny: number) => [number, number]
) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  // Достаточно силуэтных крайних: лоб, подбородок, скулы (+ запас).
  for (const i of [10, 152, 234, 454, 21, 251, 172, 397]) {
    const p = lm[i];
    if (!p) continue;
    const [x, y] = project(p.x, p.y);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.1;
  return {
    x: minX - padX,
    y: minY - padY,
    w: maxX - minX + padX * 2,
    h: maxY - minY + padY * 2,
  };
}

export function FaceScan({
  latestRef,
  reduce,
  waiting,
  finale = false,
}: {
  latestRef: { current: { lm: Pt[] | null; w: number; h: number } };
  reduce: boolean;
  waiting: boolean;
  /** Такт вдоха: решение принято — вся сетка вспыхивает разом, линия уходит. */
  finale?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [statusIdx, setStatusIdx] = useState(0);
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  // Признак финала для петли. ⚠️ САМА МЕТКА ВРЕМЕНИ ставится в ПЕРВОМ КАДРЕ
  // покраски, а не здесь: раньше она бралась на рендере, а огибающая читалась
  // на покраске, и разрыв commit→первый кадр съедал голову 320-мс вспышки —
  // на загруженном A15 «щелчок фокуса» мог обрезаться или не показаться вовсе,
  // то есть ровно там, под что он и настроен (нашёл `fizik`).
  const finaleRef = useRef(false);
  finaleRef.current = finale;
  const finaleAtRef = useRef(0);

  // Бегущая строка статуса — только в анимной ветке.
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(
      () => setStatusIdx((i) => (i + 1) % faceFit.scan.statuses.length),
      PERIOD
    );
    return () => window.clearInterval(id);
  }, [reduce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let active = true;
    const start = performance.now();

    const ensureSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = canvas.clientWidth;
      const bh = canvas.clientHeight;
      const nw = Math.round(bw * dpr);
      const nh = Math.round(bh * dpr);
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
      return { dpr, bw, bh };
    };
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => ensureSize())
        : null;
    if (ro) ro.observe(canvas);

    // Пауза вне вьюпорта. Этот канвас ДОРОЖЕ соседнего (брекеты + след линии
    // + до 78 узлов), а до ухода камеры в standby проходит 8 с — всё это
    // время петля крутилась впустую за пределами экрана. Ровно тот дефект,
    // который только что починили в frame-overlay (нашёл `hronometrist`).
    let inView = true;
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              inView = entries[0]?.isIntersecting ?? true;
            },
            { threshold: 0.01 }
          )
        : null;
    if (io) io.observe(canvas);

    const projectorFor = (
      bw: number,
      bh: number,
      w: number,
      h: number
    ) => {
      const scale = Math.min(bw / w, bh / h);
      const dispW = w * scale;
      const dispH = h * scale;
      const offX = (bw - dispW) / 2;
      const offY = (bh - dispH) / 2;
      const project = (nx: number, ny: number): [number, number] => [
        offX + (1 - nx) * dispW, // зеркало по x (как видео)
        offY + ny * dispH,
      ];
      return { project, offY, dispH };
    };

    const drawStatic = () => {
      const { dpr, bw, bh } = ensureSize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      const { lm, w, h } = latestRef.current;
      let box = { x: bw * 0.2, y: bh * 0.12, w: bw * 0.6, h: bh * 0.76 };
      if (lm && w && h) {
        const { project } = projectorFor(bw, bh, w, h);
        const b = faceBox(lm, project);
        if (b) box = b;
      }
      corners(ctx, box, 0, "rgba(13,13,13,0.7)");
    };

    // reduced-motion: одна статичная рамка-видоискатель, без петли.
    if (reduce) {
      ensureSize();
      drawStatic();
      // перерисовать при ресайзе достаточно через ResizeObserver→drawStatic
      const onResize = () => drawStatic();
      window.addEventListener("resize", onResize);
      return () => {
        active = false;
        window.removeEventListener("resize", onResize);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      };
    }

    const draw = () => {
      if (!active) return;
      raf = requestAnimationFrame(draw);
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      if (!inView) return; // секция ушла из кадра — не рисуем

      const { dpr, bw, bh } = ensureSize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, bw, bh);

      const { lm, w, h } = latestRef.current;
      const wait = waitingRef.current || !lm || !w || !h;

      // Бокс лица (или центральный запасной)
      let box = { x: bw * 0.2, y: bh * 0.12, w: bw * 0.6, h: bh * 0.76 };
      let project: ((nx: number, ny: number) => [number, number]) | null = null;
      let region = { top: 0, height: bh };
      if (lm && w && h) {
        const pj = projectorFor(bw, bh, w, h);
        project = pj.project;
        region = { top: pj.offY, height: pj.dispH };
        const b = faceBox(lm, project);
        if (b) box = b;
      }

      // Брекеты «дышат» к боксу (±2px, синус по времени)
      const tms = performance.now();
      const breath = 2 + 2 * Math.sin(tms / 600);
      corners(ctx, box, breath, "rgba(13,13,13,0.75)");

      // ФИНАЛ (шаг 5): решение принято — сканирующая линия уходит, и вся сетка
      // вспыхивает разом. Вспышка ГРАФИЧЕСКАЯ: те же кресты #FD0000, что и в
      // проходе линии, только все сразу и с быстрым спадом. Никакого свечения
      // и никаких частиц — «дорого = точность» (CLAUDE.md, запреты).
      // Метка ставится здесь — в первом кадре, который реально красится.
      if (!finaleRef.current) finaleAtRef.current = 0;
      else if (!finaleAtRef.current) finaleAtRef.current = tms;

      const finaleAt = finaleAtRef.current;
      if (finaleAt) {
        const done = tms - finaleAt >= 320;
        // Вспышка отыграла — рисовать нечего. Без этого петля до самого
        // размонтирования обходила 78 узлов с globalAlpha 0 (`fizik`).
        if (done) return;
        if (project && lm) {
          const t = Math.min(1, (tms - finaleAt) / 320);
          // Резкий приход (первые ~15% времени) и мягкий спад — «щелчок».
          const a = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
          ctx.strokeStyle = RED;
          ctx.globalAlpha = a * 0.9;
          ctx.lineWidth = 1;
          // ОДИН путь на все узлы: в финале альфа общая, поэтому 78 отдельных
          // stroke() были бы 78 вызовами растеризатора вместо одного
          // (нашёл `hronometrist`). В проходе линии так нельзя — там альфа
          // у каждого узла своя, и батчинг честно не проходит.
          ctx.beginPath();
          for (const i of NODES) {
            const p = lm[i];
            if (!p) continue;
            const [x, y] = project(p.x, p.y);
            const s = 2.6;
            ctx.moveTo(x - s, y);
            ctx.lineTo(x + s, y);
            ctx.moveTo(x, y - s);
            ctx.lineTo(x, y + s);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        return; // линия и «считывание» в финале не рисуются
      }

      // Когда ждём (нет чистых кадров) — линию/узлы гасим, не «доезжаем».
      const dim = wait ? 0.25 : 1;

      // Позиция линии-сканера в пределах региона видео (треугольная волна)
      const phase = ((tms - start) % PERIOD) / PERIOD; // 0..1
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2; // 0..1..0
      const goingDown = phase < 0.5;
      const scanY = region.top + tri * region.height;

      // След линии 24px позади направления движения
      const trailDir = goingDown ? -1 : 1;
      const grad = ctx.createLinearGradient(0, scanY, 0, scanY + trailDir * TRAIL);
      grad.addColorStop(0, `rgba(253,0,0,${0.5 * dim})`);
      grad.addColorStop(1, "rgba(253,0,0,0)");
      ctx.fillStyle = grad;
      const tx = box.x - 6;
      const tw = box.w + 12;
      ctx.fillRect(tx, Math.min(scanY, scanY + trailDir * TRAIL), tw, TRAIL);

      // Сама линия
      ctx.strokeStyle = `rgba(253,0,0,${0.85 * dim})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, scanY);
      ctx.lineTo(tx + tw, scanY);
      ctx.stroke();

      // Вспышки узлов mesh у текущей высоты линии
      if (project && lm && !wait) {
        ctx.strokeStyle = RED;
        for (const i of NODES) {
          const p = lm[i];
          if (!p) continue;
          const [x, y] = project(p.x, p.y);
          const d = Math.abs(y - scanY);
          if (d < MESH_BAND) {
            const a = (1 - d / MESH_BAND) * 0.9;
            ctx.globalAlpha = a;
            ctx.lineWidth = 1;
            const s = 2.2;
            ctx.beginPath();
            ctx.moveTo(x - s, y);
            ctx.lineTo(x + s, y);
            ctx.moveTo(x, y - s);
            ctx.lineTo(x, y + s);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      void RED;
    };

    ensureSize();
    raf = requestAnimationFrame(draw);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    };
  }, [latestRef, reduce]);

  const status = reduce
    ? faceFit.scan.analyzing
    : waiting
    ? faceFit.scan.aligning
    : faceFit.scan.statuses[statusIdx];

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {/* Бегущая строка статуса — моноширинная, поверх низа кадра */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <span className="rounded-full bg-ink/65 px-3 py-1 font-mono text-[11px] tracking-wide text-paper">
          {status}
        </span>
      </div>
    </>
  );
}

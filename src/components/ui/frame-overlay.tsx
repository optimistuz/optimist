"use client";

import { useEffect, useRef } from "react";
import type { Pt } from "@/lib/face-shape";
import type { FrameKind } from "@/lib/fit-recommend";
import { MultiFilter } from "@/lib/one-euro";

/* ------------------------------------------------------------------
   Чертёж оправы на лице (Блок 4, переработка 4 — МАТЕРИАЛЬНЫЙ РЕНДЕР).
   Прошлые версии рисовали ОБВОДКУ (линия/штрих) — это всегда читается
   «нарисованно», игрушечно. Здесь оправа — материал: тело-заливка с
   градиентом свет→тень + тубус-объём по сечению валика (радиальный свет
   сверху-слева и затемнение снизу-справа внутри ободка), внешнее AO-
   кольцо отрывает оправу от кожи, металл (золото) vs ацетат (тёплый
   чёрный), блик-спекуляр по верхней кромке, стекло с отражением и мягкая
   контактная тень на лице. Геометрия и рендер выверены на превью
   (стенд scripts/frame-preview.html → headless-скриншот, см. память
   [[canvas-visual-verification]]) и по референсам реальных оправ (авиатор —
   широкая каплевидная линза на скулу + прямая бровь-перекладина и седло-
   переносица; клабмастер — связная браулайн-бровь МАТЕРИАЛОМ, не плоским
   штрихом; квадрат — чуть шире высоты со скруглением). Металлические оправы
   (round/clubmaster/aviator) несут силиконовые носоупоры на металлических
   рычажках; у ацетатных переносица цельная — носоупоров нет.

   ⚠️ ЗЕРКАЛО: видео отражено (scaleX −1); рисуем в той же зеркальной
   системе через инверсию x. ⚠️ letterbox: проекция по реальному
   прямоугольнику видео. ПОВОРОТ: каждая линза сжимается по горизонтали
   (squashL/squashR) по смещению носа в экранных координатах.

   Свет — сверху-слева (единое направление для всех бликов и теней).
   Потолок реализма у 2D на фото-лице — лёгкий «AR»-зазор; полностью его
   снимает только 3D (материалы+свет+полное слежение) — отдельный путь.
   ------------------------------------------------------------------ */

export type FrameAnchors = {
  cx: number;
  cy: number;
  angle: number;
  ipd: number;
  lensCY: number;
  squashL: number;
  squashR: number;
};

/** Одна линза: внешний и внутренний контуры ободка (для ленты-«тела»),
    центр и габариты — для градиентов стекла/материала. */
type LensRec = {
  outer: Path2D;
  inner: Path2D;
  cx: number;
  hw: number;
  top: number;
  bot: number;
};

export type FrameParts = {
  lenses: LensRec[];
  bridge: Path2D;
  temples: Path2D;
  brow?: Path2D; // тяжёлая бровь спереди (клабмастер)
  bar?: Path2D; // прямая бровь-перекладина спереди (авиатор)
  metal: boolean;
};

export interface FrameProvider {
  build(a: FrameAnchors): FrameParts;
}

const ACET_SCALE = 0.84; // внутренний контур ацетата (толстый ободок)
const METAL_SCALE = 0.9; // …металла (тонкий)

/* ---- Контуры линз (q — горизонтальное сжатие при повороте) -------- */

function roundLens(cx: number, cy: number, r: number, q: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.5, r * q), Math.max(0.5, r), 0, 0, Math.PI * 2);
  return p;
}
function ellipseLens(cx: number, cy: number, rx: number, ry: number, q: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.5, rx * q), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  return p;
}
function rectLens(cx: number, cy: number, hw: number, hh: number, q: number, rf: number): Path2D {
  const p = new Path2D();
  const HW = hw * q;
  const xl = cx - HW;
  const xr = cx + HW;
  const yt = cy - hh;
  const yb = cy + hh;
  const r = Math.min(rf * Math.min(HW, hh), HW * 0.85, hh * 0.85);
  p.moveTo(xl + r, yt);
  p.lineTo(xr - r, yt);
  p.quadraticCurveTo(xr, yt, xr, yt + r);
  p.lineTo(xr, yb - r);
  p.quadraticCurveTo(xr, yb, xr - r, yb);
  p.lineTo(xl + r, yb);
  p.quadraticCurveTo(xl, yb, xl, yb - r);
  p.lineTo(xl, yt + r);
  p.quadraticCurveTo(xl, yt, xl + r, yt);
  p.closePath();
  return p;
}
function aviatorLens(cx: number, cy: number, hw: number, hh: number, q: number, s: number): Path2D {
  const p = new Path2D();
  const X = (u: number) => cx + s * u * hw * q;
  const Y = (v: number) => cy + v * hh;
  p.moveTo(X(-0.92), Y(-0.6));
  p.bezierCurveTo(X(-0.36), Y(-0.9), X(0.46), Y(-0.94), X(0.96), Y(-0.56));
  p.bezierCurveTo(X(1.05), Y(-0.04), X(0.96), Y(0.5), X(0.6), Y(0.84));
  p.bezierCurveTo(X(0.34), Y(1.06), X(-0.12), Y(1.12), X(-0.5), Y(0.94));
  p.bezierCurveTo(X(-0.74), Y(0.8), X(-0.96), Y(0.22), X(-0.92), Y(-0.6));
  p.closePath();
  return p;
}
function catLens(cx: number, cy: number, hw: number, hh: number, q: number, s: number): Path2D {
  const p = new Path2D();
  const X = (u: number) => cx + s * u * hw * q;
  const Y = (v: number) => cy + v * hh;
  p.moveTo(X(-0.85), Y(-0.5));
  p.bezierCurveTo(X(-0.2), Y(-0.92), X(0.55), Y(-1.06), X(1.0), Y(-0.92));
  p.bezierCurveTo(X(1.06), Y(-0.44), X(1.0), Y(0.2), X(0.66), Y(0.6));
  p.bezierCurveTo(X(0.32), Y(0.96), X(-0.32), Y(0.96), X(-0.7), Y(0.62));
  p.bezierCurveTo(X(-0.92), Y(0.44), X(-0.9), Y(-0.12), X(-0.85), Y(-0.5));
  p.closePath();
  return p;
}
function hexLens(cx: number, cy: number, hw: number, hh: number, q: number): Path2D {
  const p = new Path2D();
  const X = (u: number) => cx + u * hw * q;
  const Y = (v: number) => cy + v * hh;
  p.moveTo(X(-0.46), Y(-1));
  p.lineTo(X(0.46), Y(-1));
  p.lineTo(X(1), Y(-0.04));
  p.lineTo(X(0.46), Y(1));
  p.lineTo(X(-0.46), Y(1));
  p.lineTo(X(-1), Y(-0.04));
  p.closePath();
  return p;
}
function lineP(pts: [number, number][]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  return p;
}
function arc(il: number, ir: number, y: number, d: number): Path2D {
  const p = new Path2D();
  const s = ir - il;
  p.moveTo(il, y);
  p.bezierCurveTo(il + s * 0.26, y - d, ir - s * 0.26, y - d, ir, y);
  return p;
}
function templeArms(ol: number, or_: number, y: number, ipd: number): Path2D {
  const p = new Path2D();
  const hinge = ipd * 0.05;
  const reach = ipd * 0.22;
  const lift = ipd * 0.05;
  p.moveTo(or_, y);
  p.lineTo(or_ + hinge, y - lift * 0.2);
  p.lineTo(or_ + hinge + reach, y - lift);
  p.moveTo(ol, y);
  p.lineTo(ol - hinge, y - lift * 0.2);
  p.lineTo(ol - hinge - reach, y - lift);
  return p;
}

/** Пара линз из контур-функции: outer (q) + inner (q, уменьшен scale). */
function pair(
  shape: (c: number, hwv: number, hhv: number, q: number) => Path2D,
  xh: number,
  lensCY: number,
  hw: number,
  hh: number,
  sqL: number,
  sqR: number,
  scale: number
): LensRec[] {
  const top = lensCY - hh;
  const bot = lensCY + hh;
  return [
    {
      outer: shape(-xh, hw, hh, sqL),
      inner: shape(-xh, hw * scale, hh * scale, sqL),
      cx: -xh,
      hw,
      top,
      bot,
    },
    {
      outer: shape(xh, hw, hh, sqR),
      inner: shape(xh, hw * scale, hh * scale, sqR),
      cx: xh,
      hw,
      top,
      bot,
    },
  ];
}

/* ---- Провайдеры силуэтов ----------------------------------------- */

const round: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const r = ipd * 0.37;
    return {
      lenses: pair((c, hwv, _h, q) => roundLens(c, lensCY, hwv, q), xh, lensCY, r, r, squashL, squashR, METAL_SCALE),
      bridge: arc(-xh + r * squashL, xh - r * squashR, lensCY - r * 0.34, r * 0.36),
      temples: templeArms(-xh - r * squashL, xh + r * squashR, lensCY - r * 0.1, ipd),
      metal: true,
    };
  },
};

const oval: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const rx = ipd * 0.36;
    const ry = ipd * 0.3;
    return {
      lenses: pair((c, hwv, hhv, q) => ellipseLens(c, lensCY, hwv, hhv, q), xh, lensCY, rx, ry, squashL, squashR, ACET_SCALE),
      bridge: arc(-xh + rx * squashL, xh - rx * squashR, lensCY - ry * 0.28, ry * 0.3),
      temples: templeArms(-xh - rx * squashL, xh + rx * squashR, lensCY - ry * 0.12, ipd),
      metal: false,
    };
  },
};

const rectangle: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.39;
    const hh = ipd * 0.29;
    return {
      lenses: pair((c, hwv, hhv, q) => rectLens(c, lensCY, hwv, hhv, q, 0.3), xh, lensCY, hw, hh, squashL, squashR, ACET_SCALE),
      bridge: arc(-xh + hw * squashL, xh - hw * squashR, lensCY - hh * 0.5, hh * 0.3),
      temples: templeArms(-xh - hw * squashL, xh + hw * squashR, lensCY - hh * 0.45, ipd),
      metal: false,
    };
  },
};

const square: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.36;
    const hh = ipd * 0.33;
    return {
      lenses: pair((c, hwv, hhv, q) => rectLens(c, lensCY, hwv, hhv, q, 0.16), xh, lensCY, hw, hh, squashL, squashR, ACET_SCALE),
      bridge: arc(-xh + hw * squashL, xh - hw * squashR, lensCY - hh * 0.56, hh * 0.26),
      temples: templeArms(-xh - hw * squashL, xh + hw * squashR, lensCY - hh * 0.5, ipd),
      metal: false,
    };
  },
};

const clubmaster: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.37;
    const hh = ipd * 0.3;
    const rf = 0.28;
    const yt = lensCY - hh;
    const HWl = hw * squashL;
    const HWr = hw * squashR;
    const rL = Math.min(rf * Math.min(HWl, hh), HWl * 0.85, hh * 0.85);
    const rR = Math.min(rf * Math.min(HWr, hh), HWr * 0.85, hh * 0.85);
    const dip = hh * 0.12;
    // Связная браулайн-бровь: от внешних углов обеих линз к лёгкому
    // провису у переносицы — единая тяжёлая верхняя планка (без разрыва
    // над переносицей, как у настоящего клабмастера).
    const brow = new Path2D();
    brow.moveTo(-xh - HWl, yt + rL * 1.5);
    brow.quadraticCurveTo(-xh - HWl, yt, -xh - HWl + rL, yt);
    brow.lineTo(-xh + HWl, yt);
    brow.quadraticCurveTo(-ipd * 0.05, yt + dip * 0.35, 0, yt + dip);
    brow.quadraticCurveTo(ipd * 0.05, yt + dip * 0.35, xh - HWr, yt);
    brow.lineTo(xh + HWr - rR, yt);
    brow.quadraticCurveTo(xh + HWr, yt, xh + HWr, yt + rR * 1.5);
    return {
      lenses: pair((c, hwv, hhv, q) => rectLens(c, lensCY, hwv, hhv, q, rf), xh, lensCY, hw, hh, squashL, squashR, METAL_SCALE),
      bridge: arc(-xh + HWl, xh - HWr, lensCY - hh * 0.5, hh * 0.24),
      temples: templeArms(-xh - HWl, xh + HWr, lensCY - hh * 0.55, ipd),
      brow,
      metal: true,
    };
  },
};

const aviator: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.44;
    const hh = ipd * 0.4;
    const barY = lensCY - hh * 0.58;
    const br = ipd * 0.34;
    return {
      lenses: [
        ...pair((c, hwv, hhv, q) => aviatorLens(c, lensCY, hwv, hhv, q, -1), xh, lensCY, hw, hh, squashL, squashL, 0.92).slice(0, 1),
        ...pair((c, hwv, hhv, q) => aviatorLens(c, lensCY, hwv, hhv, q, 1), xh, lensCY, hw, hh, squashR, squashR, 0.92).slice(1, 2),
      ],
      bridge: arc(-ipd * 0.12, ipd * 0.12, lensCY - hh * 0.18, hh * 0.15),
      bar: lineP([
        [-br, barY],
        [br, barY],
      ]),
      temples: templeArms(-xh - hw * squashL, xh + hw * squashR, lensCY - hh * 0.42, ipd),
      metal: true,
    };
  },
};

const catEye: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.37;
    const hh = ipd * 0.31;
    return {
      lenses: [
        ...pair((c, hwv, hhv, q) => catLens(c, lensCY, hwv, hhv, q, -1), xh, lensCY, hw, hh, squashL, squashL, ACET_SCALE).slice(0, 1),
        ...pair((c, hwv, hhv, q) => catLens(c, lensCY, hwv, hhv, q, 1), xh, lensCY, hw, hh, squashR, squashR, ACET_SCALE).slice(1, 2),
      ],
      bridge: arc(-xh + hw * 0.85 * squashL, xh - hw * 0.85 * squashR, lensCY - hh * 0.44, hh * 0.36),
      temples: templeArms(-xh - hw * squashL, xh + hw * squashR, lensCY - hh * 0.52, ipd),
      metal: false,
    };
  },
};

const geometric: FrameProvider = {
  build({ ipd, lensCY, squashL, squashR }) {
    const xh = ipd / 2;
    const hw = ipd * 0.37;
    const hh = ipd * 0.32;
    return {
      lenses: pair((c, hwv, hhv, q) => hexLens(c, lensCY, hwv, hhv, q), xh, lensCY, hw, hh, squashL, squashR, ACET_SCALE),
      bridge: arc(-xh + hw * 0.46 * squashL, xh - hw * 0.46 * squashR, lensCY - hh * 0.74, hh * 0.12),
      temples: templeArms(-xh - hw * squashL, xh + hw * squashR, lensCY - hh * 0.04, ipd),
      metal: false,
    };
  },
};

const BUILDERS: Record<FrameKind, FrameProvider> = {
  round,
  oval,
  rectangle,
  square,
  clubmaster,
  aviator,
  catEye,
  geometric,
};

/* ---- Компонент оверлея ------------------------------------------- */

const FADE_MS = 200;
const YAW_GAIN = 0.62;
const YAW_MAX = 0.34;

export function FrameOverlay({
  kind,
  latestRef,
  reduce,
}: {
  kind: FrameKind;
  latestRef: { current: { lm: Pt[] | null; w: number; h: number } };
  reduce: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<{ from: FrameKind; to: FrameKind; t: number }>({
    from: kind,
    to: kind,
    t: 1,
  });

  useEffect(() => {
    const f = fadeRef.current;
    if (f.to === kind) return;
    fadeRef.current = { from: f.to, to: kind, t: reduce ? 1 : 0 };
  }, [kind, reduce]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let prev = performance.now();
    let lastPaint = 0;
    const PAINT_MS = 16; // 60 fps: интерполяция якорей сглаживает шаги детекции
    let active = true;
    // Сглаживание якорей примерки. Параметры — старт; финальная настройка на
    // живой камере (приёмка). Сброс при потере лица (ниже). Фундамент one-euro.ts.
    const smoother = new MultiFilter({ minCutoff: 1.2, beta: 0.02, dCutoff: 1.2 });

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
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => ensureSize()) : null;
    if (ro) ro.observe(canvas);

    const anchorsFrom = (
      lm: Pt[],
      project: (nx: number, ny: number) => [number, number]
    ): FrameAnchors | null => {
      const has = lm.length >= 478;
      const eyeL = has ? lm[468] : mid(lm[33], lm[133]);
      const eyeR = has ? lm[473] : mid(lm[263], lm[362]);
      if (!eyeL || !eyeR) return null;
      let [ax, ay] = project(eyeL.x, eyeL.y);
      let [bx, by] = project(eyeR.x, eyeR.y);
      if (ax > bx) {
        [ax, bx] = [bx, ax];
        [ay, by] = [by, ay];
      }
      const cx = (ax + bx) / 2;
      const cy = (ay + by) / 2;
      const angle = Math.atan2(by - ay, bx - ax);
      const ipd = Math.hypot(bx - ax, by - ay);
      if (!ipd || !Number.isFinite(ipd)) return null;
      let squashL = 1;
      let squashR = 1;
      const nose = lm[1];
      if (nose) {
        const [nx] = project(nose.x, nose.y);
        const dA = Math.abs(nx - ax);
        const dB = Math.abs(nx - bx);
        const sum = dA + dB;
        if (sum > 0) {
          squashL = 1 - Math.min(YAW_MAX, Math.max(0, (dB - dA) / sum) * YAW_GAIN);
          squashR = 1 - Math.min(YAW_MAX, Math.max(0, (dA - dB) / sum) * YAW_GAIN);
        }
      }
      return { cx, cy, angle, ipd, lensCY: ipd * 0.07, squashL, squashR };
    };

    // Материальный штрих фурнитуры: тёмное тело + блик сверху.
    const strokeMat = (path: Path2D, w: number, metal: boolean) => {
      ctx.lineWidth = w;
      ctx.strokeStyle = metal ? "#7d6234" : "#1b1611";
      ctx.stroke(path);
      ctx.lineWidth = Math.max(1, w * 0.34);
      ctx.strokeStyle = metal ? "rgba(255,240,205,0.55)" : "rgba(255,250,240,0.38)";
      ctx.stroke(path);
    };

    // Линза. Объём строится в шесть слоёв: (a) внешнее AO-кольцо отрывает
    // ободок от кожи; (b) стекло-тинт с косыми отражениями (глаза видны);
    // (c) тело-ободок базовым вертикальным градиентом; (d) тубус-объём —
    // внутри ободка свет сверху-слева и затемнение снизу-справа имитируют
    // круглое сечение валика; (e) спекуляр по верхней кромке; (f) тёмная
    // фаска по проёму. Свет единый — сверху-слева.
    const drawLens = (l: LensRec, metal: boolean) => {
      const { outer, inner, cx, hw, top, bot } = l;
      const h = bot - top;
      // (a) внешнее AO-кольцо — мягкая тень снаружи ободка
      ctx.save();
      ctx.filter = "blur(2px)";
      ctx.lineWidth = metal ? 3 : 4.5;
      ctx.strokeStyle = "rgba(18,10,4,0.35)";
      ctx.stroke(outer);
      ctx.restore();
      // (b) стекло (полупрозрачно — глаза видны)
      ctx.save();
      ctx.clip(outer);
      const gg = ctx.createLinearGradient(0, top, 0, bot);
      gg.addColorStop(0, "rgba(205,218,228,0.17)");
      gg.addColorStop(0.5, "rgba(190,205,216,0.05)");
      gg.addColorStop(1, "rgba(140,130,120,0.045)");
      ctx.fillStyle = gg;
      ctx.fillRect(cx - hw - 6, top - 6, hw * 2 + 12, h + 12);
      const lft = cx - hw;
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(lft - 2, top + h * 0.2);
      ctx.lineTo(lft + hw * 1.0, top - 8);
      ctx.lineTo(lft + hw * 1.28, top - 8);
      ctx.lineTo(lft + hw * 0.18, top + h * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(lft + hw * 1.34, top - 8);
      ctx.lineTo(lft + hw * 1.56, top - 8);
      ctx.lineTo(lft + hw * 0.6, top + h * 0.52);
      ctx.lineTo(lft + hw * 0.44, top + h * 0.52);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // (c) тело ободка — базовый вертикальный градиент
      const band = new Path2D();
      band.addPath(outer);
      band.addPath(inner);
      const g = ctx.createLinearGradient(0, top, 0, bot);
      if (metal) {
        g.addColorStop(0, "#f0d89a");
        g.addColorStop(0.32, "#caa55f");
        g.addColorStop(0.62, "#8a6c39");
        g.addColorStop(1, "#49371a");
      } else {
        g.addColorStop(0, "#4d4236");
        g.addColorStop(0.4, "#241d15");
        g.addColorStop(1, "#0a0805");
      }
      ctx.fillStyle = g;
      ctx.fill(band, "evenodd");
      // (d) тубус-объём: внутри ободка свет сверху-слева + затемнение
      // снизу-справа — круглое сечение валика
      ctx.save();
      ctx.clip(band, "evenodd");
      const rg = ctx.createRadialGradient(
        cx - hw * 0.55,
        top + h * 0.1,
        h * 0.04,
        cx - hw * 0.18,
        top + h * 0.4,
        hw * 1.75
      );
      rg.addColorStop(0, metal ? "rgba(255,246,212,0.62)" : "rgba(150,138,120,0.5)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(cx - hw - 8, top - 8, hw * 2 + 16, h + 16);
      const rg2 = ctx.createRadialGradient(
        cx + hw * 0.5,
        bot - h * 0.04,
        h * 0.04,
        cx + hw * 0.2,
        bot,
        hw * 1.75
      );
      rg2.addColorStop(0, "rgba(0,0,0,0.5)");
      rg2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg2;
      ctx.fillRect(cx - hw - 8, top - 8, hw * 2 + 16, h + 16);
      ctx.restore();
      // (e) спекуляр по верхней кромке
      const hg = ctx.createLinearGradient(0, top, 0, top + h * 0.5);
      hg.addColorStop(0, metal ? "rgba(255,250,226,0.95)" : "rgba(255,250,242,0.6)");
      hg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.lineWidth = metal ? 1.5 : 2.4;
      ctx.strokeStyle = hg;
      ctx.stroke(outer);
      // (f) тёмная фаска по проёму
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke(inner);
    };

    // Браулайн-бровь как МАТЕРИАЛ (а не плоский толстый штрих): тело-градиент
    // свет→тень + спекуляр сверху + затемнение снизу — то же сечение валика,
    // что у ободка. Плоский штрих читался мультяшно.
    const drawBrow = (brow: Path2D, t: number, ipd: number) => {
      const w = ipd * 0.105;
      const top = t - w * 0.62;
      const bot = t + w * 1.05;
      // AO под бровью — отрыв от лица
      ctx.save();
      ctx.filter = "blur(2px)";
      ctx.lineWidth = w + 3;
      ctx.strokeStyle = "rgba(10,6,3,0.32)";
      ctx.stroke(brow);
      ctx.restore();
      // тело
      const bg = ctx.createLinearGradient(0, top, 0, bot);
      bg.addColorStop(0, "#4d4236");
      bg.addColorStop(0.45, "#241d15");
      bg.addColorStop(1, "#0a0805");
      ctx.lineWidth = w;
      ctx.strokeStyle = bg;
      ctx.stroke(brow);
      // спекуляр сверху
      const sg = ctx.createLinearGradient(0, top, 0, bot);
      sg.addColorStop(0, "rgba(255,250,242,0.6)");
      sg.addColorStop(0.22, "rgba(255,250,242,0)");
      ctx.strokeStyle = sg;
      ctx.stroke(brow);
      // затемнение снизу
      const dg = ctx.createLinearGradient(0, top, 0, bot);
      dg.addColorStop(0.68, "rgba(0,0,0,0)");
      dg.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.strokeStyle = dg;
      ctx.stroke(brow);
    };

    // Носоупоры металлических оправ: тонкий металлический рычажок + мягкая
    // силиконовая подушечка (полупрозрачная, с бликом и контактной тенью).
    // Низ подушечек расходится наружу по форме носа, верх — к центру под
    // переносицей. Только metal-оправы (у ацетата переносица цельная).
    const drawNosePads = (ipd: number, lensCY: number) => {
      const padLen = ipd * 0.105;
      const padW = ipd * 0.033;
      const tilt = 0.34;
      for (const s of [-1, 1]) {
        const cx = s * ipd * 0.085;
        const cy = lensCY + ipd * 0.13;
        const ax = s * ipd * 0.028;
        const ay = lensCY + ipd * 0.01;
        const px = cx - s * Math.sin(tilt) * padLen * 0.85;
        const py = cy - Math.cos(tilt) * padLen * 0.85;
        // рычажок (металл + блик)
        ctx.lineWidth = ipd * 0.017;
        ctx.strokeStyle = "#8a6c39";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.lineWidth = ipd * 0.006;
        ctx.strokeStyle = "rgba(255,240,205,0.55)";
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(px, py);
        ctx.stroke();
        // подушечка (силикон)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-s * tilt);
        ctx.save();
        ctx.filter = "blur(1.5px)";
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(1, 2, padW, padLen, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const pg = ctx.createLinearGradient(-padW, -padLen, padW, padLen);
        pg.addColorStop(0, "rgba(228,233,238,0.55)");
        pg.addColorStop(1, "rgba(120,130,140,0.34)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.ellipse(0, 0, padW, padLen, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.ellipse(-padW * 0.28, -padLen * 0.42, padW * 0.34, padLen * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = ipd * 0.005;
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.ellipse(0, 0, padW, padLen, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };

    const strokeFrame = (parts: FrameParts, a: FrameAnchors, alpha: number) => {
      const { lenses, bridge, temples, brow, bar, metal } = parts;
      const ipd = a.ipd;
      ctx.save();
      ctx.translate(a.cx, a.cy);
      ctx.rotate(a.angle);
      ctx.globalAlpha = alpha;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // контактная тень на лице (мягкая, со смещением вниз)
      ctx.save();
      ctx.filter = "blur(6px)";
      ctx.globalAlpha = alpha * 0.2;
      ctx.fillStyle = "#000";
      ctx.translate(1.5, ipd * 0.05);
      lenses.forEach((l) => ctx.fill(l.outer));
      ctx.restore();

      // фурнитура позади линз
      strokeMat(temples, metal ? ipd * 0.03 : ipd * 0.045, metal);
      strokeMat(bridge, metal ? ipd * 0.032 : ipd * 0.05, metal);

      // линзы (стекло + ободок-материал)
      lenses.forEach((l) => drawLens(l, metal));

      // носоупоры (только металл — у ацетата переносица цельная)
      if (metal) drawNosePads(ipd, a.lensCY);

      // фронтальная фурнитура поверх линз
      if (bar) strokeMat(bar, ipd * 0.045, true);
      if (brow) drawBrow(brow, lenses[0].top, ipd);

      ctx.restore();
    };

    const draw = () => {
      if (!active) return;
      raf = requestAnimationFrame(draw);

      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      const now = performance.now();
      if (now - lastPaint < PAINT_MS) return; // троттлинг покраски по PAINT_MS (60 fps)
      const dt = now - prev;
      prev = now;
      lastPaint = now;

      const { dpr, bw, bh } = ensureSize();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, bw, bh);

      const { lm, w, h } = latestRef.current;
      if (!lm || !w || !h) return;

      const scale = Math.min(bw / w, bh / h);
      const dispW = w * scale;
      const dispH = h * scale;
      const offX = (bw - dispW) / 2;
      const offY = (bh - dispH) / 2;
      const project = (nx: number, ny: number): [number, number] => [
        offX + (1 - nx) * dispW,
        offY + ny * dispH,
      ];

      const raw = anchorsFrom(lm, project);
      if (!raw) {
        smoother.reset(); // лицо потеряно — начать сглаживание заново
        return;
      }

      // One-Euro по каналам: 60 fps без дрожи между детекциями (24–30 fps).
      const ipd = smoother.filter("ipd", raw.ipd, now);
      const a: FrameAnchors = {
        cx: smoother.filter("cx", raw.cx, now),
        cy: smoother.filter("cy", raw.cy, now),
        angle: smoother.filter("angle", raw.angle, now),
        ipd,
        lensCY: ipd * 0.07, // производная от ipd, как в anchorsFrom
        squashL: smoother.filter("squashL", raw.squashL, now),
        squashR: smoother.filter("squashR", raw.squashR, now),
      };

      const f = fadeRef.current;
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / FADE_MS);
        if (f.from !== f.to) strokeFrame(BUILDERS[f.from].build(a), a, 1 - f.t);
      }
      strokeFrame(BUILDERS[f.to].build(a), a, f.t < 1 ? f.t : 1);
    };

    ensureSize();
    raf = requestAnimationFrame(draw);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      } catch {
        /* noop */
      }
    };
  }, [latestRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

function mid(a?: Pt, b?: Pt): Pt | undefined {
  if (!a || !b) return undefined;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/* ==================================================================
   Юнит-тест паспорта посадки (этап 7, шаг 3).
   Чистые функции, без сети и без тест-фреймворка. Запуск:

     npx tsc -p tsconfig.test.json
     node .tmp-test/lib/fit-passport.test.js

   Проверяет ровно то, чем модуль рискует соврать клиенту:
   миллиметры на синтетике с ИЗВЕСТНОЙ геометрией (аналитика сходится),
   отбраковку повёрнутых и неполных кадров, санити-границы, медианную
   устойчивость к выбросам и буквальность стирания.
   ================================================================== */

import {
  measureFrame,
  measurableFrame,
  createPassportMeter,
  widthStepForFace,
  IRIS_MM,
  MEASURE_WINDOW,
} from "./fit-passport";
import type { Pt } from "./face-shape";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) <= eps;
}

const W = 1280;
const H = 720;

type FaceOpts = {
  irisPx?: number;
  pdPx?: number;
  cheekPx?: number;
  bridgeUpPx?: number;
  /** Сдвиг кончика носа от центра, px — имитация поворота головы. */
  noseOffsetPx?: number;
  /** Сколько точек отдать (меньше 478 — камера без refineLandmarks). */
  length?: number;
};

/**
 * Синтетическое лицо с точно заданной геометрией в пикселях кадра.
 * Ландмарки нормированы (0..1), как у MediaPipe.
 */
function makeFace(o: FaceOpts = {}): Pt[] {
  const irisPx = o.irisPx ?? 40;
  const pdPx = o.pdPx ?? 215.3846; // при irisPx 40 → ровно 63 мм
  const cheekPx = o.cheekPx ?? 471.7949; // при irisPx 40 → ровно 138 мм
  const bridgeUpPx = o.bridgeUpPx ?? 20;
  const noseOffsetPx = o.noseOffsetPx ?? 0;
  const len = o.length ?? 478;

  const lm: Pt[] = Array.from({ length: len }, () => ({ x: 0.5, y: 0.5 }));

  const cxN = 0.5;
  const eyeYN = 0.45;
  const px = (v: number) => v / W; // px → нормированный x
  const py = (v: number) => v / H; // px → нормированный y

  // Скулы и нос на одной горизонтали: расстояния нос↔скулы чисто
  // горизонтальные, поворот задаётся одним смещением носа.
  const faceYN = 0.55;
  lm[234] = { x: cxN - px(cheekPx / 2), y: faceYN };
  lm[454] = { x: cxN + px(cheekPx / 2), y: faceYN };
  lm[1] = { x: cxN + px(noseOffsetPx), y: faceYN };
  lm[168] = { x: cxN, y: eyeYN - py(bridgeUpPx) };

  // Радужки: центр + кольцо (горизонтальная и вертикальная пары равны
  // диаметру, порядок точек модулю не важен — он берёт максимум).
  const half = irisPx / 2;
  const mkIris = (centerX: number, ci: number, ring: number[]) => {
    lm[ci] = { x: centerX, y: eyeYN };
    lm[ring[0]] = { x: centerX - px(half), y: eyeYN };
    lm[ring[1]] = { x: centerX, y: eyeYN - py(half) };
    lm[ring[2]] = { x: centerX + px(half), y: eyeYN };
    lm[ring[3]] = { x: centerX, y: eyeYN + py(half) };
  };
  mkIris(cxN - px(pdPx / 2), 468, [469, 470, 471, 472]);
  mkIris(cxN + px(pdPx / 2), 473, [474, 475, 476, 477]);

  // Обрезаем ПОСЛЕ сборки: присваивание lm[468…477] само достраивает массив,
  // и «камера без радужек» иначе получалась бы полной (ловушка заготовки).
  return len < lm.length ? lm.slice(0, len) : lm;
}

console.log("\n== Паспорт посадки: миллиметры ==");
{
  const m = measureFrame(makeFace(), W, H);
  check("кадр измеряется", m !== null);
  if (m) {
    check("PD = 63 мм на известной геометрии", near(m.pd, 63), `получено ${m.pd}`);
    check(
      "ширина лица = 138 мм",
      near(m.faceWidth, 138),
      `получено ${m.faceWidth}`
    );
    // 20 px при линейке 40 px = полдиаметра радужки = 5,85 мм
    check(
      "высота переносицы = 5,85 мм",
      near(m.bridgeHeight, IRIS_MM / 2),
      `получено ${m.bridgeHeight}`
    );
  }
}

{
  // Масштаб не должен зависеть от того, далеко человек или близко:
  // вдвое крупнее в кадре — те же миллиметры.
  const far = measureFrame(makeFace(), W, H);
  const close = measureFrame(
    makeFace({ irisPx: 80, pdPx: 430.7692, cheekPx: 943.5897, bridgeUpPx: 40 }),
    W,
    H
  );
  check("замер не зависит от расстояния до камеры", !!far && !!close && near(far.pd, close.pd, 0.1), close ? `близко ${close.pd}` : "нет замера");
}

console.log("\n== Отбраковка непригодных кадров ==");
{
  check(
    "повёрнутая голова не измеряется",
    measureFrame(makeFace({ noseOffsetPx: 60 }), W, H) === null
  );
  check(
    "лёгкий поворот в допуске проходит",
    measureFrame(makeFace({ noseOffsetPx: 4 }), W, H) !== null
  );
  check(
    "без радужек (468 точек) замера нет",
    measureFrame(makeFace({ length: 468 }), W, H) === null
  );
  check("пустые ландмарки не роняют", measureFrame(null, W, H) === null);
  check(
    "measurableFrame согласован с measureFrame",
    measurableFrame(makeFace(), W, H) === true &&
      measurableFrame(makeFace({ noseOffsetPx: 60 }), W, H) === false
  );
}

{
  // Сбой детекции даёт нечеловеческие числа — их нельзя отдавать наружу.
  const tiny = measureFrame(makeFace({ pdPx: 60 }), W, H); // ≈17,5 мм
  check("PD вне человеческого диапазона отбрасывается", tiny === null);
  const huge = measureFrame(makeFace({ cheekPx: 1000 }), W, H); // ≈292 мм
  check("ширина лица вне диапазона отбрасывается", huge === null);
}

console.log("\n== Ступень ширины ==");
{
  check("138 мм → ступень 3 (средняя)", widthStepForFace(138) === 3);
  check("120 мм → ступень 1", widthStepForFace(120) === 1);
  check("150 мм → ступень 5", widthStepForFace(150) === 5);
}

console.log("\n== Накопитель ==");
{
  const meter = createPassportMeter();
  const face = makeFace();
  check("пустой накопитель молчит", meter.read() === null);
  check("прогресс с нуля", meter.progress() === 0);

  for (let i = 0; i < MEASURE_WINDOW - 1; i += 1) meter.add(face, W, H);
  check("до окна паспорт не выдаётся", meter.read() === null);
  check("не готов", meter.ready() === false);

  meter.add(face, W, H);
  const p = meter.read();
  check("окно набрано — паспорт есть", p !== null);
  if (p) {
    check("PD округлён до 0,5", near(p.pd, 63, 0.26), `получено ${p.pd}`);
    check("ширина целая", Number.isInteger(p.faceWidth));
    check("ступень посчитана", p.widthStep === 3);
    check("допуск объявлен", p.tolerance === 2);
  }
}

{
  // Негодные кадры не должны портить замер и не должны двигать прогресс.
  const meter = createPassportMeter();
  const bad = makeFace({ noseOffsetPx: 60 });
  for (let i = 0; i < 10; i += 1) meter.add(bad, W, H);
  check("негодные кадры не копятся", meter.count() === 0);
}

{
  // Медиана обязана пережить редкий выброс детекции.
  const meter = createPassportMeter();
  const good = makeFace();
  const skew = makeFace({ pdPx: 250 }); // ≈73 мм, фронтальный, но неверный
  for (let i = 0; i < MEASURE_WINDOW - 4; i += 1) meter.add(good, W, H);
  for (let i = 0; i < 4; i += 1) meter.add(skew, W, H);
  const p = meter.read();
  check("выбросы не сдвигают медиану", !!p && near(p.pd, 63, 0.26), p ? `получено ${p.pd}` : "нет паспорта");
}

{
  const meter = createPassportMeter();
  const face = makeFace();
  for (let i = 0; i < MEASURE_WINDOW; i += 1) meter.add(face, W, H);
  meter.reset();
  check("стирание буквально: паспорта нет", meter.read() === null);
  check("стирание буквально: счётчик обнулён", meter.count() === 0);
}

console.log(`\n==== Итог: ${passed} прошло, ${failed} провалено ====\n`);
if (failed > 0) process.exit(1);

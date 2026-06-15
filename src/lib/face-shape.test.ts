/* ==================================================================
   Юнит-тест классификатора формы лица (Блок 3.4).
   Чистые функции, без сети и без тест-фреймворка. Запуск:

     npx tsc src/lib/face-shape.ts src/lib/face-shape.test.ts \
       --outDir .tmp-facetest --module commonjs --target es2019 \
       --moduleResolution node --skipLibCheck --esModuleInterop
     node .tmp-facetest/face-shape.test.js

   Проверяет: синтетические наборы отношений дают ожидаемый primary
   (овал/круг/квадрат/удлинённое/сердце/диамант), смесь при близких
   score, и медианное усреднение оценщика. Результаты — в REPORT-FACE.
   ================================================================== */

import {
  classify,
  createEstimator,
  type Features,
  type Shape,
} from "./face-shape";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

function expectPrimary(name: string, f: Features, want: Shape) {
  const d = classify(f);
  check(
    `${name} → ${want}`,
    d.primary === want,
    `получили ${d.primary} (p=${(d.confidence * 100).toFixed(0)}%, 2-е ${d.secondary})`
  );
}

console.log("Классификатор формы лица — синтетические наборы:");

// На прототипах
expectPrimary("овал (прототип)", { r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 }, "oval");
expectPrimary("круг (прототип)", { r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.15 }, "round");
expectPrimary("квадрат (прототип)", { r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.85 }, "square");
expectPrimary("удлинённое (прототип)", { r1: 1.78, r2: 1.0, r3: 1.0, jaw: 0.6 }, "long");
expectPrimary("сердце (прототип)", { r1: 1.4, r2: 1.38, r3: 1.05, jaw: 0.4 }, "heart");
expectPrimary("диамант (прототип)", { r1: 1.5, r2: 0.95, r3: 1.2, jaw: 0.5 }, "diamond");

// На «зашумлённых» реалистичных наборах (со смещением от прототипа)
console.log("Зашумлённые наборы:");
expectPrimary("овал~", { r1: 1.48, r2: 1.12, r3: 1.02, jaw: 0.3 }, "oval");
expectPrimary("круг~", { r1: 1.1, r2: 1.02, r3: 0.99, jaw: 0.2 }, "round");
expectPrimary("квадрат~", { r1: 1.12, r2: 0.99, r3: 1.0, jaw: 0.8 }, "square");
expectPrimary("удлинённое~", { r1: 1.7, r2: 0.98, r3: 1.0, jaw: 0.55 }, "long");
expectPrimary("сердце~", { r1: 1.35, r2: 1.3, r3: 1.06, jaw: 0.45 }, "heart");

// Честная уверенность: смесь при близких score, уверенность при ясном
console.log("Смесь / уверенность:");
const mix = classify({ r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.5 }); // ровно между круг/квадрат
check(
  "круг↔квадрат на границе → смесь",
  mix.mixture === true,
  `gap мал? primary ${mix.primary}, 2-е ${mix.secondary}, mixture=${mix.mixture}`
);
const clear = classify({ r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.0 }); // явный круг
check(
  "явный круг → уверенно",
  clear.primary === "round" && clear.confident === true,
  `primary ${clear.primary}, confident=${clear.confident}`
);

// Сумма нормированных score = 1
const sums = classify({ r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 }).scores;
const total = Object.values(sums).reduce((a, b) => a + b, 0);
check("нормировка score → сумма 1", Math.abs(total - 1) < 1e-9, `сумма ${total}`);

// Оценщик: медиана окна, прогресс, решение
console.log("Оценщик (скользящее окно):");
const est = createEstimator(10);
// 10 «овальных» кадров с дрожанием (включая один выброс)
const noisy: Features[] = [
  { r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 },
  { r1: 1.48, r2: 1.1, r3: 1.01, jaw: 0.33 },
  { r1: 1.52, r2: 1.06, r3: 0.99, jaw: 0.37 },
  { r1: 1.49, r2: 1.09, r3: 1.0, jaw: 0.34 },
  { r1: 1.05, r2: 1.0, r3: 1.0, jaw: 0.9 }, // выброс (как круг/квадрат)
  { r1: 1.51, r2: 1.07, r3: 1.0, jaw: 0.36 },
  { r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 },
  { r1: 1.47, r2: 1.11, r3: 1.02, jaw: 0.32 },
  { r1: 1.53, r2: 1.05, r3: 0.98, jaw: 0.38 },
  { r1: 1.5, r2: 1.08, r3: 1.0, jaw: 0.35 },
];
noisy.forEach((f) => est.add(f));
check("прогресс достиг 100%", est.progress() === 1, `progress ${est.progress()}`);
check("ready после цели", est.ready() === true);
const decided = est.decide();
check(
  "медиана окна (с выбросом) → овал",
  decided !== null && decided.primary === "oval",
  decided ? `primary ${decided.primary}` : "null"
);
est.reset();
check("reset обнуляет окно", est.count() === 0 && est.decide() === null);

console.log(`\nИтого: ${passed} прошло, ${failed} провалено.`);
if (failed > 0) process.exit(1);

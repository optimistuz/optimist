/* ==================================================================
   Юнит-тест клапана разрешения (закон движка №3).
   Чистые функции, без тест-фреймворка. Запуск: npm run test:lib

   ⚠️ ЗАЧЕМ ЭТОТ ТЕСТ СУЩЕСТВУЕТ. Клапан приехал в проект с двумя
   дефектами, которых не видно ни глазами, ни типами, ни линтером
   (нашёл `hronometrist` арифметикой):

   1. Его кормили ИНТЕРВАЛОМ между кадрами вместо СТОИМОСТИ работы.
      Интервал задан троттлингом и герцовкой экрана, а не нагрузкой,
      и понижение разрешения на него не влияет — контур управления,
      чей исполнитель не влияет на датчик, саморазгоняется в упор.
      На 90-герцевом Galaxy A15 (эталонное устройство) клапан душил
      разрешение до минимума на ПОЛНОСТЬЮ ПРОСТАИВАЮЩЕМ телефоне.
   2. Порог восстановления был недостижим арифметически, поэтому
      любая деградация — включая ложную — была необратима.

   Оба дефекта тихие: картинка просто мутнее, чем должна быть, и
   никто никогда не узнает. Поэтому проверяем ПОВЕДЕНИЕ на сценариях,
   а не наличие функций.
   ================================================================== */

import { createRenderScale, MAX_DPR } from "./render-scale";

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

/** Прогон петли покраски: частота экрана, стоимость кадра, длительность. */
function loop(hz: number, costOf: (scale: number) => number, seconds: number) {
  const rs = createRenderScale();
  const period = 1000 / hz;
  const PAINT_MS = 10; // как в frame-overlay.tsx
  let now = 0;
  let lastPaint = -1e9;
  let cost = 0;
  let paints = 0;
  for (let i = 0; i < seconds * hz; i += 1) {
    now += period;
    if (now - lastPaint < PAINT_MS) continue;
    lastPaint = now;
    paints += 1;
    rs.sample(cost, now);
    cost = costOf(rs.scale);
  }
  return { scale: rs.scale, fps: paints / seconds, rs };
}

console.log("\n== Покой: ложной деградации нет ни на одной частоте ==");
for (const hz of [60, 90, 120]) {
  const { scale } = loop(hz, () => 2, 40);
  check(`${hz} Гц — разрешение не тронуто`, scale === 1, `scale ${scale}`);
}

console.log("\n== Частота покраски при PAINT_MS 10 ==");
{
  // 90 Гц — та самая панель, на которой троттлинг 16 мс давал 45 fps.
  const a = loop(60, () => 2, 10);
  const b = loop(90, () => 2, 10);
  const c = loop(120, () => 2, 10);
  check("60 Гц → 60 fps", Math.round(a.fps) === 60, `${a.fps}`);
  check("90 Гц → 90 fps (не 45)", Math.round(b.fps) === 90, `${b.fps}`);
  check("120 Гц → 60 fps (через кадр)", Math.round(c.fps) === 60, `${c.fps}`);
}

console.log("\n== Честная перегрузка: клапан срабатывает ==");
for (const hz of [60, 90, 120]) {
  // Дорогая покраска, дешевеющая пропорционально разрешению.
  const { scale } = loop(hz, (s) => 14 * s, 40);
  check(`${hz} Гц — разрешение снижено`, scale < 1, `scale ${scale}`);
  check(`${hz} Гц — не ниже предела`, scale >= 0.5, `scale ${scale}`);
}

console.log("\n== Восстановление достижимо ==");
{
  const rs = createRenderScale();
  const period = 1000 / 90;
  let now = 0;
  let lastPaint = -1e9;
  let cost = 0;
  let low = 1;
  for (let i = 0; i < 90 * 90; i += 1) {
    now += period;
    if (now - lastPaint < 10) continue;
    lastPaint = now;
    rs.sample(cost, now);
    const heavy = now < 20000; // первые 20 с — перегрузка, дальше покой
    cost = heavy ? 14 * rs.scale : 2;
    if (heavy) low = Math.min(low, rs.scale);
  }
  check("под нагрузкой деградировал", low < 1, `минимум ${low}`);
  check("после покоя вернулся", rs.scale > low, `итог ${rs.scale}`);
}

console.log("\n== Тяжёлая полоса: клапан не слепнет под нагрузкой ==");
{
  // Предохранитель аномалий не должен отсекать честную дорогую покраску:
  // раньше порог 250 мс глушил клапан ровно там, где он нужен.
  const rs = createRenderScale();
  let now = 0;
  for (let i = 0; i < 2000; i += 1) {
    now += 120;
    rs.sample(300 * rs.scale, now); // тяжело, но честно
  }
  check("покраска 300 мс считается нагрузкой", rs.scale < 1, `scale ${rs.scale}`);
}

console.log("\n== Пол потребителя ==");
{
  // Волосяной чертёж оправы не имеет права мылиться: у него свой пол.
  const rs = createRenderScale({ min: 0.85 });
  let now = 0;
  for (let i = 0; i < 4000; i += 1) {
    now += 12;
    rs.sample(40, now); // безнадёжная перегрузка
  }
  check("ниже своего пола не уходит", rs.scale >= 0.85, `scale ${rs.scale}`);
}

console.log("\n== Санитария ==");
{
  const rs = createRenderScale();
  const before = rs.scale;
  rs.sample(5000, 1000); // выброс: точка останова / вытеснение потока
  rs.sample(Number.NaN, 2000);
  rs.sample(-1, 3000);
  check("выбросы и мусор не двигают разрешение", rs.scale === before);
  check("DPR-кап равен 2", MAX_DPR === 2);
}

console.log(`\n==== Итог: ${passed} прошло, ${failed} провалено ====\n`);
if (failed > 0) process.exit(1);

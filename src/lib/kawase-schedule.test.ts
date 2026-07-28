/* ==================================================================
   Юнит-тест расписания цепочки Kawase. Чистые функции, без фреймворка.
   Запуск: npm run test:lib

   ⚠️ ЗАЧЕМ ЭТОТ ТЕСТ СУЩЕСТВУЕТ. Непрерывность эффекта на границах
   цепочки полгода проверялась только глазами и скриншотами — и всё это
   время была нарушена: резкость падала на 8–55 % за шаг ползунка
   в сотую долю пикселя, ВНУТРИ одной подписи «−3 дптр». Глазами это
   не видно, потому что маскируется самим размытием; типами и линтером —
   тем более.

   Замер в Chrome ловит такой дефект, но он дорог, требует дев-сервера,
   зависит от кадра и однажды уже соврал (окно замера в CSS-пикселях
   против физических: шесть положений давали одинаковое число, и прибор
   рапортовал «непрерывно»). Здесь то же самое доказывается арифметикой:
   быстро, детерминированно и без единого пикселя.

   ⚠️ ЗАКОН, КОТОРЫЙ ЗДЕСЬ ЗАЩИЩАЕТСЯ (CLAUDE.md, §6-11): два соседних
   положения с одинаковым `aria-valuenow` обязаны выглядеть одинаково.
   Внутренние переключения машинерии подписи не меняют — значит они
   обязаны быть незаметны.
   ================================================================== */

import {
  OFFSET_MAX,
  chainFloor,
  chainVariance,
  minRadius,
  offsetGain,
  planChain,
  targetVariance,
} from "./kawase-schedule";

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

const LEVELS = 5;
/** Верх рабочего диапазона: 0,013 × 1232 CSS-px × DPR-кап 2. */
const R_MAX = 0.013 * 1232 * 2;

console.log("\n== Пол цепочки растёт с глубиной ==");
{
  const floors = [1, 2, 3, 4, 5].map(chainFloor);
  check(
    "пол монотонно растёт по уровням",
    floors.every((f, i) => i === 0 || f > floors[i - 1]),
    floors.map((f) => f.toFixed(2)).join(" → ")
  );
  check("пол нулевой цепочки равен нулю", chainFloor(0) === 0);
  check(
    "усиление разъезда тоже растёт",
    [1, 2, 3, 4].every((lv) => offsetGain(lv + 1) > offsetGain(lv))
  );
}

console.log("\n== НЕПРЕРЫВНОСТЬ: главное ==");
{
  // Мелкий шаг по всему рабочему диапазону. Ищем разрыв полной дисперсии:
  // именно она определяет, как выглядит кадр.
  const STEP = 0.01;
  let worstJump = 0;
  let worstAt = 0;
  let prev: number | null = null;
  let switches = 0;
  let prevLv = -1;
  for (let r = STEP; r <= R_MAX; r += STEP) {
    const p = planChain(r, LEVELS);
    const v = chainVariance(p.lv, p.offset) * p.mix * p.mix;
    if (prev !== null) {
      const jump = Math.abs(v - prev);
      // Нормируем на локальный масштаб: дисперсия растёт как r², и
      // абсолютный шаг у большого радиуса естественно больше.
      const rel = jump / Math.max(1, v);
      if (rel > worstJump) {
        worstJump = rel;
        worstAt = r;
      }
    }
    if (p.lv !== prevLv && prevLv >= 0) switches += 1;
    prevLv = p.lv;
    prev = v;
  }
  check(
    "переключения уровней в диапазоне вообще есть",
    switches >= 2,
    `переключений ${switches} — если ноль, тест ничего не проверяет`
  );
  check(
    "полная дисперсия непрерывна на всём ходу",
    worstJump < 0.02,
    `худший относительный скачок ${(worstJump * 100).toFixed(3)} % при rBuf ≈ ${worstAt.toFixed(2)}`
  );
}

console.log("\n== Совпадение в САМИХ точках переключения ==");
{
  // Прицельно: по обе стороны каждой границы, шагом в тысячную.
  let worst = 0;
  let worstAt = 0;
  let seen = 0;
  let prevLv = planChain(0.01, LEVELS).lv;
  for (let r = 0.02; r <= R_MAX; r += 0.001) {
    const p = planChain(r, LEVELS);
    if (p.lv !== prevLv) {
      seen += 1;
      const a = planChain(r - 0.001, LEVELS);
      const va = chainVariance(a.lv, a.offset);
      const vb = chainVariance(p.lv, p.offset);
      const rel = Math.abs(vb - va) / Math.max(1, va);
      if (rel > worst) {
        worst = rel;
        worstAt = r;
      }
      prevLv = p.lv;
    }
  }
  check("границы найдены", seen >= 2, `найдено ${seen}`);
  check(
    "по обе стороны границы дисперсия совпадает",
    worst < 0.01,
    `худшее расхождение ${(worst * 100).toFixed(3)} % при rBuf ≈ ${worstAt.toFixed(3)}`
  );
}

console.log("\n== Ограничения соблюдаются всюду ==");
{
  let offsetBad = 0;
  let floorBad = 0;
  let nan = 0;
  for (let r = 0.01; r <= R_MAX; r += 0.01) {
    const p = planChain(r, LEVELS);
    if (!Number.isFinite(p.offset) || !Number.isFinite(p.mix)) nan += 1;
    if (p.lv > 0 && !p.saturated && p.offset > OFFSET_MAX + 1e-9) offsetBad += 1;
    // Пол уровня обязан быть ниже цели — иначе уровень мутнее, чем просили.
    if (p.lv > 0 && p.mix >= 1 && chainFloor(p.lv) >= targetVariance(r) + 1e-9) {
      floorBad += 1;
    }
  }
  check("ни одного NaN в расписании", nan === 0, `NaN в ${nan} точках`);
  check("разъезд нигде не выше потолка", offsetBad === 0, `нарушений ${offsetBad}`);
  check(
    "уровень нигде не мутнее собственной цели",
    floorBad === 0,
    `нарушений ${floorBad}`
  );
}

console.log("\n== Монотонность: сильнее дефект — сильнее размытие ==");
{
  let bad = 0;
  let prev = -1;
  for (let r = 0.01; r <= R_MAX; r += 0.01) {
    const p = planChain(r, LEVELS);
    const v = chainVariance(p.lv, p.offset) * p.mix * p.mix;
    if (v < prev - 1e-9) bad += 1;
    prev = v;
  }
  check(
    "размытие ни разу не уменьшается при росте радиуса",
    bad === 0,
    `убываний ${bad}`
  );
}

console.log("\n== Края и вырождения ==");
{
  check("нулевой радиус выключает цепочку", planChain(0, LEVELS).lv === 0);
  check("отрицательный радиус выключает цепочку", planChain(-3, LEVELS).lv === 0);
  check("NaN выключает цепочку", planChain(Number.NaN, LEVELS).lv === 0);
  const tiny = planChain(0.2, LEVELS);
  check(
    "у самого нуля работает рампа, а не полная цепочка",
    tiny.mix < 1 && tiny.mix > 0,
    `mix ${tiny.mix.toFixed(3)}`
  );
  check(
    "рампа заканчивается на собственном полу цепочки",
    Math.abs(planChain(minRadius(1), LEVELS).mix - 1) < 1e-9,
    `mix ${planChain(minRadius(1), LEVELS).mix}`
  );
  const sat = planChain(R_MAX * 20, LEVELS);
  check(
    "исчерпание уровней ОБЪЯВЛЕНО, а не заклампованно молча",
    sat.saturated === true && sat.lv === LEVELS
  );
  check(
    "в рабочем диапазоне исчерпания нет",
    planChain(R_MAX, LEVELS).saturated === false,
    `при rBuf ${R_MAX.toFixed(2)} уровень ${planChain(R_MAX, LEVELS).lv}`
  );
  check(
    "трёх уровней рабочему диапазону НЕ хватало (обоснование levels)",
    planChain(R_MAX, 3).saturated === true
  );
}

console.log("\n== НЕГАТИВНЫЙ КОНТРОЛЬ: тест обязан уметь ПАДАТЬ ==");
{
  /**
   * ⚠️ БЕЗ ЭТОГО РАЗДЕЛА ТЕСТ НИЧЕГО НЕ ДОКАЗЫВАЕТ. Прибор, который только
   * «успешно проходит», однажды уже пропускал брак, честно рапортуя об
   * успехе (белая точка, `--verify --expect`). Поэтому прогоняем ТОТ ЖЕ
   * критерий по СТАРОМУ расписанию — уровень степенью двойки, разъезд
   * `rBuf/base`, пол цепочки не учитывается вовсе — и требуем, чтобы
   * критерий его ЗАБРАКОВАЛ. Замер в Chrome на этом расписании давал
   * скачки резкости 8–55 % на десяти границах из десяти.
   */
  const oldBase = (lv: number) =>
    4 * Math.sqrt(offsetGain(lv) / offsetGain(1)); // калибровка второй итерации
  const oldPlan = (rBuf: number) => {
    if (!(rBuf > 0)) return { lv: 0, offset: 0 };
    const lv = Math.max(
      1,
      Math.min(LEVELS, Math.ceil(Math.log2(Math.max(1, rBuf / 2))))
    );
    return { lv, offset: rBuf / oldBase(lv) };
  };
  let worst = 0;
  let worstAt = 0;
  let prevLv = oldPlan(0.01).lv;
  for (let r = 0.02; r <= R_MAX; r += 0.001) {
    const p = oldPlan(r);
    if (p.lv !== prevLv) {
      const a = oldPlan(r - 0.001);
      const va = chainVariance(a.lv, a.offset);
      const vb = chainVariance(p.lv, p.offset);
      const rel = Math.abs(vb - va) / Math.max(1, va);
      if (rel > worst) {
        worst = rel;
        worstAt = r;
      }
      prevLv = p.lv;
    }
  }
  check(
    "критерий БРАКУЕТ прежнее расписание (иначе он ничего не меряет)",
    worst >= 0.01,
    `худшее расхождение всего ${(worst * 100).toFixed(3)} % при rBuf ≈ ${worstAt.toFixed(3)} — критерий слеп`
  );
  console.log(
    `       (прежнее расписание: разрыв ${(worst * 100).toFixed(1)} % при rBuf ≈ ${worstAt.toFixed(2)})`
  );
}

console.log(`\n==== Итог: ${passed} прошло, ${failed} провалено ====\n`);
if (failed > 0) process.exit(1);

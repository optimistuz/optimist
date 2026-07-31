/* ==================================================================
   Юнит-тест расписания цепочки Kawase. Чистые функции, без фреймворка.
   Запуск: npm run test:lib

   ⚠️ ЗАЧЕМ ЭТОТ ТЕСТ СУЩЕСТВУЕТ. Непрерывность эффекта на границах
   цепочки полгода проверялась только глазами и скриншотами — и всё это
   время была нарушена: резкость падала на 8–55 % за шаг ползунка
   в сотую долю пикселя, ВНУТРИ одной подписи «−3 дптр».

   ⚠️ И ЗАЧЕМ ОН ПЕРЕПИСАН. Прежняя редакция была зелёной при восьми
   сломанных границах из восьми: она подставляла ОДНУ И ТУ ЖЕ неверную
   аналитическую формулу пола по обе стороны границы и доказывала лишь
   самосогласованность модели. Модель, чей вход выведен, а не измерен,
   не доказывает пикселей. Теперь опора — ИЗМЕРЕННАЯ таблица `LEVEL_REQ`
   (прибор `scripts/probe-kawase.mjs`, гейт согласия двух эталонов), а
   прежняя аналитика живёт здесь же КАК НЕГАТИВНЫЙ КОНТРОЛЬ: критерий,
   пропускающий её, не стоит ничего.

   ⚠️ ЗАКОН, КОТОРЫЙ ЗДЕСЬ ЗАЩИЩАЕТСЯ (CLAUDE.md, §6-11): два соседних
   положения с одинаковым `aria-valuenow` обязаны выглядеть одинаково.
   И граница метода — тоже закон: тест доказывает МОДЕЛЬ; пиксели
   доказывает браузерная таблица непрерывности, и при расхождении
   неверна модель.
   ================================================================== */

import {
  LEVEL_REQ,
  OFFSET_MAX,
  SWITCH_R,
  levelCeil,
  levelFloor,
  levelRadius,
  minRadius,
  planChain,
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

/** Выданный расписанием ЭКВИВАЛЕНТНЫЙ РАДИУС — то, что увидит человек.
    Все свойства ниже сформулированы в нём, а не во внутренних ручках. */
const delivered = (r: number, plan = planChain(r, LEVELS)) =>
  plan.lv === 0 ? 0 : levelRadius(plan.lv, plan.offset) * plan.mix;

console.log("\n== Санити измеренной таблицы ==");
{
  let mono = true;
  for (const pts of LEVEL_REQ) {
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i][0] <= pts[i - 1][0] || pts[i][1] <= pts[i - 1][1]) mono = false;
    }
  }
  check("кривая каждой ступени строго растёт по обеим осям", mono);
  const floors = LEVEL_REQ.map((_, i) => levelFloor(i + 1));
  check(
    "полы ступеней строго растут",
    floors.every((f, i) => i === 0 || f > floors[i - 1]),
    floors.map((f) => f.toFixed(2)).join(" → ")
  );
  check("потолков разъезда столько же, сколько ступеней", OFFSET_MAX.length === LEVEL_REQ.length);
}

console.log("\n== Дыр между ступенями нет ==");
{
  // Именно эта дыра и была причиной скачка 29,7 %: ступень 1 кончалась на
  // 3,2 px, ступень 2 начиналась с 4,3, и между ними радиуса не давал никто.
  for (let lv = 1; lv < LEVELS; lv += 1) {
    const ceil = levelCeil(lv);
    const floorNext = levelFloor(lv + 1);
    check(
      `потолок ступени ${lv} дотягивается до пола ступени ${lv + 1}`,
      ceil >= floorNext,
      `потолок ${ceil.toFixed(2)} против пола ${floorNext.toFixed(2)}`
    );
  }
}

console.log("\n== Точки переключения (seam-argmin) внутри перекрытий ==");
{
  check("точек переключения столько же, сколько ступеней", SWITCH_R.length === LEVEL_REQ.length);
  for (let lv = 1; lv < LEVELS; lv += 1) {
    const sw = SWITCH_R[lv - 1];
    if (sw === null || sw === undefined) {
      console.log(`       (ступень ${lv}: точка не назначена — работает до потолка)`);
      continue;
    }
    // Точка обязана лежать в перекрытии: старшая ступень уже умеет этот
    // радиус (пол ниже), младшая ещё умеет (потолок выше). Вне перекрытия
    // «переключение» было бы прыжком через дыру.
    check(
      `точка ступени ${lv} (${sw}) не ниже пола ступени ${lv + 1}`,
      sw >= levelFloor(lv + 1),
      `пол ${levelFloor(lv + 1).toFixed(2)}`
    );
    check(
      `точка ступени ${lv} (${sw}) не выше её потолка`,
      sw <= levelCeil(lv) + 1e-9,
      `потолок ${levelCeil(lv).toFixed(2)}`
    );
  }
}

console.log("\n== НЕПРЕРЫВНОСТЬ: главное ==");
{
  // Выданный радиус обязан идти за целевым без скачков по всему ходу.
  const STEP = 0.005;
  let worstJump = 0;
  let worstAt = 0;
  let worstErr = 0;
  let worstErrAt = 0;
  let prev: number | null = null;
  let switches = 0;
  let prevLv = -1;
  for (let r = STEP; r <= R_MAX; r += STEP) {
    const plan = planChain(r, LEVELS);
    const d = delivered(r, plan);
    if (!plan.saturated && plan.mix >= 1) {
      // Точность обращения: выданный радиус равен запрошенному.
      const err = Math.abs(d - r) / r;
      if (err > worstErr) {
        worstErr = err;
        worstErrAt = r;
      }
    }
    if (prev !== null) {
      // ⚠️ Скачок — это ИЗБЫТОК шага выдачи над шагом входа, а не сам шаг:
      // у идеального расписания Δвыдачи = Δвхода (наклон 1), и мера,
      // считающая наклон скачком, ловила бы собственную сетку прогона.
      const jump = Math.abs(Math.abs(d - prev) - STEP);
      if (jump > worstJump) {
        worstJump = jump;
        worstAt = r;
      }
    }
    if (plan.lv !== prevLv && prevLv >= 0) switches += 1;
    prevLv = plan.lv;
    prev = d;
  }
  check(
    "переключения уровней в диапазоне вообще есть",
    switches >= 3,
    `переключений ${switches} — если ноль, тест ничего не проверяет`
  );
  check(
    "выданный радиус непрерывен на всём ходу",
    worstJump < STEP * 2,
    `худший избыток шага ${worstJump.toFixed(4)} px при rBuf ≈ ${worstAt.toFixed(2)}`
  );
  check(
    "выданный радиус равен запрошенному (обращение точное)",
    worstErr < 0.002,
    `худшая ошибка ${(worstErr * 100).toFixed(3)} % при rBuf ≈ ${worstErrAt.toFixed(2)}`
  );
}

console.log("\n== Монотонность: сильнее дефект — сильнее размытие ==");
{
  let bad = 0;
  let prev = -1;
  for (let r = 0.01; r <= R_MAX; r += 0.01) {
    const d = delivered(r);
    if (d < prev - 1e-9) bad += 1;
    prev = d;
  }
  check("размытие ни разу не уменьшается при росте радиуса", bad === 0, `убываний ${bad}`);
}

console.log("\n== Ограничения соблюдаются всюду ==");
{
  let offsetBad = 0;
  let nan = 0;
  let floorBad = 0;
  for (let r = 0.01; r <= R_MAX; r += 0.01) {
    const p = planChain(r, LEVELS);
    if (!Number.isFinite(p.offset) || !Number.isFinite(p.mix)) nan += 1;
    if (p.lv > 0 && p.offset > OFFSET_MAX[p.lv - 1] + 1e-9) offsetBad += 1;
    // Ступень не мутнее цели: её пол не выше запрошенного радиуса.
    if (p.lv > 0 && p.mix >= 1 && levelFloor(p.lv) > r + 1e-9) floorBad += 1;
  }
  check("ни одного NaN в расписании", nan === 0, `NaN в ${nan} точках`);
  check("разъезд нигде не выше потолка своей ступени", offsetBad === 0, `нарушений ${offsetBad}`);
  check("ступень нигде не мутнее собственной цели", floorBad === 0, `нарушений ${floorBad}`);
}

console.log("\n== Инвариант домена гейта: полы глубоких ступеней не используются ==");
{
  // Гейт согласия эталонов считается по парам, до которых расписанию есть
  // дело (решение dirizher): пары у пола lv3 (o = 0 и 0,15) два эталона
  // видят по-разному — пол ступени есть чистая билинейная пирамида, самое
  // негауссово ядро цепочки. Исключение легально ТОЛЬКО пока расписание
  // туда не ходит — что здесь и закрепляется машинно, с запасом в один
  // шаг сетки замера (0,15).
  let lv3low = 0;
  let lv3min = Infinity;
  for (let r = 0.01; r <= R_MAX; r += 0.005) {
    const p = planChain(r, LEVELS);
    if (p.lv === 3) {
      if (p.offset < lv3min) lv3min = p.offset;
      if (p.offset < 0.3) lv3low += 1;
    }
  }
  check(
    "lv3 никогда не выдаётся у своего пола (разъезд ≥ 0,3)",
    lv3low === 0,
    `минимальный разъезд lv3 в работе: ${lv3min === Infinity ? "не выдавался" : lv3min.toFixed(3)}`
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
    tiny.mix < 1 && tiny.mix > 0 && tiny.lv === 1 && tiny.offset === 0,
    `mix ${tiny.mix.toFixed(3)}`
  );
  check("рампа стартует от пола первой ступени", Math.abs(minRadius() - levelFloor(1)) < 1e-9);
  const huge = planChain(R_MAX * 3, LEVELS);
  check("недостижимый радиус ОБЪЯВЛЕН, а не заклампован молча", huge.saturated === true);
  const shallow = planChain(10, 2);
  check(
    "меньше уровней — насыщение раньше, но план валиден",
    shallow.lv <= 2 && Number.isFinite(shallow.offset)
  );
}

console.log("\n== НЕГАТИВНЫЙ КОНТРОЛЬ: прежняя аналитика ОБЯЗАНА браковаться ==");
{
  /* Прежнее расписание, воспроизведённое буквально (chainFloor из дисперсий
     билинейных чтений, V_DOWN/V_UP из весов шейдеров, TARGET_K = 0,5,
     единый потолок разъезда 1). Если наш критерий непрерывности его
     ПРОПУСКАЕТ — критерий не стоит ничего: именно эта формула давала
     скачки на 8 границах из 8 при зелёном тесте. */
  const V_DOWN = 0.5;
  const V_UP = 4 / 3;
  const sumTargets = (n: number) => (n <= 0 ? 0 : (16 * (Math.pow(4, n) - 1)) / 3);
  const offsetGain = (lv: number) => V_DOWN * sumTargets(lv) + V_UP * sumTargets(lv - 1);
  const chainFloor = (lv: number): number => {
    if (lv <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < lv; i += 1) {
      const t = i === 0 ? 1 : Math.pow(2, i + 1);
      sum += t * t;
    }
    for (let i = 0; i <= lv - 2; i += 1) {
      const t = Math.pow(2, i + 3);
      sum += t * t;
    }
    return (sum + 16) / 12;
  };
  const TARGET_K = 0.5;
  const oldPlan = (rBuf: number): { lv: number; offset: number } => {
    const target = TARGET_K * rBuf * rBuf;
    for (let lv = 1; lv <= LEVELS; lv += 1) {
      const floor = chainFloor(lv);
      if (floor >= target) continue;
      const offset = Math.sqrt(Math.max(0, target - floor) / offsetGain(lv));
      if (offset <= 1) return { lv, offset };
    }
    return {
      lv: LEVELS,
      offset: Math.sqrt(Math.max(0, TARGET_K * rBuf * rBuf - chainFloor(LEVELS)) / offsetGain(LEVELS)),
    };
  };

  // Тот же критерий, что и выше, — непрерывность ВЫДАННОГО радиуса, где
  // «выданный» честно берётся из ИЗМЕРЕННОЙ таблицы: формула командует,
  // а видит человек то, что реально рисует цепочка.
  const STEP = 0.005;
  let worstJump = 0;
  let worstAt = 0;
  let prev: number | null = null;
  for (let r = 1.8; r <= R_MAX; r += STEP) {
    const p = oldPlan(r);
    const d = levelRadius(p.lv, Math.min(p.offset, 1.65));
    if (prev !== null) {
      // Тот же критерий, что у нового расписания: избыток шага выдачи.
      const jump = Math.abs(Math.abs(d - prev) - STEP);
      if (jump > worstJump) {
        worstJump = jump;
        worstAt = r;
      }
    }
    prev = d;
  }
  check(
    "критерий БРАКУЕТ прежнее расписание",
    worstJump >= STEP * 10,
    `худший избыток шага старой формулы всего ${worstJump.toFixed(4)} px — критерий слеп`
  );
  console.log(
    `       (избыток шага старой формулы: ${worstJump.toFixed(3)} px при rBuf ≈ ${worstAt.toFixed(2)})`
  );
}

console.log(`\nИтог: ok ${passed}, провалов ${failed}\n`);
if (failed > 0) process.exit(1);

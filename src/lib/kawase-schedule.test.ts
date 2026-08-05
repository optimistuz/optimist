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
  levelCoversBand,
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

console.log("\n== §6-11 ПО ПОСТРОЕНИЮ: внутри одной подписи глубина цепочки одна ==");
{
  /* ⚠️ ЗАЧЕМ ЭТОТ БЛОК СУЩЕСТВУЕТ.
     Смена глубины цепочки стоит ~4× рядового шага ВСЕГДА: отношение
     «шаг через границу / рядовой» равно 4,7 / 4,4 / 4,5 / 3,9 / 3,9 на
     пяти границах, обеих плотностях, на ступенях с UP-проходом и без
     (пиксельные таблицы 30–31 июля). Щёлкает не «виноватая ступень», а
     САМ ФАКТ смены глубины — значит спрятать щелчок ВНУТРИ подписи
     нечем. Единственный законный ход — вынести его НА СМЕНУ ПОДПИСИ,
     где и так меняется число и звучит гаптика. Тогда §6-11 («два
     соседних положения с одинаковым `aria-valuenow` обязаны выглядеть
     одинаково») выполняется по построению, и доказывается это здесь —
     перебором, а не одним замером в браузере.

     ⚠️ ПОЛОСА СЧИТАЕТСЯ ТОЙ ЖЕ АРИФМЕТИКОЙ, ЧТО И ПОДПИСЬ.
     `snapAbs` оболочки (`vision-sim-live.tsx`) — округление к ближайшей
     ступени, поэтому число меняется в СЕРЕДИНАХ между ступенями, а
     полоса одной подписи есть [label − step/2, label + step/2]. Разойдись
     эта арифметика с оболочкой — тест доказывал бы полосу, которой никто
     не объявляет.

     ⚠️ И ГРАНИЦА МЕТОДА: здесь доказана МОДЕЛЬ. Пиксели доказывает фаза
     `sweep` прибора `probe-kawase.mjs` (там свой негативный контроль —
     порт `__kawaseNoBand`). При расхождении неверна модель. */

  // Оба симулятора — числа взяты из `sections/vision.tsx`, а не придуманы.
  const SIMS = [
    { name: "близорукость", maxD: 6, step: 0.5, coeff: 0.013 },
    { name: "дальнозоркость", maxD: 3, step: 0.25, coeff: 0.01 },
  ];
  /** Ширины кадра на вьюпортах 360…1536 сетки (mobile-first). */
  const WIDTHS = [312, 342, 382, 704, 928, 1184];
  /** DPR 3 обязан вести себя ровно как 2 — кап `MAX_DPR` в `render-scale`. */
  const DPRS = [1, 2, 3];
  /** Лестница клапана renderScale: шаг 0,15 от единицы до пола. */
  const SCALES = [1, 0.85, 0.7, 0.55, 0.5];

  type Band = {
    sim: string;
    lo: number;
    hi: number;
    label: number;
    where: string;
  };
  const bands: Band[] = [];
  for (const sim of SIMS) {
    for (const w of WIDTHS) {
      for (const dpr of DPRS) {
        for (const sc of SCALES) {
          // Плотность буфера — ровно та, что видит цепочка: min(DPR,2) × scale.
          const ar = Math.min(dpr, 2) * sc;
          const k = ((sim.coeff * w) / sim.maxD) * ar;
          for (let i = 0; i * sim.step <= sim.maxD + 1e-9; i += 1) {
            const label = i * sim.step;
            // ⚠️ Пол клапана ДИНАМИЧЕСКИЙ: ниже 0,7 он опускается только при
            // |D| ≥ 1,5 дптр и держится гистерезисом до 1,2. Полосы ниже 1,2
            // дптр с малым scale физически недостижимы — проверять их значило
            // бы браковать расписание за раскладку, которой не бывает.
            if (sc < 0.7 && label < 1.2) continue;
            const lo = Math.max(0, label - sim.step / 2) * k;
            const hi = Math.min(sim.maxD, label + sim.step / 2) * k;
            if (hi <= 0) continue;
            bands.push({
              sim: sim.name,
              lo,
              hi,
              label,
              where: `${sim.name}, ширина ${w}, DPR ${dpr}, scale ${sc}, подпись ${label} дптр`,
            });
          }
        }
      }
    }
  }
  // Пустой (или почти пустой) перебор, отрапортовавший успех, — та же ложь,
  // только тише. Число сторожит опечатку в самом переборе.
  check("полос подписи набралось для перебора", bands.length >= 300, `полос ${bands.length}`);

  // Полосы обязаны СМЫКАТЬСЯ: верх одной есть низ следующей. Иначе между
  // подписями остался бы радиус, не принадлежащий никакой полосе, и вопрос
  // «какая глубина здесь законна» не имел бы ответа.
  {
    let gaps = 0;
    for (const sim of SIMS) {
      const k = (sim.coeff * 382 * 2) / sim.maxD;
      for (let i = 0; (i + 1) * sim.step <= sim.maxD + 1e-9; i += 1) {
        const hi = Math.min(sim.maxD, i * sim.step + sim.step / 2) * k;
        const loNext = Math.max(0, (i + 1) * sim.step - sim.step / 2) * k;
        if (Math.abs(hi - loNext) > 1e-9) gaps += 1;
      }
    }
    check("полосы подписей смыкаются без зазоров", gaps === 0, `разрывов ${gaps}`);
  }

  /** Прогон одной раскладки: какие глубины встречаются внутри полосы. */
  const SAMPLES = 40;
  const walk = (b: Band, withBand: boolean) => {
    const seen = new Set<number>();
    let muddier = 0;
    let offsetBad = 0;
    let worstErr = 0;
    for (let t = 0; t <= SAMPLES; t += 1) {
      const r = b.lo + ((b.hi - b.lo) * t) / SAMPLES;
      if (!(r > 0)) continue;
      const p = planChain(r, LEVELS, withBand ? [b.lo, b.hi] : undefined);
      seen.add(p.lv);
      if (p.mix >= 1 && p.lv > 0) {
        // Ступень не мутнее цели и разъезд в пределах своего потолка —
        // те же два ограничения, что и у выбора «по факту»: полоса не имеет
        // права покупать непрерывность ценой качества или выходом за таблицу.
        if (levelFloor(p.lv) > r + 1e-9) muddier += 1;
        if (p.offset > OFFSET_MAX[p.lv - 1] + 1e-9) offsetBad += 1;
        const err = Math.abs(levelRadius(p.lv, p.offset) - r) / r;
        if (err > worstErr) worstErr = err;
      }
    }
    return { seen, muddier, offsetBad, worstErr };
  };

  {
    let mixed = 0;
    let muddier = 0;
    let offsetBad = 0;
    let worstErr = 0;
    let worstErrAt = "";
    const examples: string[] = [];
    for (const b of bands) {
      const r = walk(b, true);
      if (r.seen.size > 1) {
        mixed += 1;
        if (examples.length < 5) {
          examples.push(`${b.where} → глубины ${Array.from(r.seen).join("/")}`);
        }
      }
      muddier += r.muddier;
      offsetBad += r.offsetBad;
      if (r.worstErr > worstErr) {
        worstErr = r.worstErr;
        worstErrAt = b.where;
      }
    }
    check(
      "внутри подписи глубина цепочки НЕ меняется ни в одной раскладке",
      mixed === 0,
      `полос со сменой глубины ${mixed} из ${bands.length}${examples.length ? `; например: ${examples.join(" | ")}` : ""}`
    );
    check("полоса нигде не делает картинку мутнее запрошенной", muddier === 0, `нарушений ${muddier}`);
    check("полоса нигде не выводит разъезд за потолок ступени", offsetBad === 0, `нарушений ${offsetBad}`);
    // Полоса управляет ТОЛЬКО выбором глубины: радиус внутри неё по-прежнему
    // добирается непрерывным разъездом. Иначе размытие стало бы ступенчатым —
    // ровно то квантование, от которого ушёл шаг 1 этапа 6.
    check(
      "внутри подписи радиус остаётся непрерывным (не квантуется)",
      worstErr < 0.002,
      `худшая ошибка обращения ${(worstErr * 100).toFixed(3)} % — ${worstErrAt}`
    );
  }

  // Молчаливый откат «ни одна ступень не покрывает полосу» обязан быть
  // ПОСЧИТАН, а не подразумеваться: там §6-11 держаться перестаёт, и знать
  // об этом надо здесь, а не по кадру на телефоне.
  {
    let uncovered = 0;
    const examples: string[] = [];
    for (const b of bands) {
      let ok = false;
      for (let lv = 1; lv <= LEVELS; lv += 1) {
        if (levelCoversBand(lv, b.lo, b.hi)) {
          ok = true;
          break;
        }
      }
      if (!ok) {
        uncovered += 1;
        if (examples.length < 5) {
          examples.push(`${b.where} (полоса ${b.lo.toFixed(2)}…${b.hi.toFixed(2)})`);
        }
      }
    }
    check(
      "каждую полосу подписи закрывает какая-то одна ступень",
      uncovered === 0,
      `не покрыто ${uncovered} из ${bands.length}: ${examples.join(" | ")}`
    );
  }

  /* НЕГАТИВНЫЙ КОНТРОЛЬ — без него блок выше не стоит ничего.
     Тот же перебор, тот же критерий, единственная разница — полоса не
     передана, и глубина снова выбирается по факту радиуса. Это в точности
     поведение, при котором §6-11 был нарушен на всех границах. Если и оно
     проходит, значит перебор не задевает ни одного переключения — тогда
     «внутри подписи ровно» доказано на гладком участке и не значит ничего. */
  {
    let mixed = 0;
    // ⚠️ Счётчик — обычный объект, а не Map: спред и обход Map/Set компилятор
    // проекта (target по умолчанию) не пропускает, и такая же строка однажды
    // уронила сборку из `schema.ts`, а причину списали на гонку за `.next`.
    const perSim: Record<string, number> = {};
    for (const b of bands) {
      if (walk(b, false).seen.size > 1) {
        mixed += 1;
        perSim[b.sim] = (perSim[b.sim] ?? 0) + 1;
      }
    }
    check(
      "критерий БРАКУЕТ прежний выбор глубины «по факту»",
      mixed > 0,
      `без полосы глубина не сменилась НИ В ОДНОЙ из ${bands.length} полос — перебор не задевает переключений`
    );
    console.log(
      `       (без полосы глубина едет внутри подписи в ${mixed} полосах из ${bands.length}: ` +
        `${Object.keys(perSim).map((s) => `${s} ${perSim[s]}`).join(", ")})`
    );
  }
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

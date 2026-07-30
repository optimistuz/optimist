/**
 * ГЕНЕРАТОР ИЗМЕРЕННОЙ ТАБЛИЦЫ РАСПИСАНИЯ dual-Kawase.
 *
 * Читает JSON-выгрузки `probe-kawase.mjs cal` (одну или несколько) и печатает
 * TypeScript-константу для `src/lib/kawase-schedule.ts`: по каждой ступени —
 * измеренные пары (разъезд → эквивалентный радиус фолбэка, px буфера).
 *
 * ⚠️ Число в расписании НЕ НАБИРАЕТСЯ РУКАМИ. Ручной перенос из консоли в
 * код — это второй шанс для опечатки и нулевой шанс её найти: цифра в
 * симуляторе не проверяется глазами. Путь один: прибор → JSON → генератор →
 * константа, и его можно прогнать заново целиком.
 *
 * Эквивалентный радиус — обращение шкалы фолбэка ТОГО ЖЕ прогона (сырое σ²
 * цепочки ищется на сырой кривой blur(r) того же эталона): систематика
 * прибора входит в оба числа и сокращается. Значения двух эталонов
 * усредняются ПОСЛЕ обращения (сходимость сторожит гейт согласия прибора,
 * не генератор).
 *
 *   node scripts/gen-kawase-table.mjs out1.json [out2.json ...]
 */
import fs from "node:fs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("нужно: node scripts/gen-kawase-table.mjs <kawase-cal.json> [ещё...]");
  process.exit(1);
}

const interp = (pts, x) => {
  const p = pts.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y)).sort((a, b) => a.x - b.x);
  if (!p.length || x < p[0].x || x > p[p.length - 1].x) return NaN;
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i].x) {
      const t = (x - p[i - 1].x) / (p[i].x - p[i - 1].x || 1);
      return p[i - 1].y + t * (p[i].y - p[i - 1].y);
    }
  }
  return NaN;
};

/** rEq по всем прогонам всех файлов: level → offset → [значения]. */
const acc = new Map();
let runsSeen = 0;

for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  const runs = j?.cal?.runs ?? [];
  for (const run of runs) {
    runsSeen += 1;
    const scale = run.css.filter((c) => c.valid).map((c) => ({ x: c.sigma2, y: c.r }));
    for (const { lv, row } of run.gl) {
      for (const q of row) {
        if (!q.valid) continue;
        const rEq = interp(scale, q.sigma2);
        if (!Number.isFinite(rEq)) continue;
        if (!acc.has(lv)) acc.set(lv, new Map());
        const m = acc.get(lv);
        if (!m.has(q.off)) m.set(q.off, []);
        m.get(q.off).push(rEq);
      }
    }
  }
}

if (!runsSeen) {
  console.error("в файлах нет прогонов cal");
  process.exit(1);
}

const levels = [...acc.keys()].sort((a, b) => a - b);
console.log(`// Прогонов учтено: ${runsSeen}; файлы: ${files.join(", ")}`);
console.log(`// Сгенерировано scripts/gen-kawase-table.mjs — руками не править.`);
console.log(`export const LEVEL_REQ: readonly (readonly (readonly [number, number])[])[] = [`);
for (const lv of levels) {
  const rows = [...acc.get(lv).entries()]
    .map(([off, vals]) => {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const spread = vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
      return { off, mean, n: vals.length, spread };
    })
    .sort((a, b) => a.off - b.off);
  // Монотонность обязательна: обращение немонотонной кривой неоднозначно.
  // ⚠️ НО у пола есть ПЛАТО: пока разъезд мал, билинейный пол доминирует и
  // rEq не растёт (lv4: 18,87 → 18,86 — это разрешение прибора, не спад).
  // Плато схлопывается до ПЕРВОЙ точки: расписанию нужен НАИМЕНЬШИЙ разъезд,
  // дающий радиус. Настоящий спад (больше допуска прибора) — по-прежнему брак.
  const EPS = 0.15; // px: воспроизводимость rEq между прогонами — до 0,1
  const kept = [rows[0]];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = kept[kept.length - 1];
    if (rows[i].mean > prev.mean + EPS) kept.push(rows[i]);
    else if (rows[i].mean < prev.mean - EPS) {
      console.error(`⛔️ lv${lv}: кривая ПАДАЕТ при o=${rows[i].off} (${prev.mean.toFixed(2)} → ${rows[i].mean.toFixed(2)}) — таблица не годна`);
      process.exit(1);
    }
    // иначе — плато пола, точка поглощается предыдущей
  }
  const body = kept.map((r) => `[${r.off}, ${r.mean.toFixed(3)}]`).join(", ");
  console.log(`  /* lv ${lv}: точек ${kept.length} (снято ${rows.length}, плато пола схлопнуто), замеров на точку ${rows[0]?.n ?? 0} */`);
  console.log(`  [${body}],`);
}
console.log(`] as const;`);

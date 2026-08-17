/**
 * weigh-route.mjs — весы критического пути маршрута (этап 8).
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР. Число «first-load JS» правит вердикт каждого этапа,
 * но до сих пор его считали ad hoc — каждый меряющий писал арифметику заново.
 * Цена известна поимённо: реестр держал 196 053 Б, независимый прогон дал
 * 196 018 Б, и расхождение 35 Б полгода объяснялось «систематическим смещением
 * прогонов». Смещения не было: три сборки одного дерева (два worktree, холодный
 * и тёплый кэш, разные BUILD_ID) дают ОДИН И ТОТ ЖЕ байт чанк в чанк — сборка
 * детерминирована, расходились ПРИБОРЫ. Прибор, существующий в единственном
 * экземпляре, расходиться не может.
 *
 * МЕТОД (реестровый, менять только вместе с записями docs/perf-budgets.md):
 * уникальные `.js` из `.next/app-build-manifest.json` для ключа маршрута,
 * каждый gzip-ом уровня 9, сумма. Потолок читается из реестра
 * (`lib/canon.mjs`), в коде его нет.
 *
 * ПОЧЕМУ СВЕРКА С ПРИБОРОМ NEXT ОБЯЗАТЕЛЬНА. Наша сумма обязана совпасть с тем,
 * чем Next печатает «First Load JS» (`next/dist/compiled/gzip-size`), — иначе
 * мы меряем СВОЮ величину и называем её чужим именем. Расхождение хотя бы на
 * байт останавливает прогон: два прибора, дающие разные числа, — это ноль
 * приборов.
 *
 * ПРИБОР МОЛЧИТ, КОГДА НЕ МОЖЕТ ИЗМЕРИТЬ (закон CLAUDE.md). Нет сборки, ключа
 * маршрута, файла с диска, следы `next dev` в общей `.next` — это «НЕ ИЗМЕРЕНО»
 * с кодом 2, а не «0 Б» и не «чисто». Ложный ноль опаснее отсутствия числа.
 *
 *   node scripts/weigh-route.mjs                 # маршрут «/», вердикт по потолку
 *   node scripts/weigh-route.mjs --route=/privacy/page
 *   node scripts/weigh-route.mjs --json          # для других приборов
 *   node scripts/weigh-route.mjs --self-check    # доказать ПАДЕНИЕМ
 */
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readCriticalPathBudget } from "./lib/canon.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Отказ судить. Всегда с причиной и всегда с кодом 2 — это НЕ «0 Б». */
class NotMeasured extends Error {}
const refuse = (msg) => {
  throw new NotMeasured(msg);
};

const gz9 = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

/**
 * Собрать список файлов критического пути маршрута.
 * Возвращает и «соседей» (layout/template) — не чтобы их считать, а чтобы
 * заметить, если однажды они принесут чанк мимо набора страницы: молчаливый
 * разъезд метода — ровно то, из-за чего этот прибор и заведён.
 */
async function collect(nextDir, routeKey) {
  const manifestPath = path.join(nextDir, "app-build-manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    refuse(
      `нет ${path.relative(ROOT, manifestPath)} — прод-сборки не было.\n` +
        `  Соберите при ПОГАШЕННОМ dev: общая .next топит обе стороны.`
    );
  }

  const pages = manifest.pages ?? {};
  if (!pages[routeKey]) {
    refuse(
      `в манифесте нет ключа «${routeKey}».\n` +
        `  Есть: ${Object.keys(pages).join(", ")}`
    );
  }

  const uniq = [...new Set(pages[routeKey])].filter((f) => f.endsWith(".js"));
  if (uniq.length === 0) refuse(`у «${routeKey}» ноль .js — считать нечего.`);

  // Соседние входы того же маршрута. Браузер грузит ИХ ТОЖЕ: вход маршрута —
  // это `/page` ∪ `/layout` ∪ `/template`, и всё, что приезжает мимо набора
  // страницы, для метода реестра НЕВИДИМО. Так 14 августа роутер на 9 205 Б
  // отчитался «−4 Б». Считаем и печатаем отдельной величиной.
  const neighbours = new Set();
  const base = routeKey.replace(/\/page$/, "");
  for (const key of ["layout", "template"]) {
    const k = `${base}/${key}` === `/${key}` ? `/${key}` : `${base}/${key}`;
    for (const f of pages[k] ?? []) if (f.endsWith(".js")) neighbours.add(f);
  }
  const outsideRel = [...neighbours].filter((f) => !uniq.includes(f));

  const weighAll = async (list) => {
    const out = [];
    for (const rel of list) {
      const abs = path.join(nextDir, rel);
      let buf;
      try {
        buf = await fs.readFile(abs);
      } catch {
        refuse(
          `манифест обещает ${rel}, а файла на диске нет.\n` +
            `  Манифест протух — пересоберите; считать по устаревшему списку нельзя.`
        );
      }
      out.push({ rel, raw: buf.length, gz: gz9(buf), abs });
    }
    return out;
  };

  return { files: await weighAll(uniq), outside: await weighAll(outsideRel) };
}

/** Сверка с тем, чем «First Load JS» печатает сам Next. Расхождение = стоп. */
function crossCheck(files) {
  let nextGzip;
  try {
    nextGzip = createRequire(path.join(ROOT, "package.json"))(
      "next/dist/compiled/gzip-size"
    );
  } catch {
    return { ran: false, disagree: [] };
  }
  const disagree = [];
  for (const f of files) {
    const theirs = nextGzip.fileSync(f.abs);
    if (theirs !== f.gz) disagree.push({ rel: f.rel, ours: f.gz, theirs });
  }
  return { ran: true, disagree };
}

async function weigh(nextDir, routeKey) {
  // Следы dev в общей .next: числа такой папки не значат ничего.
  try {
    await fs.access(path.join(nextDir, "static", "development"));
    refuse(
      `в .next есть static/development — папку топтал «next dev».\n` +
        `  Погасите dev, удалите .next, соберите заново.`
    );
  } catch (e) {
    if (e instanceof NotMeasured) throw e;
  }

  const { files, outside } = await collect(nextDir, routeKey);
  const total = files.reduce((s, f) => s + f.gz, 0);
  const outsideTotal = outside.reduce((s, f) => s + f.gz, 0);
  const check = crossCheck(files);
  if (check.disagree.length > 0) {
    refuse(
      `наша сумма и прибор Next расходятся — значит меряются РАЗНЫЕ величины:\n` +
        check.disagree
          .map((d) => `  ${d.rel}: у нас ${d.gz ?? d.ours} Б, у Next ${d.theirs} Б`)
          .join("\n")
    );
  }
  return { files, outside, total, outsideTotal, crossChecked: check.ran };
}

/**
 * Приговор отделён от замера нарочно: иначе его нечем проверить, кроме как
 * подсовывая прибору настоящую сборку нужного веса. Чистая функция —
 * проверяется ловушками (см. `selfCheck`).
 */
function verdict({ total, outsideTotal }, { ceiling, outsideCap }) {
  return {
    room: ceiling - total,
    outsideRoom: outsideCap - outsideTotal,
    ok: total <= ceiling && outsideTotal <= outsideCap,
  };
}

/**
 * Самопроверка. Гейт доказывается ПАДЕНИЕМ, а не успехом: прибор, который
 * только «успешно проходит», однажды пропустит брак, честно рапортуя об успехе.
 * Каждая ловушка объявляет ожидаемый приговор ИМЕНЕМ, и сверяется ПОВОД отказа,
 * а не сам факт — иначе ловушка «поймает» отказ не за то, за что должна.
 */
async function selfCheck() {
  const tmp = path.join(ROOT, ".next-selfcheck");
  await fs.rm(tmp, { recursive: true, force: true });

  const traps = [
    {
      name: "nomeasure-нет-сборки",
      because: /прод-сборки не было/,
      async build() {
        await fs.mkdir(tmp, { recursive: true });
      },
    },
    {
      name: "nomeasure-нет-ключа",
      because: /нет ключа/,
      async build() {
        await fs.mkdir(tmp, { recursive: true });
        await write(tmp, { pages: { "/privacy/page": ["static/chunks/a.js"] } });
      },
    },
    {
      name: "nomeasure-протухший-манифест",
      because: /файла на диске нет/,
      async build() {
        await fs.mkdir(tmp, { recursive: true });
        await write(tmp, { pages: { "/page": ["static/chunks/ghost.js"] } });
      },
    },
    {
      name: "nomeasure-следы-dev",
      because: /static\/development/,
      async build() {
        await fs.mkdir(path.join(tmp, "static", "development"), { recursive: true });
        await write(tmp, { pages: { "/page": ["static/chunks/a.js"] } });
      },
    },
    {
      // Положительная ловушка обязательна: прибор, который только падает,
      // мог бы браковать всё подряд и выглядеть исправным.
      name: "ok-честный-набор",
      because: null,
      async build() {
        const dir = path.join(tmp, "static", "chunks");
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, "a.js"), "console.log('a')".repeat(40));
        await fs.writeFile(path.join(dir, "b.js"), "console.log('b')".repeat(40));
        await write(tmp, {
          pages: { "/page": ["static/chunks/a.js", "static/chunks/b.js", "static/chunks/a.js"] },
        });
      },
      expect(res) {
        if (res.files.length !== 2) return `ждал 2 уникальных чанка, вышло ${res.files.length}`;
        if (!(res.total > 0)) return "нулевая сумма на непустых файлах";
        return null;
      },
    },
  ];

  let bad = 0;
  for (const trap of traps) {
    await fs.rm(tmp, { recursive: true, force: true });
    await trap.build();
    const shouldFail = trap.name.startsWith("nomeasure-");
    let outcome, err;
    try {
      outcome = await weigh(tmp, "/page");
    } catch (e) {
      err = e;
    }
    if (shouldFail) {
      if (!err) {
        bad++;
        console.error(`❌ ${trap.name}: прибор ИЗМЕРИЛ то, что измерить нельзя.`);
      } else if (!trap.because.test(err.message)) {
        bad++;
        console.error(
          `❌ ${trap.name}: отказал НЕ ЗА ТО. Ждал «${trap.because}», получил:\n   ${err.message.split("\n")[0]}`
        );
      } else {
        console.log(`✓ ${trap.name} — отказ по верной причине`);
      }
    } else {
      const why = err ? err.message.split("\n")[0] : trap.expect?.(outcome);
      if (why) {
        bad++;
        console.error(`❌ ${trap.name}: ${why}`);
      } else {
        console.log(`✓ ${trap.name} — измерено, ${outcome.total} Б gz`);
      }
    }
  }

  await fs.rm(tmp, { recursive: true, force: true });

  // Ловушки ПРИГОВОРА. Замер может быть безупречен, а вердикт — беззубым:
  // именно так слепое пятно и прожило до 14 августа. Каждая проверяет свой
  // повод падения по отдельности, иначе одна из двух могла бы не работать.
  const budget = { ceiling: 100, outsideCap: 10 };
  const cases = [
    { name: "ok-обе-в-норме", m: { total: 100, outsideTotal: 10 }, want: true },
    { name: "brak-пробит-потолок", m: { total: 101, outsideTotal: 0 }, want: false },
    { name: "brak-пробит-сторож", m: { total: 1, outsideTotal: 11 }, want: false },
  ];
  for (const c of cases) {
    const got = verdict(c.m, budget).ok;
    if (got !== c.want) {
      bad++;
      console.error(`❌ ${c.name}: приговор «${got}», ждали «${c.want}»`);
    } else {
      console.log(`✓ ${c.name} — приговор верен`);
    }
  }

  if (bad > 0) {
    console.error(
      `\nСАМОПРОВЕРКА ПРОВАЛЕНА: ${bad} нарушений из ${traps.length + cases.length} проверок.`
    );
    process.exit(1);
  }
  const n = traps.length + cases.length;
  console.log(`\nСамопроверка пройдена: ${n}/${n} (${traps.length} замера + ${cases.length} приговора).`);
}

const write = (dir, obj) =>
  fs.writeFile(path.join(dir, "app-build-manifest.json"), JSON.stringify(obj));

/* ------------------------------- запуск ------------------------------- */
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};

try {
  if (argv.includes("--self-check")) {
    await selfCheck();
  } else {
    const routeKey = flag("route", "/page");
    const res = await weigh(path.join(ROOT, ".next"), routeKey);
    const { base, allowance, ceiling, outsideCap } =
      await readCriticalPathBudget(ROOT);
    const room = ceiling - res.total;
    const outsideRoom = outsideCap - res.outsideTotal;

    if (argv.includes("--json")) {
      console.log(
        JSON.stringify(
          {
            route: routeKey,
            totalGz: res.total,
            ceiling,
            room,
            outsideGz: res.outsideTotal,
            outsideCap,
            outsideRoom,
            entryGz: res.total + res.outsideTotal,
            deltaToBase: res.total - base,
            crossChecked: res.crossChecked,
            chunks: res.files.map(({ rel, raw, gz }) => ({ rel, raw, gz })),
            outsideChunks: res.outside.map(({ rel, gz }) => ({ rel, gz })),
          },
          null,
          2
        )
      );
    } else {
      console.log(`Критический путь «${routeKey}» — ${res.files.length} чанков:\n`);
      for (const f of [...res.files].sort((a, b) => b.gz - a.gz)) {
        console.log(`  ${String(f.gz).padStart(6)} Б gz   ${f.rel}`);
      }
      console.log(`\n  ИТОГО ${res.total} Б gz`);
      console.log(`  потолок ${ceiling} Б (база ${base} + ${allowance})`);
      console.log(
        room >= 0
          ? `  🟢 В ПОТОЛКЕ, запас ${room} Б (Δ к базе +${res.total - base} Б)`
          : `  🔴 ПРОБОЙ ${-room} Б (Δ к базе +${res.total - base} Б)`
      );
      console.log(
        res.crossChecked
          ? `  сверено с прибором Next (gzip-size) — расхождений 0`
          : `  ⚠️ прибор Next недоступен, сверки НЕ БЫЛО`
      );
      console.log(`\n  ВНЕ НАБОРА СТРАНИЦЫ (грузится, методом реестра не считается):`);
      for (const f of [...res.outside].sort((a, b) => b.gz - a.gz)) {
        console.log(`  ${String(f.gz).padStart(6)} Б gz   ${f.rel}`);
      }
      console.log(`    итого ${res.outsideTotal} Б, сторож ${outsideCap} Б`);
      console.log(
        outsideRoom >= 0
          ? `    🟢 в стороже, запас ${outsideRoom} Б`
          : `    🔴 СТОРОЖ ПРОБИТ на ${-outsideRoom} Б — вес уехал в слепое пятно`
      );
      console.log(`\n  ПОЛНЫЙ ВХОД МАРШРУТА: ${res.total + res.outsideTotal} Б gz`);
    }
    if (room < 0 || outsideRoom < 0) process.exit(1);
  }
} catch (e) {
  if (e instanceof NotMeasured) {
    console.error(`ВЕСЫ НЕ ИЗМЕРИЛИ: ${e.message}`);
    console.error(`Прибор молчит, а не говорит «0 Б»: ложный ноль хуже отсутствия числа.`);
    process.exit(2);
  }
  throw e;
}

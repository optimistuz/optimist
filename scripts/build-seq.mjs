/**
 * build-seq.mjs — rack-focus серия фотографа → секвенции PDP.
 *
 * Этап 10 шаг 8 (plan.md). Главный приём сайта — наведение на резкость —
 * не фильтр, а фотография: мы проигрываем настоящее ведение фокуса, снятое
 * камерой (CLAUDE.md, «Тяжёлая резкость снимается КАМЕРОЙ»).
 *
 *   вход:  <сдача>/<sku>/rack/01..NN.jpg   (01 — полный расфокус, NN — резкость)
 *   выход: <out>/<sku>/seq/mobile/01..24.jpg
 *          <out>/<sku>/seq/desktop/01..30.jpg
 *          <out>/<sku>/seq/poster.jpg      (резкий кадр — виден в покое)
 *          <out>/<sku>/seq/manifest.json
 *
 * ТРИ ЗАКОНА, ради которых скрипт существует:
 *
 * 1. Оба набора ВЫБИРАЮТСЯ из одной серии. Промежуточная плоскость фокуса
 *    не интерполируется НИКОГДА: её либо сняли, либо нет. Исходников нужно
 *    не меньше 30 — иначе десктопный набор не собрать, и скрипт падает.
 *
 * 2. Скрипт ПАДАЕТ при превышении бюджета (как validate-catalog). Гейт,
 *    который не падает, — не гейт. Потолки не зашиты в код: они читаются
 *    из `docs/perf-budgets.md` (см. scripts/lib/canon.mjs — там же защита
 *    от угона гейта чужой таблицей и от опечаток).
 *
 * 3. Скрипт МЕРЯЕТ ФОКУС, а не имена файлов. Перевёрнутая серия (резкость
 *    в начале) — брак: жест наведения проигрался бы задом наперёд.
 *
 * ⚠️ Чего скрипт НЕ делает: не судит серию по равномерности сырья. Фотограф
 * крутит кольцо фокуса равномерно, а резкость нарастает нелинейно (сперва
 * почти ничего, потом рывок) — это НОРМА физики, а не брак съёмки. Ровная
 * подача — задача проигрывания (этап 12), поэтому профиль резкости пишется
 * в манифест: PDP обязана вести кадры по нему, а не по равным интервалам
 * времени. Первая версия падала бы на честно снятой серии — цена такой
 * ошибки — пересъёмка в собранной студии.
 *
 * Запускается ВРУЧНУЮ, не из `next build`.
 *
 *   node scripts/build-seq.mjs <rack-dir> --sku <id> [опции]
 *
 *   --sku <id>       артикул (он же имя папки в public/frames)
 *   --out <dir>      куда публиковать (по умолчанию public/frames)
 *   --min-quality    пол качества JPEG (по умолчанию 60): ниже не жмём,
 *                    а честно падаем
 *   --dry            посчитать и вынести приговор, ничего не записывая
 *
 * Код возврата: 0 — оба набора в бюджете; 1 — бюджет превышен или серия негодна.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readSeqBudgets } from "./lib/canon.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Ширины кадров НЕ живут в коде: они — контракт из docs/perf-budgets.md
// (`budgets.<platform>.width`), как и потолки веса. Дубль здесь однажды уже
// расходился с реестром молча: серия 1200 px собиралась в «десктопный» набор
// шириной 1200 px, а манифест заявлял 1600 — и rack-focus поехал бы на десктопе
// мыльным, о чём машинный вход этапов 11–12 солгал бы.

const kb = (bytes) => bytes / 1024;

/** Пути в JSON — всегда через «/»: манифест читают и не на Windows. */
const posix = (p) => p.split(path.sep).join("/");

/**
 * Резкость кадра — дисперсия лапласиана по серому. Абсолютное значение
 * не значит ничего, значима ФОРМА кривой по серии: где расфокус, где резкость.
 */
async function sharpness(src) {
  const { data, info } = await sharp(src)
    .greyscale()
    .resize({ width: 256, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const vals = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      vals.push(
        4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w]
      );
    }
  }
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
}

/**
 * Равномерная выборка N кадров из M снятых. Первый (полный расфокус) и
 * последний (полная резкость) входят всегда — это концы жеста.
 */
function selectIndices(total, need) {
  return Array.from({ length: need }, (_, i) =>
    Math.round((i * (total - 1)) / (need - 1))
  );
}

/**
 * Кодируем кадр, спускаясь по качеству, пока не влезем в потолок.
 * Исходник декодируется и масштабируется ОДИН раз — дальше кодируем из raw:
 * иначе на серии в 48 кадров по 6000 px это минуты пересжатий.
 *
 * Пол качества — не «дожать любой ценой»: ниже него кадр честно бракуется.
 * Но сам пол ПРОБУЕТСЯ (в первой версии цикл до него не доходил, и кадр,
 * влезавший ровно на полу, объявлялся браком).
 */
async function encodeToBudget(src, dst, { width, capKb, minQuality, dry }) {
  const { data, info } = await sharp(src)
    // Без withoutEnlargement: недомерок отсекается ассертом ширины ВЫШЕ, и молча
    // ужимать набор здесь больше некому. Флаг оставлял бы дефекту тихий путь.
    .resize({ width, kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

  const ladder = [];
  for (let q = 86; q > minQuality; q -= 4) ladder.push(q);
  ladder.push(minQuality); // пол обязан быть испробован

  let last = null;
  for (const q of ladder) {
    const buf = await sharp(data, raw)
      .jpeg({ quality: q, mozjpeg: true, progressive: true })
      .toBuffer();
    last = { bytes: buf.length, quality: q };
    if (kb(buf.length) <= capKb) {
      if (!dry) {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.writeFile(dst, buf);
      }
      return last;
    }
  }
  return { ...last, over: true };
}

async function listFrames(dir) {
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    throw new Error(`нет папки серии: ${dir}`);
  }
  const frames = files
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!frames.length) throw new Error(`в ${dir} нет кадров`);
  return frames.map((f) => path.join(dir, f));
}

async function buildSet(platform, cfg, frames, outDir, opts) {
  const { frames: need, capKb } = cfg;
  const idx = selectIndices(frames.length, need);
  const dir = path.join(outDir, platform);

  const built = [];
  const over = [];
  for (let i = 0; i < idx.length; i++) {
    const src = frames[idx[i]];
    const name = `${String(i + 1).padStart(2, "0")}.jpg`;
    const r = await encodeToBudget(src, path.join(dir, name), {
      width: cfg.width,
      capKb,
      minQuality: opts.minQuality,
      dry: opts.dry,
    });
    if (r.over) {
      over.push({ name, src: path.basename(src), kb: Math.round(kb(r.bytes)) });
    } else {
      built.push({ name, bytes: r.bytes, quality: r.quality });
    }
  }

  const totalKb = built.reduce((s, f) => s + kb(f.bytes), 0);
  return { platform, need, capKb, idx, built, over, totalKb, totalCapKb: cfg.totalCapKb };
}

function parseArgs(argv) {
  const opts = {
    rack: null,
    sku: null,
    out: path.join(ROOT, "public", "frames"),
    minQuality: 60,
    dry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sku") opts.sku = argv[++i];
    else if (a === "--out") opts.out = path.resolve(argv[++i]);
    else if (a === "--min-quality") opts.minQuality = Number(argv[++i]);
    else if (a === "--dry") opts.dry = true;
    else if (!a.startsWith("--") && !opts.rack) opts.rack = path.resolve(a);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.rack || !opts.sku) {
    console.error(
      "Использование:\n" +
        "  node scripts/build-seq.mjs <rack-dir> --sku <id> [--out public/frames] [--dry]\n\n" +
        "rack-dir — серия ведения фокуса: 01 — полный расфокус, последний — резкость."
    );
    process.exit(1);
  }

  const budgets = await readSeqBudgets(ROOT);
  const frames = await listFrames(opts.rack);
  const minNeeded = Math.max(budgets.mobile.frames, budgets.desktop.frames);

  console.log(`СЕКВЕНЦИИ: ${opts.sku}`);
  console.log(`  серия: ${frames.length} кадров (${posix(path.relative(ROOT, opts.rack))})`);
  console.log(
    `  бюджеты (docs/perf-budgets.md): mobile ${budgets.mobile.frames}×≤${budgets.mobile.capKb} КБ · ` +
      `desktop ${budgets.desktop.frames}×≤${budgets.desktop.capKb} КБ · ` +
      `постер ${budgets.poster.width} px ≤${budgets.poster.capKb} КБ`
  );

  // Промежуточную плоскость фокуса не интерполируем — значит серия обязана
  // покрывать больший из наборов. Это не предупреждение, это стоп.
  if (frames.length < minNeeded) {
    console.error(
      `\nСТОП: в серии ${frames.length} кадров, а десктопному набору нужно ${minNeeded}.\n` +
        `Промежуточную плоскость фокуса нельзя дорисовать — её либо сняли, либо нет.\n` +
        `Пересъёмка серии: 36–48 кадров (docs/photo-brief.md §5).`
    );
    process.exit(1);
  }

  // ШИРИНА — КОНТРАКТ, а не потолок (docs/perf-budgets.md, «Ширина кадра»).
  // Раньше её сторожил только документ: `withoutEnlargement` молча ужимал
  // десктопный набор до ширины исходника, гейт веса радовался (недомерок
  // ЛЕГЧЕ — то есть дефект поощрялся), а манифест заявлял ширину из реестра.
  // Серия поехала бы на десктопе мыльной, и машинный вход этапов 11–12 солгал
  // бы о ней. Зеркало ассерта из ingest-frames.mjs: прибор не имеет права
  // утверждать ширину, которую не проверял.
  const srcMeta = await sharp(frames[0]).metadata();
  if (srcMeta.width < budgets.desktop.width) {
    console.error(
      `\nСТОП: кадры серии ${srcMeta.width} px, а десктопному набору нужно ` +
        `${budgets.desktop.width} px (docs/perf-budgets.md, «Ширина кадра»).\n` +
        `Апскейлом это не лечится: резкость нельзя дорисовать, а мыло на десктопе ` +
        `видно сразу.\nБриф §1: длинная сторона ≥ 3000 px.`
    );
    process.exit(1);
  }

  // Направление жеста — по резкости, а не по именам файлов.
  const firstSharp = await sharpness(frames[0]);
  const lastSharp = await sharpness(frames[frames.length - 1]);
  console.log(
    `  фокус: первый кадр ${firstSharp.toFixed(1)} → последний ${lastSharp.toFixed(1)}`
  );
  if (lastSharp <= firstSharp) {
    console.error(
      `\nСТОП: серия перевёрнута — последний кадр не резче первого.\n` +
        `Ожидается 01 = полный расфокус … NN = резкость (docs/photo-brief.md §5).\n` +
        `Жест наведения проигрался бы задом наперёд. Переименуйте кадры по возрастанию резкости.`
    );
    process.exit(1);
  }

  const outDir = path.join(opts.out, opts.sku, "seq");
  const sets = [];
  for (const platform of ["mobile", "desktop"]) {
    sets.push(await buildSet(platform, budgets[platform], frames, outDir, opts));
  }

  // Постер — резкий кадр: то, что страница показывает в покое и грузит первым.
  // Единственный кадр секвенции внутри «веса до взаимодействия» ⇒ свой потолок.
  const poster = await encodeToBudget(
    frames[frames.length - 1],
    path.join(outDir, "poster.jpg"),
    {
      width: budgets.poster.width,
      capKb: budgets.poster.capKb,
      minQuality: opts.minQuality,
      dry: opts.dry,
    }
  );

  let failed = false;
  for (const s of sets) {
    const heaviest = s.built.length
      ? `${Math.max(...s.built.map((f) => kb(f.bytes))).toFixed(1)} КБ`
      : "—";
    console.log(
      `\n  ${s.platform}: ${s.built.length}/${s.need} кадров · ` +
        `самый тяжёлый ${heaviest} (потолок ${s.capKb}) · ` +
        `набор ${(s.totalKb / 1024).toFixed(2)} МБ (потолок ${(s.totalCapKb / 1024).toFixed(2)} МБ)`
    );
    if (s.over.length) {
      failed = true;
      console.log(
        `    БЮДЖЕТ ПРЕВЫШЕН на ${s.over.length} кадр(ах) из ${s.need} даже при качестве ${opts.minQuality}:`
      );
      for (const o of s.over.slice(0, 5)) {
        console.log(`      ${o.name} (из ${o.src}) — ${o.kb} КБ > ${s.capKb} КБ`);
      }
      if (s.over.length > 5) console.log(`      … и ещё ${s.over.length - 5}`);
    }
    if (s.totalKb > s.totalCapKb) {
      failed = true;
      console.log(`    БЮДЖЕТ НАБОРА ПРЕВЫШЕН: ${(s.totalKb / 1024).toFixed(2)} МБ`);
    }
  }

  console.log(
    `\n  постер: ${kb(poster.bytes).toFixed(1)} КБ (потолок ${budgets.poster.capKb})` +
      (poster.over ? " — БЮДЖЕТ ПРЕВЫШЕН" : "")
  );
  if (poster.over) failed = true;

  if (failed) {
    // Полусобранная секвенция опаснее несобранной: страница нашла бы часть
    // кадров и проиграла жест с дырой. Уносим весь выход, а не только брак.
    if (!opts.dry) {
      await fs.rm(outDir, { recursive: true, force: true });
      // Если артикул существовал только ради этой секвенции — не оставляем
      // за собой пустую папку: пустой артикул в public/ читается как ассеты,
      // которых нет.
      await fs.rmdir(path.join(opts.out, opts.sku)).catch(() => {});
    }
    console.error(
      `\nСБОРКА ОСТАНОВЛЕНА: секвенция не влезает в бюджет PDP (≤1,5 МБ до взаимодействия).\n` +
        `\nЭТО НЕ ПЕРЕСЪЁМКА (docs/perf-budgets.md: «фотографа за вес не гоняют»).\n` +
        `Вес — решение инженера, а не брак кадра. Варианты, по убыванию дешевизны:\n` +
        `  • уменьшить ширину набора («Ширина кадра» в реестре);\n` +
        `  • опустить пол качества (--min-quality, сейчас ${opts.minQuality});\n` +
        `  • поднять потолок в docs/perf-budgets.md — осознанно, померив на A54.\n` +
        `Ничего не записано: полусобранная секвенция на диск не ложится.`
    );
    process.exit(1);
  }

  if (opts.dry) {
    console.log("\nСухой прогон: в бюджет влезаем, ничего не записано.");
    return;
  }

  // Профиль резкости ВЫБРАННЫХ кадров — не украшение отчёта, а рабочие данные:
  // резкость нарастает нелинейно, и PDP обязана вести кадры по этому профилю,
  // иначе двадцать почти одинаковых мутных кадров, а потом удар в резкость.
  const profile = {};
  for (const s of sets) {
    profile[s.platform] = [];
    for (const i of s.idx) profile[s.platform].push(+(await sharpness(frames[i])).toFixed(1));
  }

  const backLoaded = (arr) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    const dead = arr.filter((v) => v < lo + (hi - lo) * 0.1).length;
    return dead / arr.length > 0.5;
  };
  if (backLoaded(profile.mobile)) {
    console.log(
      `\n  ⚠️ Резкость нарастает поздно: больше половины кадров — в нижней десятой\n` +
        `     части диапазона. Это НОРМА физики фокуса, но проигрывать такие кадры\n` +
        `     равными интервалами времени нельзя — будет рывок. PDP (этап 12) обязана\n` +
        `     вести кадры по профилю резкости из манифеста, а не по таймеру.`
    );
  }

  const publicDir = path.join(ROOT, "public");
  const prefix = "/" + posix(path.relative(publicDir, path.join(opts.out, opts.sku)));

  const manifest = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/build-seq.mjs",
    sku: opts.sku,
    source: { dir: posix(path.relative(ROOT, opts.rack)), frames: frames.length },
    note:
      "Кадры ВЫБРАНЫ из одной снятой серии, не интерполированы. " +
      "01 — полный расфокус, последний — резкость.",
    poster: `${prefix}/seq/poster.jpg`,
    posterKb: Math.round(kb(poster.bytes)),
    sets: Object.fromEntries(
      sets.map((s) => [
        s.platform,
        {
          frames: s.built.length,
          width: budgets[s.platform].width,
          capKb: s.capKb,
          totalKb: Math.round(s.totalKb),
          files: s.built.map((f) => `${prefix}/seq/${s.platform}/${f.name}`),
          // Резкость каждого кадра набора: вход для easing проигрывания.
          sharpness: profile[s.platform],
          // Грузить ПО ЖЕСТУ, не вперёд (docs/perf-budgets.md, политика загрузки).
          loading: "on-gesture",
        },
      ])
    ),
  };
  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  console.log(`\nГОТОВО: ${posix(path.relative(ROOT, outDir))} (+ poster.jpg, manifest.json)`);
}

main().catch((e) => {
  console.error("СБОРКА СЕКВЕНЦИЙ УПАЛА:", e.message);
  process.exit(1);
});

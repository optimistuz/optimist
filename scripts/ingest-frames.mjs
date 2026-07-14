/**
 * ingest-frames.mjs — приёмка сдачи фотографа: дерево студии → ассеты сайта.
 *
 * Этап 10 шаг 7 (plan.md). Вход — дерево по `docs/photo-brief.md` §10, ровно
 * в том виде, в каком его сдаёт студия. Выход:
 *
 *   <out>/<id>/{front,quarter,side,folded,top,macro-1,macro-2}.jpg      1200 px
 *   <out>/<id>/{…}@2x.jpg                                               2400 px
 *   <out>/<id>/spin/01..48.jpg
 *   <манифест>.json — машинный вход каталога (этап 11)
 *
 * ГЛАВНЫЙ КОНТРАКТ: фотограф сдаёт ДЕСЯТЬ packshot-кадров, на сайт уходят СЕМЬ.
 * `front-top`, `side-ortho`, `front-ortho` — референс и чертёж миллиметров: они
 * обязаны приниматься (их отсутствие — недосдача), но НЕ публикуются. Скрипт,
 * который на них падает, и скрипт, который их публикует, — оба сломаны.
 *
 * ЛЕСЕНКА ШИРИН — не прихоть. Кадры нормализованы под multiply ⇒ идут
 * с `unoptimized` ⇒ next/image их не ужмёт и не отресайзит: телефон скачает
 * ровно то, что положил конвейер. Один файл на 2400 px в LCP-слоте карточки —
 * это ~230 КБ сети и ~16 МБ декода на Galaxy A15. Поэтому 1200 px — карточка
 * и LCP, 2400 px — лупа (ZOOM 1.85) и десктопный зум, по жесту.
 *
 * Белая точка — `scripts/lib/white-point.mjs` (один закон на весь конвейер;
 * предохранитель читается из `normalize-white.ps1`). Бюджеты веса —
 * `docs/perf-budgets.md` (раздел «Packshot и спин»), не из головы.
 *
 * Запускается ВРУЧНУЮ, не из `next build`.
 *
 *   node scripts/ingest-frames.mjs <дерево-сдачи> [опции]
 *   node scripts/ingest-frames.mjs --verify <файл|папка>   приговор без записи
 *
 *   --out <dir>      куда публиковать (по умолчанию public/frames)
 *   --manifest <p>   куда писать машинный вход каталога
 *   --only <sku>     принять один артикул
 *   --crop x,y,w,h   зона фона в долях 0..1 (как -CropRect у normalize-white.ps1) —
 *                    для кадров, где объект занимает границы (макро)
 *   --dry            ничего не писать, только приговор
 *
 * Код возврата: 0 — все артикулы приняты; 1 — хотя бы один забракован.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readMaxGain, judge, verifyPublished, backgroundStats, gainsOf } from "./lib/white-point.mjs";
import { readAssetBudgets } from "./lib/canon.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** На сайт. Порядок — порядок карточки товара. */
export const WEB_SHOTS = ["front", "quarter", "side", "folded", "top", "macro-1", "macro-2"];

/** Сдаются обязательно, в веб НЕ публикуются: референс и чертёж мм. */
export const ARCHIVE_SHOTS = ["front-top", "side-ortho", "front-ortho"];

/**
 * Допуски миллиметров. Единственное определение в проекте: `validate-catalog.mjs`
 * (этап 11) импортирует ЭТИ границы, а не заводит свои. Совпадают
 * с docs/photo-brief.md §3.1 и CLAUDE.md («Витрина», п. 2).
 */
export const MM_RANGES = {
  lens: [40, 62], // ширина линзы
  bridge: [14, 24], // переносица
  temple: [120, 155], // длина дужки
};

const SPIN_FRAMES = 48; // docs/photo-brief.md §4 — «ровно 48»
const RACK_MIN = 30; // ниже него десктопный набор не собрать (build-seq)
const PACKSHOT_QUALITY = 92;
const PACKSHOT_FLOOR = 84; // ниже не жмём: под multiply видно кромку
const SPIN_QUALITY = 82;
const SPIN_FLOOR = 70;

const kb = (bytes) => Math.round(bytes / 1024);
const posix = (p) => p.split(path.sep).join("/");

/**
 * Кадр «на белом» → нормализованный JPEG заданной ширины, влезающий в потолок.
 * Вес — гейт, но НЕ повод для пересъёмки: тяжёлый кадр чинится качеством
 * и шириной, а не студией. Поэтому сообщение об этом говорит прямо.
 */
async function publishShot(src, dst, { gain, width, capKb, quality, floor, dry }) {
  const { data, info } = await sharp(src)
    .linear([gain.r, gain.g, gain.b], [0, 0, 0])
    // withoutEnlargement НЕТ намеренно: ширина — контракт. Если исходник
    // не дотягивает, это ловится ассертом ДО публикации (checkWidth), а не
    // маскируется молчаливым «оставим как есть» — иначе front.jpg и front@2x.jpg
    // выходят одним и тем же файлом под двумя именами.
    .resize({ width, kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } };

  const ladder = [];
  for (let q = quality; q > floor; q -= 4) ladder.push(q);
  ladder.push(floor);

  let last = null;
  for (const q of ladder) {
    const buf = await sharp(data, raw)
      // 4:4:4 обязателен: сабсэмплинг даёт под multiply цветную бахрому на кромке.
      .jpeg({ quality: q, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    last = { bytes: buf.length, quality: q, width: info.width };
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

// --- Таблица SKU ------------------------------------------------------------
//
// «Формат — любая таблица» (photo-brief §10). Принимаем CSV/TSV с шапкой;
// колонки узнаём по псевдонимам, чтобы студия не переучивалась под нас.

const COLUMN_ALIASES = {
  id: ["артикул", "sku", "id", "article"],
  lens: ["ширина линзы", "линза", "lens"],
  bridge: ["переносица", "мостик", "bridge"],
  temple: ["длина дужки", "дужка", "temple"],
  frontWidth: ["общая ширина", "ширина фронта", "front_width"],
  lensHeight: ["высота линзы", "lens_height"],
  material: ["материал фронта", "материал", "material"],
  templeMaterial: ["материал дужек", "temple_material"],
  color: ["цвет", "color", "colour"],
  // Честность кадра — не метаданные, а закон (CLAUDE.md: photos.ts/frames.ts
  // НИКОГДА не лгут об источнике и авторе кадра).
  source: ["источник", "происхождение", "source", "origin"],
  author: ["автор", "фотограф", "author", "photographer"],
};

function splitRow(line) {
  const sep = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
}

function mapHeader(cells) {
  const map = {};
  cells.forEach((cell, i) => {
    const low = cell.toLowerCase();
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map[key] === undefined && aliases.some((a) => low.includes(a))) map[key] = i;
    }
  });
  return map;
}

async function readSkuTable(deliveryDir) {
  for (const name of ["sku.csv", "sku.tsv", "sku.txt", "sku-table.csv"]) {
    let raw;
    try {
      raw = await fs.readFile(path.join(deliveryDir, name), "utf8");
    } catch {
      continue;
    }
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const map = mapHeader(splitRow(lines[0]));
    if (map.id === undefined) continue;

    const rows = new Map();
    for (const line of lines.slice(1)) {
      const cells = splitRow(line);
      const id = cells[map.id]?.toLowerCase();
      if (!id) continue;
      const numOf = (k) => {
        const v = map[k] === undefined ? "" : cells[map[k]];
        const n = Number(String(v).replace(",", "."));
        return v !== "" && Number.isFinite(n) ? n : null;
      };
      const strOf = (k) => (map[k] === undefined ? null : cells[map[k]] || null);
      rows.set(id, {
        id,
        lens: numOf("lens"),
        bridge: numOf("bridge"),
        temple: numOf("temple"),
        frontWidth: numOf("frontWidth"),
        lensHeight: numOf("lensHeight"),
        material: strOf("material"),
        templeMaterial: strOf("templeMaterial"),
        color: strOf("color"),
        source: strOf("source"),
        author: strOf("author"),
      });
    }
    return { file: name, rows, hasSourceColumn: map.source !== undefined };
  }
  return null;
}

/** Мм вне диапазона валидатор каталога отвергнет — ловим это на приёмке кадров. */
function checkMm(row) {
  const problems = [];
  for (const [key, [lo, hi]] of Object.entries(MM_RANGES)) {
    const v = row?.[key];
    if (v === null || v === undefined) problems.push(`${key}: не записан`);
    else if (v < lo || v > hi) problems.push(`${key} = ${v} мм вне диапазона ${lo}–${hi}`);
  }
  return problems;
}

// --- Приём одного артикула --------------------------------------------------

/**
 * Один кадр сайта: приговор белой точки → нормализация → лесенка 1200/2400.
 * Пишет находки в res; исключения ловит вызывающий и называет файл по имени.
 */
async function publishWebShot(name, src, outDir, res, opts, A) {
  const verdict = await judge(src, { maxGain: opts.maxGain, crop: opts.crop });
  if (!verdict.ok) {
    res.ok = false;
    res.problems.push(
      `${name}.jpg — ${verdict.unmeasurable ? "НЕ ИЗМЕРЕН" : "БРАК"}: ${verdict.reason}`
    );
    return;
  }

  // Макро — свой бюджет: там оправа занимает половину кадра и больше, а фактура
  // ацетата JPEG не жмёт. Общий потолок валил бы безупречный кадр (замер
  // хронометриста: front @2400 — 118 КБ, macro — 472 КБ).
  const isMacro = name.startsWith("macro");
  const cfg1x = isMacro ? A.macro : A.packshot;
  const cfg2x = isMacro ? A.macro2x : A.packshot2x;

  // Ширина — КОНТРАКТ, а не потолок. Исходник обязан до неё дотягивать: иначе
  // `<кадр>.jpg` и `<кадр>@2x.jpg` выйдут одним файлом под двумя именами,
  // каталог решит, что лесенка есть, телефон скачает одно и то же дважды,
  // а лупа ×1,85 растянет кашу.
  const meta = await sharp(src).metadata();
  if (meta.width < cfg2x.width) {
    res.ok = false;
    res.problems.push(
      `${name}.jpg — ШИРИНА ${meta.width} px < ${cfg2x.width} px: лесенка не собирается ` +
        `(1200 px и 2400 px вышли бы одним файлом). Бриф §1: длинная сторона ≥ 3000 px.`
    );
    return;
  }

  const variants = [];
  for (const [suffix, cfg, capKey] of [
    ["", cfg1x, isMacro ? "macro" : "packshot"],
    ["@2x", cfg2x, isMacro ? "macro2x" : "packshot2x"],
  ]) {
    const r = await publishShot(src, path.join(outDir, `${name}${suffix}.jpg`), {
      gain: verdict.gain,
      width: cfg.width,
      capKb: cfg.capKb,
      quality: PACKSHOT_QUALITY,
      floor: PACKSHOT_FLOOR,
      dry: opts.dry,
    });
    if (r.over) {
      res.ok = false;
      res.problems.push(
        `${name}${suffix}.jpg — ВЕС ${kb(r.bytes)} КБ > потолка ${cfg.capKb} КБ (${capKey}) ` +
          `даже при q${PACKSHOT_FLOOR}. Это НЕ пересъёмка: уменьшайте ширину/качество ` +
          `или поднимайте потолок в docs/perf-budgets.md.`
      );
      return;
    }
    variants.push({ suffix, bytes: r.bytes });
    res.bytes += r.bytes;
  }

  // Проверяем ЗАПИСАННЫЙ файл, а не намерение: фон обязан стать белым.
  if (!opts.dry) {
    const v = await verifyPublished(path.join(outDir, `${name}.jpg`));
    if (!v.ok) {
      res.ok = false;
      res.problems.push(
        `${name}.jpg — после нормализации фон ${v.min?.toFixed(0)} < 254: не доведён до белого.`
      );
      return;
    }
  }

  res.published.push({
    name,
    bytes: variants.reduce((s, v) => s + v.bytes, 0),
    gain: {
      r: +verdict.gain.r.toFixed(4),
      g: +verdict.gain.g.toFixed(4),
      b: +verdict.gain.b.toFixed(4),
    },
  });
}

async function listJpegs(dir) {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f) => /\.(jpe?g)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  } catch {
    return [];
  }
}

async function ingestSku(id, skuDir, opts) {
  const outDir = path.join(opts.out, id);
  const res = {
    id,
    published: [],
    archive: [],
    spin: 0,
    rack: 0,
    extras: [],
    problems: [],
    bytes: 0,
    ok: true,
  };
  const A = opts.assets;

  // 1. Комплектность: десять packshot-кадров. Недосдача — брак артикула.
  const missing = [];
  for (const name of [...WEB_SHOTS, ...ARCHIVE_SHOTS]) {
    try {
      await fs.access(path.join(skuDir, `${name}.jpg`));
    } catch {
      missing.push(`${name}.jpg`);
    }
  }
  if (missing.length) {
    res.ok = false;
    res.problems.push(`недосдача packshot: ${missing.join(", ")}`);
  }

  // 2. Семь кадров сайта: белая точка → нормализация → лесенка 1200 / 2400.
  for (const name of WEB_SHOTS) {
    const src = path.join(skuDir, `${name}.jpg`);
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    try {
      await publishWebShot(name, src, outDir, res, opts, A);
    } catch (e) {
      // Битый кадр называет СЕБЯ и не уносит ни партию, ни соседние кадры.
      res.ok = false;
      res.problems.push(`${name}.jpg — сбой обработки: ${e.message}`);
    }
  }

  // 3. Три архивных: принимаем и ПРОВЕРЯЕМ, но не публикуем. Их белая точка —
  //    предупреждение, а не брак: в вебе их никто не увидит, а мм по ним мерят.
  for (const name of ARCHIVE_SHOTS) {
    const src = path.join(skuDir, `${name}.jpg`);
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    const verdict = await judge(src, { maxGain: opts.maxGain, crop: opts.crop });
    res.archive.push({ name, published: false, ok: verdict.ok });
    if (!verdict.ok && !verdict.unmeasurable) {
      res.problems.push(
        `${name}.jpg — фон слабый, но кадр архивный: в веб не идёт, артикул из-за него не бракуется.`
      );
    }
  }

  // 4. Спин: ровно 48 кадров (photo-brief §4).
  const spinFiles = await listJpegs(path.join(skuDir, "spin"));
  if (spinFiles.length) {
    if (spinFiles.length !== SPIN_FRAMES) {
      res.ok = false;
      res.problems.push(
        `спин: ${spinFiles.length} кадров вместо ${SPIN_FRAMES} — оборот неполный, прокрутка порвёт шаг.`
      );
    } else {
      for (let i = 0; i < spinFiles.length; i++) {
        const src = path.join(skuDir, "spin", spinFiles[i]);
        const verdict = await judge(src, { maxGain: opts.maxGain, crop: opts.crop });
        if (!verdict.ok) {
          res.ok = false;
          res.problems.push(`spin/${spinFiles[i]} — ${verdict.reason}`);
          break;
        }
        const r = await publishShot(
          src,
          path.join(outDir, "spin", `${String(i + 1).padStart(2, "0")}.jpg`),
          {
            gain: verdict.gain,
            width: A.spin.width,
            capKb: A.spin.capKb,
            quality: SPIN_QUALITY,
            floor: SPIN_FLOOR,
            dry: opts.dry,
          }
        );
        if (r.over) {
          res.ok = false;
          res.problems.push(
            `spin/${spinFiles[i]} — ВЕС ${kb(r.bytes)} КБ > потолка ${A.spin.capKb} КБ.`
          );
          break;
        }
        res.spin++;
        res.bytes += r.bytes;
      }
    }
  }

  // 5. Чужие зоны: считаем и передаём дальше, не трогаем.
  const rackFiles = await listJpegs(path.join(skuDir, "rack"));
  res.rack = rackFiles.length;
  if (rackFiles.length && rackFiles.length < RACK_MIN) {
    res.problems.push(
      `rack: ${rackFiles.length} кадров — меньше минимума ${RACK_MIN}. ` +
        `Десктопный набор (30) из этой серии не собрать.`
    );
  }
  for (const [dir, owner] of [
    ["alpha", "AlphaFrame, этап 17"],
    ["3d", "оцифровка, этап 15 — за гейтом владельца"],
  ]) {
    try {
      const files = await fs.readdir(path.join(skuDir, dir));
      if (files.length) res.extras.push(`${dir}/ — ${files.length} шт. (${owner}), не публикуется`);
    } catch {
      /* нет папки — норма */
    }
  }
  const videos = (await fs.readdir(skuDir).catch(() => [])).filter((f) =>
    /\.(mp4|webm|mov)$/i.test(f)
  );
  if (videos.length) {
    res.extras.push(
      `видео — ${videos.length} шт.: конвейер их НЕ принимает и НЕ проверяет ` +
        `(1080p, H.264+WebM, без звука, ≤2500 кбит/с — глазами). Фолбэк PDP до секвенций.`
    );
  }

  return res;
}

// --- Ветки дерева, которые конвейер не берёт --------------------------------
//
// Молчаливый пропуск — худший вид дыры: фотограф, забывший RAW, получит
// зелёное «OK». Каждая ветка называется вслух, с владельцем и статусом.

async function reportUnhandled(delivery) {
  const lines = [];
  const count = async (d) => (await fs.readdir(path.join(delivery, d)).catch(() => [])).length;

  const raw = await count("_raw");
  lines.push(
    raw
      ? `  _raw/ — ${raw} записей: архив, конвейером не обрабатывается (бриф §1 — RAW хранится всегда).`
      : `  _raw/ — ПУСТО. RAW НЕ СДАН. Бриф §1: «не выбрасывать RAW — никогда». ` +
        `Переобработка под будущие слоты идёт годами; без RAW она невозможна.`
  );

  const salons = await count("salons");
  if (salons) {
    lines.push(
      `  salons/ — ${salons} записей: интерьеры и фасады. Конвейер их не берёт — ` +
        `слоты photos.ts заполняются вручную (шаг 9 этапа 10), кадрирование 21:9 и 9:16 — глазами.`
    );
  }

  const models = await count("models");
  if (models) {
    lines.push(
      `  models/ — ${models} записей. ⛔ ГЕЙТ СОГЛАСИЯ: форма docs/consent-photo.md — ЧЕРНОВИК ` +
        `до утверждения юристом по ЗРУ-547. До утверждения кадры людей НЕ публикуются ` +
        `и в конвейер НЕ принимаются. Не обработано намеренно.`
    );
  }
  return lines;
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    delivery: null,
    verify: null,
    out: path.join(ROOT, "public", "frames"),
    manifest: path.join(ROOT, "src", "content", "frames.ingest.json"),
    only: null,
    crop: null,
    dry: false,
    expect: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verify") opts.verify = path.resolve(argv[++i]);
    else if (a === "--out") opts.out = path.resolve(argv[++i]);
    else if (a === "--manifest") opts.manifest = path.resolve(argv[++i]);
    else if (a === "--only") opts.only = argv[++i].toLowerCase();
    else if (a === "--crop") opts.crop = argv[++i].split(",").map(Number);
    else if (a === "--dry") opts.dry = true;
    else if (a === "--expect") opts.expect = true;
    else if (!a.startsWith("--") && !opts.delivery) opts.delivery = path.resolve(a);
  }
  return opts;
}

/**
 * Режим съёмочного дня: приговор по кадрам без всякой публикации.
 * Печатает и «рамочный» gain (как normalize-white.ps1), и настоящий — по всему
 * фону: чтобы было видно, когда край честный, а глубина кадра — нет.
 */
async function verifyMode(target, maxGain, crop, expect) {
  const stat = await fs.stat(target);
  const files = stat.isDirectory()
    ? (await fs.readdir(target)).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => path.join(target, f))
    : [target];

  console.log(`ПРОВЕРКА БЕЛОЙ ТОЧКИ (предохранитель gain ≤ ${maxGain})\n`);
  let bad = 0;
  let unmeasured = 0;
  const missed = [];
  for (const f of files) {
    const v = await judge(f, { maxGain, crop });
    const name = path.basename(f);
    const got = v.unmeasurable ? "nomeasure" : v.ok ? "ok" : "brak";
    if (v.unmeasurable) {
      // «Не измерен» — НЕ брак кадра, и в счётчик пересъёмки он не идёт:
      // фотограф, которому велят переснимать годный кадр, скоро перестанет
      // верить и настоящему браку.
      unmeasured++;
      console.log(`  [НЕ ИЗМЕРЕН] ${name}\n      ${v.reason}`);
    } else if (!v.ok) {
      bad++;
      console.log(`  [БРАК]  ${name} — gain ${v.worst.toFixed(4)}, фон ${(v.fraction * 100).toFixed(0)} % кадра`);
    } else {
      console.log(`  [OK]    ${name} — gain ${v.worst.toFixed(4)}, фон ${(v.fraction * 100).toFixed(0)} % кадра`);
    }

    // САМОПРОВЕРКА. Кадры-ловушки объявляют ожидаемый приговор своим именем
    // (ok- / brak- / nomeasure-). Без сверки прибор проверял сам себя «на глаз»:
    // он честно печатал «4 годных, 1 к пересъёмке» — и не замечал, что ДВЕ
    // ловушки из пяти получили не тот приговор, ради которого их и создавали.
    // Так дыра в гейте дожила до записи в plan.md «конвейер доказан пилотом».
    // Теперь несовпадение роняет прогон: гейт доказывается падением.
    if (expect) {
      const want = name.match(/^(ok|brak|nomeasure)-/)?.[1];
      if (!want) {
        missed.push(`${name}: имя не объявляет ожидание (нужен префикс ok- / brak- / nomeasure-)`);
      } else if (want !== got) {
        missed.push(`${name}: ждали «${want}», прибор сказал «${got}»`);
      }
    }
  }
  const parts = [`${files.length - bad - unmeasured} годных`, `${bad} к пересъёмке`];
  if (unmeasured) parts.push(`${unmeasured} не измерено`);
  console.log(`\nИТОГ: ${parts.join(", ")}.`);

  if (expect) {
    if (missed.length) {
      console.error(`\nСАМОПРОВЕРКА ПРОВАЛЕНА — прибор судит не так, как обещает канон:`);
      for (const m of missed) console.error(`  ✗ ${m}`);
      console.error(
        `\nЭто отказ ГЕЙТА, а не кадров. Пока он не починен, кадрам верить нельзя:\n` +
          `брак уйдёт на сайт и вскроется пиксельным аудитом, когда студию уже разберут.`
      );
      process.exit(1);
    }
    console.log(`САМОПРОВЕРКА: ${files.length}/${files.length} — каждая ловушка получила свой приговор.`);
    return;
  }

  if (bad) {
    console.log("Пока студия собрана — переснимите сегодня. Через неделю это вторая аренда.");
    process.exit(1);
  }
  if (unmeasured) {
    console.log(
      "Пересъёмка НЕ нужна: эти кадры не забракованы, их просто не удалось измерить.\n" +
        "Покажите прибору фон — --crop x,y,w,h (доли 0..1) — и прогоните снова."
    );
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  opts.maxGain = await readMaxGain(ROOT);

  if (opts.verify) return verifyMode(opts.verify, opts.maxGain, opts.crop, opts.expect);

  if (!opts.delivery) {
    console.error(
      "Использование:\n" +
        "  node scripts/ingest-frames.mjs <дерево-сдачи> [--out public/frames]\n" +
        "                                 [--manifest <путь>] [--only <sku>] [--crop x,y,w,h] [--dry]\n" +
        "  node scripts/ingest-frames.mjs --verify <файл|папка>   приговор по белой точке, без записи\n" +
        "  node scripts/ingest-frames.mjs --verify <папка> --expect   + самопроверка гейта:\n" +
        "        имя кадра объявляет ожидаемый приговор (ok- / brak- / nomeasure-),\n" +
        "        расхождение роняет прогон. Так проверяется сам ПРИБОР.\n\n" +
        "Дерево сдачи — как в docs/photo-brief.md §10."
    );
    process.exit(1);
  }

  opts.assets = await readAssetBudgets(ROOT);

  const entries = await fs.readdir(opts.delivery, { withFileTypes: true });
  const skuDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !n.startsWith("_") && !["salons", "models"].includes(n))
    .filter((n) => (opts.only ? n.toLowerCase() === opts.only : true))
    .sort();

  if (!skuDirs.length) {
    console.error(`В ${opts.delivery} нет артикулов${opts.only ? ` (--only ${opts.only})` : ""}.`);
    process.exit(1);
  }

  const table = await readSkuTable(opts.delivery);
  const A = opts.assets;
  const isPilot = opts.out.includes("_pilot");

  console.log(`ПРИЁМКА: ${opts.delivery}${isPilot ? "   [ПИЛОТ — на сайт не идёт]" : ""}`);
  console.log(`  белая точка: gain ≤ ${opts.maxGain} (из normalize-white.ps1), фон — весь, не рамка`);
  console.log(
    `  вес (docs/perf-budgets.md): packshot ${A.packshot.width}px ≤${A.packshot.capKb} КБ · ` +
      `@2x ${A.packshot2x.width}px ≤${A.packshot2x.capKb} КБ · spin ≤${A.spin.capKb} КБ`
  );
  console.log(
    `  таблица SKU: ${table ? `${table.file}, строк ${table.rows.size}` : "НЕ СДАНА — мм и источник неизвестны"}`
  );
  console.log(`  режим: ${opts.dry ? "сухой прогон, ничего не пишем" : `публикация в ${opts.out}`}\n`);

  const results = [];
  for (const dirName of skuDirs) {
    const id = dirName.toLowerCase(); // папка OP-0142 и строка op-0142 — один артикул
    let res;
    try {
      res = await ingestSku(id, path.join(opts.delivery, dirName), opts);
    } catch (e) {
      // Один битый JPEG (обрезанный, CMYK, кривой EXIF — рутина в сдаче на 500
      // кадров) не имеет права уносить всю партию. Имя файла в сообщении
      // обязательно: без него на сдаче в 500 кадров это поиск вслепую.
      res = { id, published: [], archive: [], spin: 0, rack: 0, extras: [], bytes: 0, ok: false,
              problems: [`сбой обработки: ${e.message}${e.file ? ` (файл: ${e.file})` : ""}`] };
    }

    const row = table?.rows.get(id) ?? null;

    const mmProblems = checkMm(row);
    if (mmProblems.length) {
      res.ok = false;
      res.problems.push(`миллиметры: ${mmProblems.join("; ")}`);
    }

    // Честность кадра — гейт, а не поле. CLAUDE.md: frames.ts НИКОГДА не лжёт
    // об источнике и авторе. Значит и вход каталога не имеет права молчать.
    if (!row?.source) {
      res.ok = false;
      res.problems.push(
        `источник кадров не объявлен: в таблице SKU нужна колонка «источник» ` +
          `(собственная съёмка / каталог бренда + реквизиты разрешения). ` +
          `Без неё каталог не сможет не солгать.`
      );
    }
    res.mm = row;

    // Забракованный артикул не оставляет следов в public/ — даже если упал
    // посреди публикации.
    if (!res.ok && !opts.dry) {
      await fs.rm(path.join(opts.out, id), { recursive: true, force: true });
      res.wiped = true;
    }
    results.push(res);

    console.log(
      `[${res.ok ? "OK  " : "БРАК"}] ${id} — сайт: ${res.published.length}/${WEB_SHOTS.length} (×2 ширины), ` +
        `архив (не публикуется): ${res.archive.length}/${ARCHIVE_SHOTS.length}, ` +
        `спин: ${res.spin}, rack: ${res.rack}, вес: ${kb(res.bytes)} КБ` +
        (res.wiped ? " → снято с публикации" : "")
    );
    for (const e of res.extras) console.log(`         ${e}`);
    for (const p of res.problems) console.log(`         → ${p}`);
  }

  console.log("\nВЕТКИ ДЕРЕВА, КОТОРЫЕ КОНВЕЙЕР НЕ БЕРЁТ:");
  for (const line of await reportUnhandled(opts.delivery)) console.log(line);

  const good = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);

  if (!opts.dry && good.length) {
    const publicDir = path.join(ROOT, "public");
    const rel = path.relative(publicDir, opts.out);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      // Иначе манифест выдаст каталогу URL вида «/../куда-то» — путь, которого
      // на сайте не существует. Молча писать нерабочие ссылки нельзя.
      throw new Error(
        `--out (${opts.out}) вне public/ — манифест не сможет назвать честный URL. ` +
          `Публикуйте внутрь public/ или задайте --dry.`
      );
    }
    const prefix = "/" + posix(rel);
    const manifest = {
      generatedAt: new Date().toISOString(),
      generator: "scripts/ingest-frames.mjs",
      // Пилот от боевой сдачи обязан отличаться на глаз и машинно: иначе
      // синтетика на чужих каталожных кадрах неотличима от своей съёмки.
      pilot: isPilot,
      note:
        "Машинный вход каталога (этап 11). НЕ источник правды: источник — " +
        "src/content/frames.ts под zod-схемой. Здесь только то, что реально принято." +
        (isPilot ? " ⚠️ ПИЛОТ: синтетические кадры, публикации не подлежат." : ""),
      delivery: posix(path.relative(ROOT, opts.delivery)),
      maxGain: opts.maxGain,
      skus: good.map((r) => ({
        id: r.id,
        mm: r.mm,
        // Источник и автор едут в каталог вместе с кадрами — иначе цепочка
        // честности рвётся ровно на передаче.
        source: r.mm?.source ?? null,
        author: r.mm?.author ?? null,
        images: {
          ...Object.fromEntries(
            r.published.map((p) => [
              p.name,
              { src: `${prefix}/${r.id}/${p.name}.jpg`, src2x: `${prefix}/${r.id}/${p.name}@2x.jpg` },
            ])
          ),
          spin: Array.from(
            { length: r.spin },
            (_, i) => `${prefix}/${r.id}/spin/${String(i + 1).padStart(2, "0")}.jpg`
          ),
        },
        rackSourceFrames: r.rack, // сырьё build-seq, в public/ не копируется
        whitePoint: Object.fromEntries(r.published.map((p) => [p.name, p.gain])),
      })),
    };
    await fs.mkdir(path.dirname(opts.manifest), { recursive: true });
    await fs.writeFile(opts.manifest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`\nМанифест каталога: ${posix(path.relative(ROOT, opts.manifest))}`);
  }

  console.log(
    `\nИТОГ: принято ${good.length}, забраковано ${bad.length}. ` +
      `Вес опубликованного: ${kb(good.reduce((s, r) => s + r.bytes, 0))} КБ`
  );
  if (bad.length) {
    console.log(
      "\nЗабракованные артикулы в каталог не идут. Если студия ещё собрана — " +
        "пересъёмка сегодня дешевле второй аренды."
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ПРИЁМКА УПАЛА:", e.message);
  process.exit(1);
});

/**
 * make-pilot-delivery.mjs — синтетическая «сдача фотографа» для пилота конвейера.
 *
 * Этап 10 шаг 7 (plan.md): «пилотный прогон конвейера на существующих кадрах —
 * конвейер доказан ДО прихода съёмки, этапы 11–12 не ждут фотографа».
 *
 * Скрипт собирает дерево по docs/photo-brief.md §10 из того, что уже лежит
 * в public/photos, — и намеренно кладёт в него БРАК. Конвейер, который
 * проверяли только на хороших кадрах, не проверяли вообще: гейт доказывается
 * падением, а не успехом.
 *
 * Что в дереве:
 *   op-pilot-a    — годный артикул: 10 packshot + спин 48 + rack 36 + alpha + 3d
 *   op-pilot-b    — годный, без спина (спин необязателен)
 *   op-pilot-bad  — БРАК: фон завален (gain > предохранителя) + мм вне диапазона
 *   _negative/    — материал для проверки падений build-seq:
 *                     rack-short/ — 24 кадра (десктопный набор не собрать)
 *                     rack-heavy/ — 30 кадров, которые не влезут в бюджет
 *   _raw/, salons/ — служебные ветки: конвейер обязан их пропустить
 *   sku.csv       — таблица миллиметров
 *
 * ⚠️ Это ТЕСТОВЫЙ материал, а не фотографии. Кадры синтезированы из чужих
 * каталожных снимков (см. src/content/photos.ts) и на сайт не идут никогда:
 * и дерево, и выход пилота — в .gitignore.
 *
 *   node scripts/make-pilot-delivery.mjs [--out .pilot-delivery]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTOS = path.join(ROOT, "public", "photos");

const WEB_SHOTS = ["front", "quarter", "side", "folded", "top", "macro-1", "macro-2"];
const ARCHIVE_SHOTS = ["front-top", "side-ortho", "front-ortho"];
const ALL_SHOTS = [...WEB_SHOTS, ...ARCHIVE_SHOTS];

/**
 * Windows держит удаляемое дерево «в процессе удаления» ещё какое-то время
 * после возврата fs.rm. Немедленный mkdir попадает на зомби-каталог, и запись
 * падает с ENOENT — у аудиторов это воспроизводилось в трети прогонов.
 * Прибор, которым доказывают гейт, не имеет права падать сам.
 */
async function rmrf(target) {
  for (let i = 0; i < 40; i++) {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    try {
      await fs.access(target);
      await new Promise((r) => setTimeout(r, 100)); // ещё не исчезло — ждём
    } catch {
      return; // исчезло
    }
  }
  throw new Error(`не удалось удалить ${target} — что-то держит файлы.`);
}

/**
 * Ширина исходника фотографа. Бриф §1 требует длинную сторону ≥ 3000 px, и
 * конвейер это ПРОВЕРЯЕТ (лесенка 1200/2400 из кадра 1600 px не собирается).
 * Исходники public/photos — 1600 px, поэтому пилот их поднимает: нам нужен
 * правдоподобный ВХОД, а не красивая картинка. На сайт это не идёт.
 */
const DELIVERY_WIDTH = 3000;

/**
 * Запись кадра. sharp.toFile() открывает файл САМ, внутри libvips, — и на
 * Windows попадает в каталог, который файловая система ещё не проявила после
 * mkdir. Прогон падал с ENOENT примерно в трети случаев, причём не на первом
 * кадре, а на случайном (26-м, 33-м) — то есть выглядел как порча данных,
 * а не как гонка. Хуже: один прогон отрапортовал «Готово», не оставив дерева
 * на диске, и приёмка забраковала ГОДНЫЙ артикул, жалуясь на кадр, который
 * лежит на месте. Прибор, которым доказывают гейт, не имеет права падать сам
 * и тем более не имеет права клеветать на кадр.
 *
 * Лечится тем же приёмом, каким это уже сделано в боевых ingest-frames.mjs
 * и build-seq.mjs: кадр собирается в память, а файл пишет Node — после того,
 * как каталог гарантированно создан.
 */
const written = new Map(); // путь → сколько байт мы думаем, что записали

async function write(pipe, dst) {
  const buf = await pipe.toBuffer();
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.writeFile(dst, buf);
  written.set(dst, buf.length);
}

/**
 * ПИЛОТ ОБЯЗАН ПЕРЕСЧИТАТЬ СЕБЯ.
 *
 * Скрипт уже однажды напечатал «Готово» и вышел с кодом 0, не оставив дерева
 * на диске, — а приёмка следом ЗАБРАКОВАЛА годный артикул, жалуясь на кадры,
 * которых «нет». Клевета на кадр дороже падения: в день съёмки она стоит
 * пересъёмки. Поэтому успех объявляется не после последней записи, а после
 * сверки записанного с тем, что реально лежит на диске.
 *
 * Ловит и молчаливую потерю файлов, и вторую копию скрипта, запущенную
 * параллельно на том же дереве (аудиторы делали так — и получали огрызок).
 */
async function verifyWritten() {
  const lost = [];
  for (const [file, bytes] of written) {
    const size = await fs.stat(file).then((s) => s.size, () => -1);
    if (size !== bytes) lost.push(`${path.relative(ROOT, file)} — ждали ${bytes} Б, на диске ${size < 0 ? "НЕТ ФАЙЛА" : size + " Б"}`);
  }
  if (lost.length) {
    console.error(`\nПИЛОТ НЕ СОБРАН: записали ${written.size} файлов, не сходится ${lost.length}:`);
    for (const l of lost.slice(0, 8)) console.error(`  ✗ ${l}`);
    if (lost.length > 8) console.error(`  … и ещё ${lost.length - 8}`);
    console.error(
      `\nДереву верить нельзя — приёмка на нём оклевещет годные кадры.\n` +
        `Частая причина: второй прогон этого же скрипта на том же дереве. Повторите один.`
    );
    process.exit(1);
  }
  return written.size;
}

/** Лёгкая геометрическая вариация — чтобы кадры не были байт-в-байт одним файлом. */
async function packshot(src, dst, { angle = 0, darken = 1 } = {}) {
  const pipe = sharp(src).resize({ width: DELIVERY_WIDTH, kernel: "lanczos3" });
  if (angle) pipe.rotate(angle, { background: { r: 255, g: 255, b: 255 } });
  if (darken !== 1) pipe.linear(darken, 0); // тянет вниз и фон — так рождается брак
  await write(pipe.jpeg({ quality: 94, chromaSubsampling: "4:4:4" }), dst);
}

async function makeSku(
  dir,
  src,
  { spin = 0, rack = 0, darkenFront = 1, extras = false, rackDir = null, packshots = true }
) {
  if (packshots) {
    for (let i = 0; i < ALL_SHOTS.length; i++) {
      const name = ALL_SHOTS[i];
      await packshot(src, path.join(dir, `${name}.jpg`), {
        angle: (i - 4) * 0.4,
        darken: name === "front" ? darkenFront : 1,
      });
    }
  }

  for (let i = 1; i <= spin; i++) {
    await packshot(src, path.join(dir, "spin", `${String(i).padStart(2, "0")}.jpg`), {
      angle: ((i - 1) * 360) / spin / 12, // имитация поворотного стола
    });
  }

  // Серия ведения фокуса: от полного расфокуса к резкости. На съёмке это делает
  // камера; здесь — sharp, потому что нам нужен вход конвейера, а не фотография.
  // Серия пишется СРАЗУ в целевую папку. Первая версия собирала её в подпапке
  // и переименовывала — на Windows fs.rename каталога сразу после записи двух
  // десятков JPEG падает с EPERM (прогон 1 из 3). Прибор, которым доказывают
  // гейт, не имеет права сам падать на платформе проекта.
  const target = rackDir || path.join(dir, "rack");
  for (let i = 1; i <= rack; i++) {
    const t = (i - 1) / (rack - 1); // 0 → 1
    const sigma = 22 * (1 - t);
    const pipe = sharp(src);
    if (sigma > 0.3) pipe.blur(sigma);
    await write(pipe.jpeg({ quality: 92 }), path.join(target, `${String(i).padStart(2, "0")}.jpg`));
  }

  if (extras) {
    await write(sharp(src).png(), path.join(dir, "alpha", "front.png"));
    for (const turn of ["turn-00", "turn-45", "turn-65"]) {
      await write(sharp(src).jpeg({ quality: 90 }), path.join(dir, "3d", turn, "01.jpg"));
    }
  }
}

/**
 * Кадры-ловушки для закона белой точки. Каждый воспроизводит находку аудита:
 * старая реализация (сэмплирование рамки) на них ошибалась.
 */
async function makeWhitePointTraps(dir, src) {
  await fs.mkdir(dir, { recursive: true });
  const W = 1600;
  const H = 1067;
  const base = await sharp(src).resize(W, H, { fit: "cover" }).toBuffer();

  // 1. МАКРО: объект доходит до края и занимает низ кадра. Рамка занята
  //    объектом → старый фильтр «медиана−30» уезжал на оправу и выдавал
  //    gain 6,4 «ПЕРЕСЪЁМКА» на безупречном кадре. Фон честный: должен пройти.
  await write(
    sharp(base)
      .composite([
        {
          input: {
            create: { width: W, height: 380, channels: 3, background: { r: 28, g: 26, b: 24 } },
          },
          top: H - 380,
          left: 0,
        },
      ])
      .jpeg({ quality: 94 }),
    path.join(dir, "ok-macro-u-kraya.jpg")
  );

  // 2. ПЕЛЕНА: свип завален до 240 — вуалирующая засветка, рутина студии.
  //    Завал идёт по ВСЕМУ кадру, до самых краёв: свип и есть весь кадр.
  //    Гейт обязан НАЙТИ пелену и вылечить её усилением (gain ≈ 1,06 ≤ 1,085).
  await write(
    sharp(base).linear(240 / 255, 0).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }),
    path.join(dir, "ok-veil-240.jpg")
  );

  // 3. ЗАВАЛ СВИПА до 218 → gain ≈ 1,17 > 1,085. Обязан быть ЗАБРАКОВАН:
  //    нормализация такого фона выжгла бы тень под оправой.
  await write(
    sharp(base).linear(218 / 255, 0).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }),
    path.join(dir, "brak-fon-218.jpg")
  );

  // 6. КАЙМА (граница честности прибора). Кадр, вклеенный в белый холст:
  //    по краю честные 255, в глубине — завал 218. Заливка идёт от края
  //    и встаёт на ступеньке каймы — ровно как на кромке оправы, отличить
  //    их порогом яркости невозможно (у СВЕТЛОЙ оправы ступенька мельче).
  //    Поэтому фоном читается одна кайма, и «годен» здесь был бы враньём:
  //    под каймой лежит брак. Прибор обязан сказать «НЕ ИЗМЕРЕН» и просить
  //    --crop, а не выносить приговор. Это и проверяем.
  const inset = await sharp(base).linear(218 / 255, 0).resize(W - 160, H - 160).toBuffer();
  await write(
    sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite([{ input: inset, top: 80, left: 80 }])
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" }),
    path.join(dir, "nomeasure-kajma.jpg")
  );

  // 7. ЧЕСТНОЕ МАКРО С ПРОЗРАЧНЫМИ ЛИНЗАМИ — класс, который ЛОМАЛА первая
  //    версия предохранителя (аудит физика). Интерьер линзы — это стекло над
  //    белым свипом (250–255); заливка заперта ободом и внутрь не попадает,
  //    поэтому «объектом» числится СВЕТЛАЯ масса больше половины кадра — те же
  //    цифры, что у каймы. Отличие ровно одно: барьер здесь — обод оправы,
  //    он тёмный. Кадр честный (фон белый, gain ≈ 1,0) и обязан ПРОЙТИ.
  //    Пока эта ловушка зелёная, порог не бракует годное макро.
  //
  //    Кроп бьёт ПРЯМО В ЛИНЗУ (не в центр кадра: там свип, и объект выходил
  //    22 % — ловушка проходила по площади и класс не сторожила). Замер:
  //    объект 64 %, медиана объекта 255, БАРЬЕР 20 — против каймы, где
  //    объект 77 %, медиана 218, барьер 218. Оба «светлые и крупные»;
  //    различает их только барьер, и ловушка это доказывает.
  const meta = await sharp(src).metadata();
  await write(
    sharp(src)
      .extract({
        left: Math.round(meta.width * 0.1),
        top: Math.round(meta.height * 0.3),
        width: Math.round(meta.width * 0.32),
        height: Math.round(meta.height * 0.42),
      })
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" }),
    path.join(dir, "ok-macro-lens.jpg")
  );

  // 4. СВЕТЛАЯ ОПРАВА (золото, серебро, белёсый ацетат) на честном белом.
  //    Прежний закон отделял фон от оправы ПО ЯРКОСТИ и «съедал» такую оправу:
  //    фоном становилась она сама, и безупречный кадр получал «ПЕРЕСЪЁМКА».
  //    Обязан пройти: кромка у светлой оправы есть так же, как у тёмной.
  const light = Buffer.alloc(W * H * 3, 255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rx = Math.abs(x - W / 2) / (W * 0.3);
      const ry = Math.abs(y - H / 2) / (H * 0.22);
      const r = Math.max(rx, ry);
      const i = (y * W + x) * 3;
      let v = 255;
      if (r < 1) v = 232; // светлая оправа: чуть темнее фона, но с резкой кромкой
      else if (r < 1.35) v = 255 * (1 - 0.18 * Math.pow(1 - (r - 1) / 0.35, 2)); // тень
      light[i] = light[i + 1] = light[i + 2] = Math.round(v);
    }
  }
  await write(
    sharp(light, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 94 }),
    path.join(dir, "ok-svetlaya-oprava.jpg")
  );

  // 5. ВИНЬЕТКА: центр 255, углы 240. Скалярное усиление градиент НЕ выпрямляет,
  //    поэтому кадр обязан быть ЗАБРАКОВАН (бриф §1.1), а не «подтянут».
  const vign = Buffer.alloc(W * H * 3, 255);
  const cx = W / 2, cy = H / 2, maxd = Math.hypot(cx, cy);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxd;
      const i = (y * W + x) * 3;
      const v = Math.round(255 - 15 * d * d);
      vign[i] = vign[i + 1] = vign[i + 2] = v;
    }
  }
  const vignBg = await sharp(vign, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const frameOnly = await sharp(base).resize(Math.round(W * 0.55), Math.round(H * 0.5)).toBuffer();
  await write(
    sharp(vignBg)
      .composite([{ input: frameOnly, blend: "multiply", gravity: "center" }])
      .jpeg({ quality: 94 }),
    path.join(dir, "brak-vinetka.jpg")
  );
}

/**
 * Тяжёлая rack-серия: честно наводится на резкость (иначе её отбросит проверка
 * направления, и до бюджета дело не дойдёт), но резкий конец забит зерном —
 * в потолок кадра не влезает ни при каком разумном качестве. Так проверяется
 * именно ГЕЙТ БЮДЖЕТА, а не соседний гейт.
 */
async function makeHeavySeries(dir, count, src, size = { width: 1600, height: 1067 }) {
  await fs.mkdir(dir, { recursive: true });
  const px = Buffer.alloc(size.width * size.height * 3);
  for (let j = 0; j < px.length; j++) px[j] = Math.floor(Math.random() * 256);
  const grain = await sharp(px, { raw: { ...size, channels: 3 } }).png().toBuffer();
  const base = await sharp(src)
    .resize(size.width, size.height, { fit: "cover" })
    .composite([{ input: grain, blend: "overlay" }])
    .toBuffer();

  for (let i = 1; i <= count; i++) {
    const t = (i - 1) / (count - 1);
    const sigma = 20 * (1 - t);
    const pipe = sharp(base);
    if (sigma > 0.3) pipe.blur(sigma);
    await write(pipe.jpeg({ quality: 95 }), path.join(dir, `${String(i).padStart(2, "0")}.jpg`));
  }
}

async function main() {
  const argOut = process.argv.indexOf("--out");
  const out =
    argOut > -1 ? path.resolve(process.argv[argOut + 1]) : path.join(ROOT, ".pilot-delivery");

  await rmrf(out);
  await fs.mkdir(out, { recursive: true });

  console.log(`Собираю пилотную сдачу: ${path.relative(ROOT, out)}`);

  console.log("  op-pilot-a   — годный, полный комплект");
  await makeSku(path.join(out, "op-pilot-a"), path.join(PHOTOS, "deco-1.jpg"), {
    spin: 48,
    rack: 36,
    extras: true,
  });

  console.log("  op-pilot-b   — годный, без спина");
  await makeSku(path.join(out, "op-pilot-b"), path.join(PHOTOS, "deco-3.jpg"), {
    rack: 36,
  });

  console.log("  op-pilot-bad — брак: фон завален, мм вне диапазона");
  await makeSku(path.join(out, "op-pilot-bad"), path.join(PHOTOS, "deco-2.jpg"), {
    darkenFront: 0.9, // фон 255 → ~229: gain ≈ 1,11 > предохранителя 1,085
  });

  console.log("  _negative/   — материал для проверки падений build-seq");
  // Серии пишутся сразу по адресу — никаких переименований папок.
  await makeSku(path.join(out, "_negative"), path.join(PHOTOS, "deco-1.jpg"), {
    packshots: false,
    rack: 24, // меньше 30 — десктопный набор не собрать
    rackDir: path.join(out, "_negative", "rack-short"),
  });
  await makeHeavySeries(path.join(out, "_negative", "rack-heavy"), 30, path.join(PHOTOS, "interior.jpg"));

  console.log("  _negative/whitepoint — кадры-ловушки для закона белой точки");
  await makeWhitePointTraps(path.join(out, "_negative", "whitepoint"), path.join(PHOTOS, "deco-1.jpg"));

  // Служебные ветки: конвейер обязан пройти мимо них, не приняв за артикулы,
  // и СКАЗАТЬ о них вслух. _raw оставляем пустым намеренно: приёмка обязана
  // заметить, что RAW не сдан.
  for (const d of ["_raw", "salons", "models"]) {
    await fs.mkdir(path.join(out, d), { recursive: true });
  }
  await fs.writeFile(path.join(out, "salons", ".keep"), "");

  // Таблица SKU — вход каталога. У «плохого» артикула линза 70 мм: валидатор
  // каталога такую отвергнет, значит и приёмка кадров обязана.
  // Колонка «источник» обязательна: каталог не имеет права солгать о кадре,
  // а эти кадры — чужие каталожные снимки, и так и написано.
  const csv = [
    "артикул,ширина линзы,переносица,длина дужки,общая ширина,высота линзы,материал фронта,материал дужек,цвет,источник,автор",
    "op-pilot-a,52,18,140,138,42,ацетат,ацетат,havana,ПИЛОТ — синтетика из чужого каталожного кадра (Safilo). Публикации не подлежит,—",
    "op-pilot-b,54,17,145,142,40,ацетат,металл,чёрный глянец,ПИЛОТ — синтетика из чужого каталожного кадра (Pierre Cardin). Публикации не подлежит,—",
    "op-pilot-bad,70,18,140,138,42,ацетат,металл,золото,ПИЛОТ — синтетика (Emporio Armani). Публикации не подлежит,—",
  ].join("\n");
  await fs.writeFile(path.join(out, "sku.csv"), csv + "\n", "utf8");

  const n = await verifyWritten();

  const rel = path.relative(ROOT, out);
  console.log(`\nГотово: ${n} файлов записано и пересчитано на диске. Дальше:`);
  console.log(
    `  node scripts/ingest-frames.mjs ${rel} --out public/frames/_pilot ` +
      `--manifest public/frames/_pilot/frames.ingest.json`
  );
  console.log(`  node scripts/build-seq.mjs ${rel}/op-pilot-a/rack --sku op-pilot-a --out public/frames/_pilot`);
  console.log(`  node scripts/ingest-frames.mjs --verify ${rel}/_negative/whitepoint --expect`);
}

main().catch((e) => {
  console.error("ПИЛОТ НЕ СОБРАН:", e.message);
  process.exit(1);
});

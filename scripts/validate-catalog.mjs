/**
 * validate-catalog.mjs — гейт каталога (этап 11, шаг 2).
 *
 * Закон CLAUDE.md, «Витрина» п. 2: падает на битых путях к фото, миллиметрах
 * вне 40–62 / 14–24 / 120–155, дублях id/slug и протухших остатках.
 * Гоняется в `prebuild` — невалидный каталог не доезжает до сборки.
 *
 * ЧТО ПРОВЕРЯЕТСЯ:
 *   1. схема (zod)      — форма данных, мм-санити, ступень ширины ↔ totalWidth;
 *   2. уникальность     — id и slug (дубль slug = две оправы на одном URL);
 *   3. ФАЙЛЫ НА ДИСКЕ   — у `published` каждый кадр из photoSet существует
 *                         в обеих ширинах (1200 и @2x 2400), плюс спин,
 *                         секвенции и GLB, если объявлены;
 *   4. протухшие остатки — «осталось 7» с датой месячной давности это не
 *                         дефицит, а враньё. Живой тизер (`live`) со старой
 *                         `updatedAt` роняет сборку.
 *
 * ⚠️ ГЕЙТ ПРОВЕРЯЕТ САМ СЕБЯ (урок этапа 10, CLAUDE.md «Парящие оправы» п. 2):
 *     node scripts/validate-catalog.mjs --self-check
 * гоняет фикстуры `scripts/fixtures/catalog/*.mjs`, где ИМЯ ФАЙЛА объявляет
 * ожидаемый приговор (`ok-…` / `bad-…`), и роняет прогон при расхождении.
 * Прибор, который только «успешно проходит», однажды пропустил брак, честно
 * рапортуя об успехе. Гейт доказывается ПАДЕНИЕМ, а не успехом.
 *
 *   node scripts/validate-catalog.mjs                 # боевой каталог
 *   node scripts/validate-catalog.mjs --self-check    # самопроверка гейта
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const CATALOG = path.join(ROOT, "src", "content", "frames.ts");
const FIXTURES = path.join(ROOT, "scripts", "fixtures", "catalog");

/**
 * Живое обещание дефицита протухает за две недели. Число, которое некому
 * обновлять, — не дефицит, а враньё (CLAUDE.md, «Витрина» п. 5).
 */
const STALE_DAYS = 14;

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверка одного каталога. Возвращает список ошибок — пустой список значит
 * «годен». Ничего не печатает: печатает вызывающий.
 *
 * @param frames  массив оправ
 * @param schema  zod-схема оправы
 * @param publicDir корень статики (фикстуры подсовывают свой)
 */
async function checkCatalog(frames, schema, publicDir) {
  const errors = [];
  const fail = (id, msg) => errors.push(`${id}: ${msg}`);

  if (!Array.isArray(frames)) {
    return ["каталог не массив — `export const frames: Frame[]`"];
  }

  // 1. Схема.
  for (const [i, frame] of frames.entries()) {
    const parsed = schema.safeParse(frame);
    if (!parsed.success) {
      const who = frame?.id ?? `#${i}`;
      for (const issue of parsed.error.issues) {
        const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
        fail(who, `${issue.message}${where}`);
      }
    }
  }

  // 2. Уникальность. Дубль slug — две оправы на одном URL: одна из них
  //    исчезнет из выдачи молча.
  for (const key of ["id", "slug"]) {
    const seen = new Map();
    for (const frame of frames) {
      const value = frame?.[key];
      if (value === undefined) continue;
      if (seen.has(value)) fail(frame.id ?? "?", `дубль ${key} «${value}» — уже у ${seen.get(value)}`);
      else seen.set(value, frame.id ?? "?");
    }
  }

  // 3. Файлы на диске — только у опубликованного. Черновик кадров ещё не имеет
  //    (это его смысл), и требовать их с него — значит запретить заводить
  //    товар до фотосессии.
  for (const frame of frames) {
    if (frame?.status !== "published" || !frame.id) continue;

    for (const shot of frame.photoSet ?? []) {
      // Лесенка @2x — контракт, а не украшение: без 2400 px лупа ×1,85
      // растянет карточку в кашу (docs/perf-budgets.md).
      for (const suffix of ["", "@2x"]) {
        const rel = `frames/${frame.id}/${shot}${suffix}.jpg`;
        if (!(await exists(path.join(publicDir, rel)))) {
          fail(frame.id, `нет кадра public/${rel} — конвейер его не публиковал`);
        }
      }
    }

    if (frame.spin) {
      for (let i = 1; i <= frame.spin; i++) {
        const rel = `frames/${frame.id}/spin/${String(i).padStart(2, "0")}.jpg`;
        if (!(await exists(path.join(publicDir, rel)))) {
          fail(frame.id, `спин объявлен на ${frame.spin} кадров, нет public/${rel}`);
          break; // одного примера хватит: сыпать 48 строк незачем
        }
      }
    }

    // ⚠️ Раскладка — ТА, ЧТО ПУБЛИКУЕТ `build-seq.mjs`: `seq/<набор>/NN.jpg`
    // + `seq/poster.jpg`. Первая редакция искала `seq-<набор>/01.jpg`, и два
    // канонных скрипта разъехались МОЛЧА — тот же класс, что ширина кадра
    // в этапе 10 (поймал `revizor-vitriny`). Проверяется ВЕСЬ объявленный
    // набор, а не только первый кадр: дыра в середине секвенции проигралась бы
    // рывком, и никто бы не понял почему.
    if (frame.seq) {
      const poster = `frames/${frame.id}/seq/poster.jpg`;
      if (!(await exists(path.join(publicDir, poster)))) {
        fail(frame.id, `секвенция объявлена, нет постера public/${poster}`);
      }
      for (const [set, count] of Object.entries(frame.seq)) {
        for (let i = 1; i <= count; i++) {
          const rel = `frames/${frame.id}/seq/${set}/${String(i).padStart(2, "0")}.jpg`;
          if (!(await exists(path.join(publicDir, rel)))) {
            fail(
              frame.id,
              `секвенция ${set}: объявлено ${count} кадров, нет public/${rel}`,
            );
            break;
          }
        }
      }
    }

    if (frame.asset3d && !(await exists(path.join(publicDir, frame.asset3d.replace(/^\//, ""))))) {
      fail(frame.id, `нет GLB public${frame.asset3d}`);
    }
  }

  // 4. Протухшие остатки.
  for (const frame of frames) {
    const capsule = frame?.capsule;
    if (!capsule?.updatedAt || capsule.teaser !== "live") continue;
    const age = (Date.now() - Date.parse(capsule.updatedAt)) / 86_400_000;
    if (Number.isNaN(age)) continue;
    if (age > STALE_DAYS) {
      fail(
        frame.id,
        `капсула «${capsule.name}»: тизер live, а остаток обновляли ${Math.floor(age)} дн. назад ` +
          `(потолок ${STALE_DAYS}). Обновите число или снимите тизер — несвежий дефицит это враньё`,
      );
    }
  }

  return errors;
}

/**
 * Самопроверка: имя фикстуры объявляет приговор, расхождение роняет прогон.
 * `ok-…` обязана пройти, `bad-…` — обязана упасть. Фикстура, которая падает
 * «не по той причине», прибора не доказывает, поэтому у `bad-…` сверяется ещё
 * и ПОВОД: он объявлен в самой фикстуре (`export const expect = /мм/`).
 */
async function selfCheck(schema) {
  let files;
  try {
    // Только объявленные ловушки: `base.mjs` и прочие помощники — не фикстуры.
    files = (await fs.readdir(FIXTURES)).filter((f) => /^(ok|bad)-.+\.mjs$/.test(f)).sort();
  } catch {
    console.error(`САМОПРОВЕРКА НЕВОЗМОЖНА: нет ${path.relative(ROOT, FIXTURES)}`);
    return 1;
  }
  if (files.length === 0) {
    console.error("САМОПРОВЕРКА НЕВОЗМОЖНА: ни одной фикстуры. Гейт без ловушек — не гейт.");
    return 1;
  }

  console.log("САМОПРОВЕРКА ГЕЙТА КАТАЛОГА (имя фикстуры объявляет приговор)\n");
  let bad = 0;

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(FIXTURES, file)).href);
    const publicDir = mod.publicDir ? path.join(FIXTURES, mod.publicDir) : PUBLIC;
    const errors = await checkCatalog(mod.frames, schema, publicDir);

    const shouldPass = file.startsWith("ok-");
    const passed = errors.length === 0;

    if (passed !== shouldPass) {
      bad++;
      console.log(
        `  [РАСХОЖДЕНИЕ] ${file} — ожидали ${shouldPass ? "«годен»" : "падение"}, ` +
          `получили ${passed ? "«годен»" : "падение"}`,
      );
      for (const e of errors) console.log(`      ${e}`);
      continue;
    }

    // Упала ли по ЗАЯВЛЕННОЙ причине? Иначе фикстура доказывает не тот гейт.
    if (!shouldPass && mod.expect instanceof RegExp) {
      if (!errors.some((e) => mod.expect.test(e))) {
        bad++;
        console.log(`  [НЕ ТОТ ПОВОД] ${file} — упала, но не из-за ${mod.expect}`);
        for (const e of errors) console.log(`      ${e}`);
        continue;
      }
    }

    console.log(
      `  [${shouldPass ? "OK  " : "БРАК"}] ${file}${passed ? "" : ` — ${errors[0]}`}`,
    );
  }

  if (bad > 0) {
    console.error(`\nСАМОПРОВЕРКА ПРОВАЛЕНА: ${bad} из ${files.length}. Гейту верить нельзя.`);
    return 1;
  }
  console.log(`\nСАМОПРОВЕРКА: ${files.length}/${files.length} — каждая ловушка получила свой приговор.`);
  return 0;
}

async function main() {
  // Схема — из TS напрямую: Node 22+ снимает типы сам, поэтому у гейта и у
  // приложения ОДНА схема, а не две расходящиеся копии.
  const { frameSchema } = await import(
    pathToFileURL(path.join(ROOT, "src", "content", "catalog", "schema.ts")).href
  );

  if (process.argv.includes("--self-check")) {
    process.exit(await selfCheck(frameSchema));
  }

  const { frames } = await import(pathToFileURL(CATALOG).href);
  const errors = await checkCatalog(frames, frameSchema, PUBLIC);

  const total = frames.length;
  const published = frames.filter((f) => f.status === "published").length;
  const drafts = frames.filter((f) => f.status === "draft").length;

  if (errors.length > 0) {
    console.error(`КАТАЛОГ НЕ ПРОШЁЛ: ${errors.length} ошиб. (артикулов ${total})\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error("\nСборка остановлена. Каталог — единственный источник товарных данных;");
    console.error("оправа с битым путём или чужими миллиметрами доедет до клиента как правда.");
    process.exit(1);
  }

  if (total === 0) {
    console.log("КАТАЛОГ ПУСТ — схема и гейт готовы, товара ещё нет.");
    console.log("Это честное состояние: артикулы заводятся с полки салона, кадры — со съёмки.");
    process.exit(0);
  }

  console.log(
    `КАТАЛОГ ГОДЕН: ${total} артикул(ов) — ${published} опубликовано, ${drafts} черновик(ов).`,
  );
}

main().catch((e) => {
  console.error("ГЕЙТ УПАЛ САМ (это не приговор каталогу):", e.message);
  process.exit(2);
});

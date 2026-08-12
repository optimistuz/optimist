/**
 * ШОВ ШТОРКИ — ГЕОМЕТРИЧЕСКИЙ КРИТЕРИЙ (offline, без браузера).
 * Кадры снимает `probe-buyer-path.mjs MODE=seam`, здесь только измерение.
 *
 * ⚠️ ПРЕЖНИЙ КРИТЕРИЙ ЭТОГО ЖЕ ПРИБОРА ПРИЗНАН НЕГОДНЫМ (11 августа), и это
 * главное, что нужно знать перед чтением кода. Он мерил ПЕРЕПАД ЯРКОСТИ
 * соседних колонок по разные стороны шва и сравнивал его с «собственной
 * текстурой кадра». Но по разные стороны шва лежат РАЗНЫЕ куски изображения
 * — размытый и резкий, — поэтому мера отвечала про сюжет, а не про склейку:
 * два прогона на ОДНОМ И ТОМ ЖЕ коде дали противоположные вердикты. Итог был
 * записан честно: «стык в движении НЕ ИЗМЕРЕН, а не чист».
 *
 * ЧТО ЗДЕСЬ ВМЕСТО НЕГО — метод, узаконенный CLAUDE.md для любого канваса,
 * подменяющего или продолжающего DOM-слой: ПЕРЕКЛЮЧЕНИЕ СЛОЯ НА ОДНОМ
 * УЧАСТКЕ, а не сравнение двух сторон границы. Прибор берёт ПАРУ кадров
 * в одном положении шторки (канвас виден / канвас `visibility: hidden`),
 * строит РАЗНОСТНУЮ МАСКУ — где канвас вообще что-то изменил — и спрашивает
 * ровно один, геометрический вопрос: СОВПАДАЕТ ЛИ ПРАВЫЙ КРАЙ ЭТОЙ МАСКИ
 * С ПОЛОЖЕНИЕМ РУЧКИ. Ручка читается СО СТРАНИЦЫ и приезжает сайдкаром
 * (`tmp-frames/seam-pairs.json`): жёстко зашитая в прибор рамка уже однажды
 * увела окно замера с кадра.
 *
 * Слой светов, сама ручка и подписи присутствуют в обоих кадрах пары
 * одинаково и сокращаются в разности — измеряется ровно вклад канваса.
 *
 * ТРИ ИСХОДА, и третий обязателен:
 *  · ✅ ГОДЕН — край маски совпал с ручкой в пределах допуска;
 *  · ❌ БРАК — не совпал: канвас рисует не там, где обещает ползунок;
 *  · ⚖️ СУДИТЬ НЕЧЕМ — явление не попало в диапазон замера. Два случая:
 *    маска пуста или почти пуста (эффект слаб — сравнивать было бы шум
 *    с шумом), и шов на самом краю кадра (на упоре −6 дптр стыка двух
 *    сторон не существует ФИЗИЧЕСКИ). Закон CLAUDE.md прямой: критерий,
 *    сравнивающий явление с фоном, обязан сперва доказать, что явление
 *    вообще попало в диапазон.
 *
 * ⚠️ ГЕЙТ ДОКАЗЫВАЕТСЯ ПАДЕНИЕМ. В сайдкаре обязана быть пара `neg-…`
 * с принудительно сдвинутой обрезкой: прибор, не поймавший заведомый сдвиг
 * на 3 CSS px, «проходит» на любом коде. Отсутствие такой пары — провал
 * прогона, а не повод для вердикта.
 *
 * Запуск:  node scripts/probe-buyer-path.mjs   (MODE=seam)
 *          node scripts/probe-seam.mjs
 */
import fs from "node:fs";
import sharp from "sharp";

const SIDECAR = process.env.SIDECAR || "tmp-frames/seam-pairs.json";
/** Допуск совпадения края маски с ручкой, CSS px: 1 px линии ручки +
    сглаживание кромки обрезки. Меньше — ловили бы округление, больше —
    пропустили бы сдвиг, который прибор обязан видеть. */
const TOL_CSS = 2;
/** Доля ширины кадра, ниже которой маска считается не состоявшейся. */
const MIN_MASK_FRAC = 0.05;

if (!fs.existsSync(SIDECAR)) {
  console.error(
    `❌ ПРОГОН УПАЛ: нет сайдкара ${SIDECAR}. Сначала снять пары:\n` +
      `   MODE=seam node scripts/probe-buyer-path.mjs`
  );
  process.exit(1);
}
const pairs = JSON.parse(fs.readFileSync(SIDECAR, "utf8"));

/** Средняя по строкам |A − B| для каждой физической колонки полосы. */
async function diffColumns(fileOn, fileOff, rect, dsf) {
  const [A, B] = await Promise.all(
    [fileOn, fileOff].map((f) => sharp(f).raw().toBuffer({ resolveWithObject: true }))
  );
  if (A.info.width !== B.info.width || A.info.height !== B.info.height)
    throw new Error(`кадры пары разного размера: ${A.info.width}×${A.info.height} против ${B.info.width}×${B.info.height}`);
  const { width, height, channels } = A.info;
  const x0 = Math.max(0, Math.round(rect.l * dsf));
  const x1 = Math.min(width, Math.round((rect.l + rect.w) * dsf));
  // Полосы обходят круглую кнопку ручки (центр кадра ±22 CSS px): она
  // одинакова в обоих кадрах, но её сглаженная кромка добавляет шум.
  const bands = [
    [Math.round((rect.t + rect.h * 0.08) * dsf), Math.round((rect.t + rect.h * 0.32) * dsf)],
    [Math.round((rect.t + rect.h * 0.68) * dsf), Math.round((rect.t + rect.h * 0.92) * dsf)],
  ].map(([a, b]) => [Math.max(0, a), Math.min(height, b)]);
  const cols = [];
  for (let x = x0; x < x1; x += 1) {
    let s = 0;
    let n = 0;
    for (const [ya, yb] of bands) {
      for (let y = ya; y < yb; y += 1) {
        const i = (y * width + x) * channels;
        s += Math.abs(A.data[i] - B.data[i]);
        s += Math.abs(A.data[i + 1] - B.data[i + 1]);
        s += Math.abs(A.data[i + 2] - B.data[i + 2]);
        n += 3;
      }
    }
    cols.push({ x, d: n ? s / n : 0 });
  }
  return { cols, x0, x1 };
}

let bad = 0;
let judged = 0;
let negSeen = 0;
let negCaught = 0;

for (const p of pairs) {
  const { rect, dsf } = p;
  const seamCss = rect.l + (rect.w * p.leftPct) / 100;
  const insideBy = Math.min(seamCss - rect.l, rect.l + rect.w - seamCss);
  const isNeg = /^neg/.test(p.label);
  if (isNeg) negSeen += 1;

  if (insideBy < 6) {
    console.log(
      `⚖️  ${p.label} (ручка ${p.leftPct.toFixed(1)} %): СУДИТЬ НЕЧЕМ — шов на кромке кадра ` +
        `(${insideBy.toFixed(1)} CSS px до края), стыка двух сторон в кадре не существует`
    );
    continue;
  }

  const { cols, x0, x1 } = await diffColumns(p.on, p.off, rect, dsf);
  /* ⚠️ ОПОРНЫЙ ШУМ БЕРЁТСЯ ПРАВЕЕ САМОГО ШВА, А НЕ В ФИКСИРОВАННОЙ ДОЛЕ
     КАДРА. Первая редакция брала правую пятую часть — и при ручке на 83 %
     канвас заходил в эту самую полосу: «шум» вырастал до 7,9, порог — до
     31,8, маска обнулялась, и прибор объявлял «СУДИТЬ НЕЧЕМ» на исправном
     положении. Опора, в которую попадает измеряемое явление, — не опора.
     Запас 4 CSS px правее шва оставлен нарочно: он позволяет шуму остаться
     чистым при сдвиге обрезки, который прибор обязан ловить. */
  const noiseFromCss = Math.max(seamCss + 4, rect.l + rect.w * 0.9);
  const noiseToCss = rect.l + rect.w - 2;
  if (noiseToCss - noiseFromCss < 8) {
    console.log(
      `⚖️  ${p.label} (ручка ${p.leftPct.toFixed(1)} %): СУДИТЬ НЕЧЕМ — правее шва не остаётся ` +
        `полосы для опорного шума (${(noiseToCss - noiseFromCss).toFixed(1)} CSS px). ` +
        `Порог пришлось бы брать из области, куда рисует сам канвас`
    );
    continue;
  }
  const tail = cols
    .filter((c) => c.x >= Math.round(noiseFromCss * dsf) && c.x <= Math.round(noiseToCss * dsf))
    .map((c) => c.d)
    .sort((a, b) => a - b);
  const noise = tail.length ? tail[Math.round(tail.length * 0.9)] : 0;
  const thr = Math.max(2, noise * 4);
  const on = cols.filter((c) => c.d > thr);
  const frac = on.length / cols.length;

  if (frac < MIN_MASK_FRAC) {
    console.log(
      `⚖️  ${p.label} (ручка ${p.leftPct.toFixed(1)} %): СУДИТЬ НЕЧЕМ — канвас изменил ` +
        `${(frac * 100).toFixed(1)} % колонок кадра при пороге ${thr.toFixed(1)} ` +
        `(шум ${noise.toFixed(1)}). Эффекта в диапазоне замера нет — сравнивать было бы шум с шумом`
    );
    continue;
  }

  /* Край маски — конец ПЕРВОГО непрерывного участка от левой кромки кадра:
     канвас закрывает сплошную левую часть, и «последняя колонка выше порога»
     по всему кадру поймала бы одинокий выброс где угодно правее шва. */
  let edge = null;
  let started = false;
  let holeRun = 0;
  const HOLE_MAX = Math.round(2 * dsf); // разрыв в 2 CSS px — сглаживание, не конец маски
  for (const c of cols) {
    if (c.d > thr) {
      started = true;
      edge = c.x;
      holeRun = 0;
    } else if (started) {
      holeRun += 1;
      if (holeRun > HOLE_MAX) break;
    }
  }
  const edgeCss = (edge + 1) / dsf;
  const delta = edgeCss - seamCss;
  judged += 1;
  const ok = Math.abs(delta) <= TOL_CSS;
  const expected = p.expectShiftCss || 0;

  if (isNeg) {
    // У отрицательного контроля «годен» — это ПРОВАЛ ПРИБОРА.
    const caught = Math.abs(delta) > TOL_CSS;
    if (caught) negCaught += 1;
    console.log(
      `${caught ? "✅" : "❌"} ${p.label}: край маски ${edgeCss.toFixed(2)} CSS px, ручка ` +
        `${seamCss.toFixed(2)} → расхождение ${delta.toFixed(2)} px ` +
        `(вносили ${expected} px). ${
          caught
            ? "заведомый сдвиг ПОЙМАН — критерий видит смещение обрезки"
            : "заведомый сдвиг НЕ пойман — критерий слеп, вердикты остальных пар недействительны"
        }`
    );
    continue;
  }

  if (!ok) bad += 1;
  console.log(
    `${ok ? "✅" : "❌"} ${p.label} (valuenow ${p.valuenow}, ручка ${p.leftPct.toFixed(1)} %): ` +
      `край маски ${edgeCss.toFixed(2)} CSS px против ручки ${seamCss.toFixed(2)} → ` +
      `расхождение ${delta.toFixed(2)} px при допуске ±${TOL_CSS}` +
      `\n     маска ${(frac * 100).toFixed(1)} % ширины кадра, порог ${thr.toFixed(1)}, шум ${noise.toFixed(1)}`
  );
}

console.log("");
if (!negSeen) {
  console.error(
    "❌ ПРОГОН УПАЛ: в сайдкаре нет отрицательного контроля (пары `neg-…` со сдвинутой " +
      "обрезкой). Прибор, который только проходит, однажды уже пропускал брак"
  );
  process.exit(1);
}
if (negCaught < negSeen) {
  console.error(
    `❌ ПРОГОН УПАЛ: отрицательный контроль не пойман (${negCaught} из ${negSeen}) — ` +
      "критерий слеп, и «шов чист» этим прогоном НЕ доказано"
  );
  process.exit(1);
}
if (!judged) {
  console.error(
    "❌ ПРОГОН УПАЛ: судить было нечего ни в одной паре — это «не измерено», а не «чисто»"
  );
  process.exit(1);
}
console.log(
  bad
    ? `❌ шов разъехался с ручкой в ${bad} из ${judged} судимых положений`
    : `✅ шов совпадает с ручкой во всех ${judged} судимых положениях ` +
        `(отрицательный контроль пойман ${negCaught}/${negSeen})`
);
process.exitCode = bad ? 1 : 0;

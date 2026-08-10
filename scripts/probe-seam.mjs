/**
 * СТЫК ШТОРКИ — разбор уже снятых кадров приёмки (offline, без браузера).
 * Прибор `priyomshchik`, введён шагом 7 этапа 6; кадры снимает
 * `probe-buyer-path.mjs`, здесь только измерение.
 *
 * ⚠️ В РЕПОЗИТОРИИ, а не в `tmp-frames/` (та папка в `.gitignore`), потому что
 * «стык шторки пиксельно чист в покое и в движении» — ПОСТОЯННЫЙ пункт приёмки
 * симулятора, и мера этой чистоты обязана быть перезапускаемой. ⚠️ Кадры
 * и рамка `RECT` ниже привязаны к стенду A54 390×844 @2,625 — меняешь стенд,
 * меняй рамку, иначе окно замера уедет с кадра (ровно этим прибор и врал).
 *
 * ⚠️ ПЕРВЫЙ ЗАХОД ЭТОГО ПРИБОРА СОВРАЛ, И ВОТ ПОЧЕМУ (закон CLAUDE.md:
 * критерий обязан доказать, что явление вообще попало в окно замера):
 *  · на −6 дптр шва НЕТ ВОВСЕ — шторка на правом краю кадра, и «ступенька
 *    120» была границей КАДРА и фона страницы. Это исход «СУДИТЬ НЕЧЕМ»,
 *    а не провал: положение шва проверяется на попадание внутрь кадра;
 *  · окно захватывало КРУГЛУЮ РУЧКУ (40×40 CSS px в центре кадра) — она
 *    белая, и её кромка давала «ступеньку 20,9» на исправном шве. Полосы
 *    замера теперь обходят ручку по вертикали.
 * Мера ступеньки — против СОБСТВЕННОГО ФОНА кадра: максимальный перепад
 * соседних колонок вдали от шва (текстура листвы сама по себе рвётся
 * сильнее любого артефакта склейки).
 */
import sharp from "sharp";

const DSF = 2.625;
const RECT = { l: 24, t: 150, w: 342, h: 257 }; // контейнер кадра, CSS px
const CASES = [
  { file: "tmp-frames/priem7-far-d1.png", label: "покой −1 дптр", leftPct: 16.6667 },
  { file: "tmp-frames/priem7-far-d3.png", label: "покой −3 дптр", leftPct: 50 },
  { file: "tmp-frames/priem7-mid-drag-to-6.png", label: "В ДВИЖЕНИИ (палец на стекле, −4,5)", leftPct: 78.3626 },
  { file: "tmp-frames/priem7-far-d6.png", label: "покой −6 дптр", leftPct: 100 },
];

const px = (raw, info, x, y) => {
  const i = (y * info.width + x) * info.channels;
  return 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
};
/** Средняя яркость колонки x по ДВУМ полосам, обходящим круглую ручку. */
function colMean(raw, info, x, bands) {
  let s = 0, n = 0;
  for (const [y0, y1] of bands) {
    for (let y = y0; y < y1; y++) { s += px(raw, info, x, y); n++; }
  }
  return s / n;
}
function maxAdjJump(raw, info, xFrom, xTo, bands) {
  let prev = null, max = 0, at = 0;
  for (let x = xFrom; x <= xTo; x++) {
    const m = colMean(raw, info, x, bands);
    if (prev !== null && Math.abs(m - prev) > max) { max = Math.abs(m - prev); at = x; }
    prev = m;
  }
  return { max, at };
}

let bad = 0;
for (const c of CASES) {
  const { data: raw, info } = await sharp(c.file).raw().toBuffer({ resolveWithObject: true });
  const seamCss = RECT.l + (RECT.w * c.leftPct) / 100;
  const insideBy = Math.min(seamCss - RECT.l, RECT.l + RECT.w - seamCss); // CSS px до края кадра
  // Полосы, обходящие ручку (центр ±22 CSS px) и кромки кадра
  const bands = [
    [Math.round((RECT.t + RECT.h * 0.08) * DSF), Math.round((RECT.t + RECT.h * 0.32) * DSF)],
    [Math.round((RECT.t + RECT.h * 0.68) * DSF), Math.round((RECT.t + RECT.h * 0.92) * DSF)],
  ];
  if (insideBy < 8) {
    console.log(`⚖️  ${c.label}: СУДИТЬ НЕЧЕМ — шов на самом краю кадра (${insideBy.toFixed(1)} CSS px до кромки), стыка двух сторон в кадре не существует`);
    continue;
  }
  const xс = Math.round(seamCss * DSF);
  const skip = Math.round(3.5 * DSF); // ручка-линия 1 CSS px + сглаживание
  const L = maxAdjJump(raw, info, xс - Math.round(14 * DSF), xс - skip, bands);
  const R = maxAdjJump(raw, info, xс + skip, xс + Math.round(14 * DSF), bands);
  // Фон сравнения — текстура самого кадра вдали от шва, обе половины
  const bgL = maxAdjJump(raw, info, Math.round((RECT.l + 10) * DSF), Math.round((seamCss - 20) * DSF), bands);
  const bgR = maxAdjJump(raw, info, Math.round((seamCss + 20) * DSF), Math.round((RECT.l + RECT.w - 10) * DSF), bands);
  const base = Math.max(bgL.max, bgR.max);
  const worst = Math.max(L.max, R.max);
  const limit = Math.max(base, 6);
  const ok = worst <= limit;
  if (!ok) bad++;
  console.log(
    `${ok ? "✅" : "❌"} ${c.label}: у шва макс перепад соседних колонок ${worst.toFixed(2)} ` +
    `(слева ${L.max.toFixed(2)}, справа ${R.max.toFixed(2)}); собственная текстура кадра вдали от шва ${base.toFixed(2)} → порог ${limit.toFixed(2)}`
  );
  // Средние по 8 колонкам вплотную к шву с двух сторон — есть ли «полка»
  const near = (from, to) => {
    let s = 0, n = 0;
    for (let x = from; x <= to; x++) { s += colMean(raw, info, x, bands); n++; }
    return s / n;
  };
  console.log(
    `     яркость вплотную: слева ${near(xс - Math.round(11 * DSF), xс - skip).toFixed(1)}  ` +
    `справа ${near(xс + skip, xс + Math.round(11 * DSF)).toFixed(1)}  (разница сюжета, не артефакт)`
  );
}
console.log(bad ? `\n❌ провалов: ${bad}` : "\n✅ стык чист во всех судимых случаях");
process.exitCode = bad ? 1 : 0;

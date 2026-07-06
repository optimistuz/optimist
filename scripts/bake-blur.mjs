/**
 * bake-blur.mjs — запекание расфокуса и светов в статические ассеты (sharp).
 *
 * Закон движка №2 (CLAUDE.md): тяжёлый blur НЕ живёт в CSS. Статичный
 * расфокус запекается здесь, на билд-машине, один раз; живой большой blur —
 * dual-Kawase на канвасе. Этот скрипт — «билд-машина» для статики.
 *
 * Экспортируемая функция «файл→файл»: bake(mode, src, dst, opts) → путь(и).
 * Её переиспользуют будущие конвейеры ассетов (ingest-frames, build-seq).
 *
 * Режимы CLI:
 *   node scripts/bake-blur.mjs blur       <src> [dst]      гауссов расфокус (DOF-плита)
 *   node scripts/bake-blur.mjs highlights <src> [dst]      слой светов для mix-blend:screen (этап 6)
 *   node scripts/bake-blur.mjs steps      <src> [dstDir]   3 ступени тизера дропа −6→−3→0 (этап 9/17)
 *
 * Примеры:
 *   node scripts/bake-blur.mjs blur public/photos/interior.jpg
 *     → public/photos/interior-blur.jpg
 *
 * ВАЖНО: запускается ВРУЧНУЮ. НЕ включать в `next build` (сборка остаётся лёгкой).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Дефолты — эстетические потолки, не перф-гейты (см. CLAUDE.md «Бюджеты blur»).
const DEFAULTS = {
  blurSigma: 24, // сильный расфокус фона (глубина резкости), «~24–28px» из plan.md
  highlightSigma: 40, // разлив светов под screen
  highlightThreshold: 0.78, // порог яркости 0..1: что считаем «светами»
  stepSigmas: [24, 10, 0], // ступени тизера: −6 дптр (муть) → −3 → 0 (резко)
  quality: 70, // размытые кадры отлично жмутся — маленький вес
  highlightQuality: 80,
};

/** Вставить суффикс перед расширением: interior.jpg + "-blur" → interior-blur.jpg */
function withSuffix(src, suffix, ext) {
  const dir = path.dirname(src);
  const base = path.basename(src, path.extname(src));
  return path.join(dir, `${base}${suffix}${ext ?? ".jpg"}`);
}

/** Гауссов расфокус: src → dst (тот же размер, jpeg). */
export async function bakeBlur(src, dst, opts = {}) {
  const sigma = opts.sigma ?? DEFAULTS.blurSigma;
  const quality = opts.quality ?? DEFAULTS.quality;
  const out = dst || withSuffix(src, "-blur");
  await sharp(src).blur(sigma).jpeg({ quality, mozjpeg: true }).toFile(out);
  return out;
}

/**
 * Слой светов на чёрном фоне для mix-blend-mode: screen.
 * Пиксели темнее порога → чёрные; ярче — сохраняют цвет; затем разлив blur.
 * Чёрный под screen = прозрачный, поэтому подложка именно чёрная.
 */
export async function bakeHighlights(src, dst, opts = {}) {
  const threshold = (opts.threshold ?? DEFAULTS.highlightThreshold) * 255;
  const sigma = opts.sigma ?? DEFAULTS.highlightSigma;
  const quality = opts.quality ?? DEFAULTS.highlightQuality;
  const out = dst || withSuffix(src, "-highlights");

  const { data, info } = await sharp(src)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels; // 3 после removeAlpha
  for (let i = 0; i < data.length; i += ch) {
    // Яркость по Rec.709
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum < threshold) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .blur(sigma)
    .jpeg({ quality, mozjpeg: true })
    .toFile(out);
  return out;
}

/**
 * Три запечённые ступени расфокуса одного кадра — сырьё тизера дропа
 * (наведение из мути в резкость −6 → −3 → 0). Возвращает массив путей.
 * dstDir по умолчанию — папка исходника; имена <base>-step0/1/2.jpg.
 */
export async function bakeSteps(src, dstDir, opts = {}) {
  const sigmas = opts.sigmas ?? DEFAULTS.stepSigmas;
  const quality = opts.quality ?? DEFAULTS.quality;
  const dir = dstDir || path.dirname(src);
  const base = path.basename(src, path.extname(src));
  const outs = [];
  for (let i = 0; i < sigmas.length; i++) {
    const out = path.join(dir, `${base}-step${i}.jpg`);
    const pipe = sharp(src);
    if (sigmas[i] > 0) pipe.blur(sigmas[i]);
    await pipe.jpeg({ quality, mozjpeg: true }).toFile(out);
    outs.push(out);
  }
  return outs;
}

/** Единая точка входа «файл→файл» для импорта из других конвейеров. */
export async function bake(mode, src, dst, opts = {}) {
  switch (mode) {
    case "blur":
      return bakeBlur(src, dst, opts);
    case "highlights":
      return bakeHighlights(src, dst, opts);
    case "steps":
      return bakeSteps(src, dst, opts);
    default:
      throw new Error(`Неизвестный режим: ${mode} (blur | highlights | steps)`);
  }
}

// --- CLI (только при прямом запуске, не при импорте) ---
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const [, , mode, src, dst] = process.argv;
  if (!mode || !src) {
    console.error(
      "Использование:\n" +
        "  node scripts/bake-blur.mjs blur       <src> [dst]\n" +
        "  node scripts/bake-blur.mjs highlights <src> [dst]\n" +
        "  node scripts/bake-blur.mjs steps      <src> [dstDir]"
    );
    process.exit(1);
  }
  bake(mode, src, dst)
    .then((res) => {
      const list = Array.isArray(res) ? res : [res];
      console.log("Запечено:");
      for (const p of list) console.log("  " + p);
    })
    .catch((e) => {
      console.error("BAKE УПАЛ:", e.message);
      process.exit(1);
    });
}

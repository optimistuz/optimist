/**
 * canon.mjs — чтение бюджетов из `docs/perf-budgets.md`.
 *
 * Замысел: числа бюджетов живут в ОДНОМ месте — в реестре-законе, а не в коде.
 * Скрипт, который «знает» потолок сам, рано или поздно разойдётся с документом,
 * и разойдётся молча.
 *
 * ПОЧЕМУ ЭТО НЕ ПРОСТО РЕГЭКСП ПО ФАЙЛУ. Первая версия сканировала документ
 * целиком и брала последнее совпадение. Хронометрист вскрыл два тихих отказа:
 *
 *  1. Реестр РАСТЁТ («пополняется КАЖДЫМ новым маршрутом»). Дописанная ниже
 *     таблица — хоть «архивная», хоть «было/стало» — молча угоняла гейт:
 *     скрипт брал из неё 40 кадров по 200 КБ и рапортовал успех.
 *  2. Опечатка «450 КБ» вместо «45» проходила зелёной и поднимала бюджет PDP
 *     в десять раз.
 *
 * Поэтому здесь: (а) парсим ТОЛЬКО свой раздел, от заголовка до следующего;
 * (б) требуем ровно одно совпадение на строку — два одинаковых ключа
 * останавливают сборку; (в) проверяем числа на правдоподобие; (г) сверяем
 * зависимые числа между собой. Любая неоднозначность — СТОП, никогда «дефолт».
 */
import fs from "node:fs/promises";
import path from "node:path";

/** Вырезать раздел документа: от заголовка до следующего заголовка того же/выше уровня. */
function section(md, heading) {
  const i = md.indexOf(heading);
  if (i < 0) {
    throw new Error(
      `в docs/perf-budgets.md нет раздела «${heading}». Бюджет — закон; ` +
        `собирать по памяти скрипт не станет.`
    );
  }
  const rest = md.slice(i + heading.length);
  const j = rest.search(/\n#{2,3}\s/);
  return j < 0 ? rest : rest.slice(0, j);
}

/** Ровно одно совпадение — иначе непонятно, какое число закон. */
function only(matches, what) {
  if (matches.length === 0) throw new Error(`не нашёл ${what} в реестре бюджетов.`);
  if (matches.length > 1) {
    throw new Error(
      `${what}: в разделе ${matches.length} совпадений. Какое из них закон — ` +
        `скрипт решать не вправе. Оставьте одно.`
    );
  }
  return matches[0];
}

function sane(value, [lo, hi], what) {
  if (!Number.isFinite(value) || value < lo || value > hi) {
    throw new Error(
      `${what} = ${value} — вне правдоподобных границ ${lo}–${hi}. ` +
        `Похоже на опечатку в docs/perf-budgets.md. Гейт с таким числом бессмыслен.`
    );
  }
  return value;
}

const num = (s) => Number(String(s).replace(",", "."));

/** Бюджеты секвенций rack-focus (гейт build-seq.mjs). */
export async function readSeqBudgets(root) {
  const md = await fs.readFile(path.join(root, "docs", "perf-budgets.md"), "utf8");
  const sec = section(md, "### Секвенции rack-focus");

  const budgets = {};
  for (const platform of ["mobile", "desktop"]) {
    const re = new RegExp(
      `^\\|\\s*${platform}\\s*\\|\\s*\\**\\s*(\\d+)\\s*\\**\\s*\\|[^|\\d]*(\\d+)\\s*КБ`,
      "gim"
    );
    const hits = [...sec.matchAll(re)];
    const m = only(hits, `строка «${platform}» таблицы секвенций`);
    budgets[platform] = {
      frames: sane(Number(m[1]), [12, 60], `${platform}: кадров`),
      capKb: sane(Number(m[2]), [10, 150], `${platform}: потолок кадра, КБ`),
    };
  }

  // Ширина кадра — КОНТРАКТ, а не потолок: серия обязана до неё дотягивать.
  const widths = only(
    [...sec.matchAll(/Ширина кадра:\s*mobile\s*\**\s*(\d+)\s*px\**.*?desktop\s*\**\s*(\d+)\s*px/gis)],
    "строка «Ширина кадра»"
  );
  budgets.mobile.width = sane(Number(widths[1]), [480, 2000], "mobile: ширина кадра");
  budgets.desktop.width = sane(Number(widths[2]), [800, 3000], "desktop: ширина кадра");

  // Потолок набора парсится НЕЗАВИСИМО — но рабочим потолком служит ПРОИЗВЕДЕНИЕ
  // столбцов, а не округлённое число из документа. Иначе набор из 24 кадров,
  // каждый из которых легален (45 КБ), весит 1080 КБ и получает ложный СТОП
  // от «1,05 МБ» = 1075 КБ. Округление здесь — сторож опечатки, не закон.
  const totals = only(
    [...sec.matchAll(/Набор целиком:\s*mobile\s*\**\s*≤\s*([\d,.]+)\s*МБ.*?desktop\s*\**\s*≤\s*([\d,.]+)\s*МБ/gis)],
    "строка «Набор целиком»"
  );
  for (const [i, platform] of ["mobile", "desktop"].entries()) {
    const stated = sane(num(totals[i + 1]), [0.2, 10], `${platform}: потолок набора, МБ`);
    const derivedKb = budgets[platform].frames * budgets[platform].capKb;
    if (Math.abs(stated - derivedKb / 1024) > 0.02) {
      throw new Error(
        `${platform}: «Набор целиком» обещает ${stated} МБ, а таблица даёт ` +
          `${budgets[platform].frames}×${budgets[platform].capKb} КБ = ${(derivedKb / 1024).toFixed(2)} МБ. ` +
          `Реестр противоречит сам себе — почините docs/perf-budgets.md.`
      );
    }
    budgets[platform].totalCapKb = derivedKb;
  }

  const poster = only(
    [...sec.matchAll(/Постер секвенции:\s*\**\s*(\d+)\s*px\**\s*,\s*\**\s*≤\s*(\d+)\s*КБ/gi)],
    "строка «Постер секвенции»"
  );
  budgets.poster = {
    width: sane(Number(poster[1]), [480, 2400], "постер: ширина"),
    capKb: sane(Number(poster[2]), [20, 300], "постер: потолок, КБ"),
  };

  return budgets;
}

/**
 * Бюджеты packshot и спина (гейт ingest-frames.mjs).
 *
 * Рамки правдоподобия — СВОИ на каждый ассет. Общая рамка [20, 800] пропускала
 * опечатку «спин ≤ 700 КБ» как валидное число: 48 × 700 = 32,8 МБ спина, и
 * возразить было нечему. У ролей, различающихся вчетверо, не может быть одной
 * рамки.
 */
const ASSET_LIMITS = {
  packshot: { width: [900, 1600], capKb: [40, 300] },
  packshot2x: { width: [1800, 3200], capKb: [100, 800] },
  macro: { width: [900, 1600], capKb: [40, 400] },
  macro2x: { width: [1800, 3200], capKb: [100, 900] },
  spin: { width: [600, 1600], capKb: [20, 150] },
};

const SPIN_FRAMES = 48; // docs/photo-brief.md §4 — «ровно 48»

export async function readAssetBudgets(root) {
  const md = await fs.readFile(path.join(root, "docs", "perf-budgets.md"), "utf8");
  const sec = section(md, "### Packshot и спин");

  const assets = {};
  for (const [key, limits] of Object.entries(ASSET_LIMITS)) {
    const re = new RegExp(
      `^\\|\\s*${key}\\s*\\|\\s*\\**\\s*(\\d+)\\s*\\**\\s*\\|[^|\\d]*(\\d+)\\s*КБ`,
      "gim"
    );
    const m = only([...sec.matchAll(re)], `строка «${key}» таблицы ассетов`);
    assets[key] = {
      width: sane(Number(m[1]), limits.width, `${key}: ширина`),
      capKb: sane(Number(m[2]), limits.capKb, `${key}: потолок, КБ`),
    };
  }

  // У спина нет потолка набора в коде — значит он должен быть в реестре,
  // иначе опечатку в потолке кадра ловить нечем.
  const spinTotal = only(
    [...sec.matchAll(/Спин целиком:\s*\**\s*≤\s*([\d,.]+)\s*МБ/gi)],
    "строка «Спин целиком»"
  );
  const stated = sane(num(spinTotal[1]), [0.5, 8], "спин: потолок набора, МБ");
  const derived = (SPIN_FRAMES * assets.spin.capKb) / 1024;
  if (Math.abs(stated - derived) > 0.05) {
    throw new Error(
      `спин: «Спин целиком» обещает ${stated} МБ, а таблица даёт ` +
        `${SPIN_FRAMES}×${assets.spin.capKb} КБ = ${derived.toFixed(2)} МБ. ` +
        `Реестр противоречит сам себе — почините docs/perf-budgets.md.`
    );
  }

  return assets;
}

/**
 * check-bundle.mjs — предохранитель критического пути (этап 11).
 *
 * Гоняется в `postbuild`: смотрит на СОБРАННЫЕ чанки `.next/static`, а не на
 * исходники. Правило, которое проверяет только человек, — не правило, а надежда.
 *
 * ЧТО СТЕРЕЖЁТ:
 *
 * 1. **zod в клиенте.** Схема каталога (`catalog/schema.ts`) тянет zod, и он
 *    обязан жить ТОЛЬКО в сборке и на сервере. Изоляция держится на двух
 *    ниточках: `import type` в `frames.ts` и отсутствие value-импорта схемы
 *    в модулях с `"use client"`. Обе рвутся одной строчкой невнимательности.
 *    Цена срыва ЗАМЕРЕНА хронометристом: **+16,3 КБ gz** — втрое больше всего
 *    бюджета критического пути (5 КБ). Витрина импортирует помощники из
 *    `catalog/frame.ts` (без zod), тип — типовым импортом.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ СТЕРЕЖЁТ (и почему — читать до того, как «дописать сюда»).
 *
 * Здесь стояло обещание стеречь **роутер `next/link`**. Обещание было ЛОЖНЫМ:
 * в `GUARDS` его никогда не было, шапка объявляла защиту, которой нет. Этап 8
 * закрыл долг — но ДРУГИМ прибором, и это осознанное решение, а не лень.
 *
 * Почему не грепом. Маркер обязан пережить минификацию; у `next/link` таких
 * маркеров нет — имена манглируются, а строки его сообщений живут в dev-ветке
 * и в прод-чанк не попадают. Греп по манглированному имени даёт ПУСТО и когда
 * код есть, и когда его нет: такой «страж» доказал бы что угодно. Прецедент
 * записан в реестре — поиск по `nextAlloc` вёл себя ровно так.
 *
 * Чем закрыто. `weigh-route.mjs` (в том же `postbuild`) судит вход маршрута
 * БАЙТАМИ, включая слепое пятно — входы `/layout` и `/template`, куда роутер
 * и приезжает. Замер 14 августа: `next-view-transitions` дал по методу
 * реестра −4 Б, а на деле привёз чанк роутера **9 205 Б** мимо набора
 * страницы. Байтовый сторож ловит это и всё прочее той же природы; греп
 * не поймал бы ничего. Гейт, который нельзя заставить упасть, — не гейт.
 *
 *   node scripts/check-bundle.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = path.join(ROOT, ".next", "static");

/**
 * Маркеры библиотек в собранном коде. Ищем то, что переживает минификацию:
 * строки сообщений и имена свойств, а не имена переменных.
 */
const GUARDS = [
  {
    name: "zod",
    // Сообщения и служебные поля zod остаются строками после минификации.
    markers: ["invalid_union", "ZodError", "$ZodType", "too_big"],
    why:
      "zod уехал в клиентский бандл (+16,3 КБ gz — втрое больше всего бюджета «/»).\n" +
      "  Почти наверняка: value-импорт из `content/catalog/schema.ts` в компонент.\n" +
      "  Витрина берёт помощники из `content/catalog/frame.ts` (без zod),\n" +
      "  а тип `Frame` — ТИПОВЫМ импортом (`import type`), он стирается при сборке.",
  },
];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const files = await walk(STATIC);

if (files.length === 0) {
  // Прибор обязан МОЛЧАТЬ, когда не может измерить (урок этапа 10), а не
  // рапортовать «чисто» на пустоте: «0 нарушений» из-за отсутствия сборки —
  // это ложное «годен», которое однажды уже прошло.
  console.error("ПРЕДОХРАНИТЕЛЬ НЕ ИЗМЕРИЛ: нет .next/static — сборки не было.");
  console.error("Гейт молчит, а не говорит «чисто»: пустая папка ничего не доказывает.");
  process.exit(2);
}

let bad = 0;

for (const guard of GUARDS) {
  const hits = [];
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    if (guard.markers.some((m) => src.includes(m))) {
      hits.push(path.relative(ROOT, file));
    }
  }
  if (hits.length > 0) {
    bad++;
    console.error(`\nСБОРКА ОСТАНОВЛЕНА: ${guard.why}`);
    console.error(`  Чанки: ${hits.slice(0, 5).join(", ")}${hits.length > 5 ? ` и ещё ${hits.length - 5}` : ""}`);
  }
}

if (bad > 0) process.exit(1);

console.log(`Критический путь чист: zod в клиент не уехал (проверено ${files.length} чанков).`);

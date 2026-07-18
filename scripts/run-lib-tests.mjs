/**
 * Прогон ВСЕХ юнит-тестов чистых функций из `src/lib`.
 *
 * ⚠️ ЗАЧЕМ ОТДЕЛЬНЫЙ БЕГУНОК, а не перечисление файлов в package.json:
 * прибор, знающий один файл, — это прибор, который лжёт. Ровно так уже
 * случалось дважды в этом проекте: `cdp-hydration` ходил по одному маршруту
 * и рапортовал «чисто» по всему сайту, а `face-shape.test.ts` пролежал
 * НЕ ПОДКЛЮЧЁННЫМ НИ К ЧЕМУ — живой тест, о существовании которого не знала
 * ни одна команда. Мёртвый тест хуже отсутствующего: он создаёт иллюзию
 * покрытия. Здесь список берётся с диска, поэтому новый `*.test.ts` попадает
 * в прогон сам, без правки package.json.
 *
 * Каждый файл гоняется ОТДЕЛЬНЫМ процессом: тесты завершаются `process.exit(1)`
 * при провале, и в общем процессе первый же провал скрыл бы остальные.
 */
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, ".tmp-test", "lib");

if (!existsSync(outDir)) {
  console.error(
    `\nНЕТ СКОМПИЛИРОВАННЫХ ТЕСТОВ (${path.relative(root, outDir)}).\n` +
      "Сначала: npx tsc -p tsconfig.test.json\n"
  );
  process.exit(1);
}

const files = readdirSync(outDir)
  .filter((f) => f.endsWith(".test.js"))
  .sort();

if (files.length === 0) {
  // Пустой прогон, отрапортовавший успех, — та же ложь, только тише.
  console.error("\nНИ ОДНОГО ТЕСТА НЕ НАЙДЕНО — это провал, а не успех.\n");
  process.exit(1);
}

console.log(`\nЮнит-тесты lib: файлов ${files.length}\n`);

let failedFiles = 0;
for (const f of files) {
  console.log(`──── ${f} ${"─".repeat(Math.max(0, 46 - f.length))}`);
  const res = spawnSync(
    process.execPath,
    ["-r", path.join(root, "scripts", "lib", "test-alias.cjs"), path.join(outDir, f)],
    { stdio: "inherit" }
  );
  if (res.status !== 0) failedFiles += 1;
}

console.log(
  failedFiles === 0
    ? `\n✓ Все файлы прошли (${files.length}).\n`
    : `\n✗ Провалено файлов: ${failedFiles} из ${files.length}.\n`
);
process.exit(failedFiles === 0 ? 0 : 1);

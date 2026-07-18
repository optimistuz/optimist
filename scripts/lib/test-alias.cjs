/**
 * Резолвер алиаса «@/» для standalone-прогона юнит-тестов.
 *
 * tsc проверяет «@/…» по `paths`, но НЕ переписывает специфик при эмиссии —
 * скомпилированный CommonJS уходит в node с живым «@/content/…» и падает.
 * Бандлера у тестов нет (тест-фреймворк в проект не заводим, CLAUDE.md
 * «Стек»), поэтому алиас разворачивается здесь — в 10 строках, а не правкой
 * импортов в исходниках: относительных межпапочных импортов в src нет
 * ни одного, и заводить их ради теста значит менять код под инструмент.
 *
 * Использование:
 *   npx tsc -p tsconfig.test.json
 *   node -r ./scripts/lib/test-alias.cjs .tmp-test/lib/<имя>.test.js
 */
const path = require("path");
const Module = require("module");

const OUT_DIR = path.resolve(__dirname, "..", "..", ".tmp-test");

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(OUT_DIR, request.slice(2));
  }
  return original.call(this, request, ...rest);
};

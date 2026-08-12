/**
 * САМОПРОВЕРКА ATTACH-РЕЖИМА ПРИБОРОВ (`npm run check:attach`).
 *
 * ⚠️ ЧТО ЭТОТ ГЕЙТ ДОКАЗЫВАЕТ — И ЧЕГО НЕ ДОКАЗЫВАЕТ. Он НЕ доказывает, что
 * прибор доедет до телефона: для этого нужен телефон, кабель и `adb`. Он
 * доказывает ровно две вещи, и обе — про самого прибора:
 *   · путь БЕЗ `spawn` и БЕЗ подмены железа доходит до конца (положительная
 *     ловушка) — иначе полчаса владельца с A54 сгорели бы на отладке;
 *   · на неправильном стенде путь ПАДАЕТ, и падает ЗА ТО, ЗА ЧТО ДОЛЖЕН
 *     (три отрицательные ловушки).
 *
 * Закон проекта: гейты доказываются ПАДЕНИЕМ. Прибор, который только
 * «успешно проходит», однажды уже пропускал брак, честно рапортуя об успехе.
 * Поэтому у каждой `brak-…` ловушки сверяется ещё и ПОВОД падения: гейт,
 * поймавший брак не за то, — это совпадение, а не прибор.
 *
 * СТЕНД: телефон здесь ИЗОБРАЖАЕТ локальный Chrome, поднятый ЭТИМ скриптом
 * (в положительной ловушке — с андроидным `--user-agent`). Прибор об этом
 * не знает: он идёт тем же путём, что пойдёт к A54. Дев-сервер НЕ нужен —
 * цель это локальный файл.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { openStand, sleep, DEVICE_FORBIDDEN } from "./lib/cdp-stand.mjs";

const CHROME =
  process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const A54_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36";

const OUT = "tmp-frames";
const fails = [];
const ok = (good, text) => {
  console.log(`${good ? "✅" : "❌"} ${text}`);
  if (!good) fails.push(text);
};

/** Поднять «телефон»: обычный Chrome с одной вкладкой на локальном файле. */
async function standIn(port, ua) {
  fs.mkdirSync(OUT, { recursive: true });
  const html = `${OUT}/attach-selftest.html`;
  fs.writeFileSync(
    html,
    "<!doctype html><meta charset=utf-8><title>attach-selftest</title>" +
      "<body style=background:#fff>стенд самопроверки attach</body>"
  );
  const profile = `${process.env.TEMP}\\optimist-attach-${port}`;
  fs.rmSync(profile, { recursive: true, force: true });
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      ...(ua ? [`--user-agent=${ua}`] : []),
      "file:///" + fs.realpathSync(html).replace(/\\/g, "/"),
    ],
    { stdio: "ignore" }
  );
  await sleep(2500);
  return child;
}

/** Прогнать путь прибора; вернуть {stand} либо {err}. */
async function probePath(port, needle, extra) {
  process.env.ATTACH = "1";
  try {
    const stand = await openStand({
      port,
      baseUrl: needle,
      die: (m) => {
        throw new Error(m);
      },
    });
    if (extra) await extra(stand);
    return { stand };
  } catch (e) {
    return { err: String(e.message || e) };
  }
}

async function main() {
  console.log("──── САМОПРОВЕРКА ATTACH (4 ловушки; имя объявляет приговор) ────\n");

  /* ── 1. ok-android-attach: андроидный UA → путь проходит целиком ───────── */
  let child = await standIn(9871, A54_UA);
  try {
    const { stand, err } = await probePath(9871, "attach-selftest");
    if (err) {
      ok(false, `ok-android-attach: путь УПАЛ на исправном стенде — «${err.slice(0, 200)}»`);
    } else {
      ok(true, "ok-android-attach: attach к андроидному UA прошёл");
      ok(!stand.spawned, `  прибор НЕ поднимал свой Chrome (spawned = ${stand.spawned})`);
      const applied = await stand.applyStand({ W: 390, H: 844, DSF: 2.625, CPU: 4 });
      ok(
        applied.emulated === false,
        `  applyStand на устройстве НИЧЕГО не навязал (emulated = ${applied.emulated})`
      );
      const bad = stand.forbiddenUsed();
      ok(
        bad.length === 0,
        `  ни одного вызова, врущего про железо, за весь путь (нарушений: ${bad.length}${
          bad.length ? " → " + bad.join(", ") : ""
        })`
      );
      // Журнал вызовов — доказательство, а не обещание: печатаем, чем ходили.
      console.log(`  журнал CDP: ${[...new Set(stand.calls)].join(", ")}`);
      stand.close();
    }
  } finally {
    child.kill();
  }

  /* ── 2. brak-desktop-ua: обычный десктопный Chrome → ОБЯЗАН упасть ─────── */
  child = await standIn(9872, null);
  try {
    const { stand, err } = await probePath(9872, "attach-selftest");
    if (stand) stand.close();
    ok(!!err, "brak-desktop-ua: attach к ДЕСКТОПНОМУ Chrome упал, как и должен");
    ok(
      !!err && /Android/i.test(err),
      `  повод падения ТОТ САМЫЙ (UA без Android): «${(err || "—").split("\n")[0].slice(0, 120)}»`
    );
  } finally {
    child.kill();
  }

  /* ── 3. brak-target-not-found: цели с таким URL нет → ОБЯЗАН упасть ─────
     Это проверка того, что цель ищется ПО URL, а не «первая page»: на
     телефоне вкладок много, и «первая» — чужая страница. */
  child = await standIn(9873, A54_UA);
  try {
    const { stand, err } = await probePath(9873, "http://127.0.0.1:3100/");
    if (stand) stand.close();
    ok(!!err, "brak-target-not-found: вкладки с нужным адресом нет — путь упал");
    ok(
      !!err && /нет ни одной с/.test(err),
      `  повод ТОТ САМЫЙ (цель по URL не найдена), и в тексте есть подсказка про adb reverse: ` +
        `${!!err && /adb reverse/.test(err)}`
    );
  } finally {
    child.kill();
  }

  /* ── 4. brak-forbidden-call: прибор пытается подменить железо → падение ── */
  child = await standIn(9874, A54_UA);
  try {
    const { stand, err } = await probePath(9874, "attach-selftest", async (s) => {
      // Так выглядит прибор, забывший про attach: он навязывает CPU-троттлинг
      // ПОВЕРХ настоящего процессора телефона.
      await s.call("Emulation.setCPUThrottlingRate", { rate: 4 });
    });
    if (stand) stand.close();
    ok(!!err, "brak-forbidden-call: подмена железа на устройстве уронила прогон");
    ok(
      !!err && /врёт про железо/.test(err) && /setCPUThrottlingRate/.test(err),
      `  повод ТОТ САМЫЙ (запрещённый вызов назван): «${(err || "—").slice(0, 120)}»`
    );
  } finally {
    child.kill();
  }

  console.log(
    `\nСписок запрещённого на устройстве (${DEVICE_FORBIDDEN.size}): ` +
      [...DEVICE_FORBIDDEN].join(", ")
  );
  if (fails.length) {
    console.error(`\n❌ САМОПРОВЕРКА ПРОВАЛЕНА: ${fails.length} пункт(ов)`);
    process.exit(1);
  }
  console.log("\n✅ САМОПРОВЕРКА ПРОЙДЕНА: путь attach работает и падает там, где обязан");
}

main().catch((e) => {
  console.error("\n❌ САМОПРОВЕРКА УПАЛА: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});

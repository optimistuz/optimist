/**
 * Ловит hydration-warnings в dev-режиме (они есть только в next dev).
 * Запускает headless Chrome, слушает console (Runtime.consoleAPICalled)
 * и Log, грузит КАЖДЫЙ маршрут в обычном режиме, в reduced-motion и на
 * мобильной ширине. Без зависимостей.
 *
 * Использование:
 *   node scripts/cdp-hydration.mjs [urlBase] [chromePath] [--routes=/,/privacy]
 *
 * ⚠️ Маршруты — АРГУМЕНТ, а не константа. Прибор, который знает только «/»,
 * молча выдаёт «чисто» по всему сайту: новый маршрут он просто не открывает.
 * Каждый этап витрины ОБЯЗАН дописать сюда свои маршруты — иначе гидрация
 * каталога и PDP не проверена никем.
 *
 * Находка = падение (exit 1). Гейт, который только печатает, гейтом не
 * является: его вывод однажды прочитают глазами и пропустят.
 *
 * ⚠️ ПРОГРЕЙ МАРШРУТЫ ПЕРЕД ПРОГОНОМ. `next dev` компилирует маршрут при
 * ПЕРВОМ заходе, и на холодном это дольше здешних 9 с ожидания — прибор
 * честно роняет прогон с «живая разметка: нет», хотя со страницей всё в
 * порядке. Симптом узнаётся по тому, что падает КАЖДЫЙ РАЗ СЛЕДУЮЩИЙ по
 * списку маршрут (предыдущий уже прогрелся прошлым прогоном). Лечится
 * одним обходом до запуска:
 *   foreach ($u in @("/","/collections/optical","/privacy")) {
 *     Invoke-WebRequest -Uri "http://127.0.0.1:3000$u" -UseBasicParsing }
 * Поднимать порог ожидания вместо прогрева НЕ надо: он удлиняет каждый
 * прогон ради одного холодного старта.
 *
 * ⚠️ В Git Bash на Windows аргумент `--routes=/,/privacy` калечит MSYS
 * (подстановка путей): получается «Cannot navigate to invalid URL».
 * Запускай из PowerShell или экранируй аргумент кавычками.
 */
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const flagArgs = args.filter((a) => a.startsWith("--"));
const positional = args.filter((a) => !a.startsWith("--"));

// Порт 3000 — как у cdp-audit.mjs / shot-site.mjs. Разъезд дефолтов давал
// ЛОЖНЫЙ ПАСС: скрипт грузил пустой 3001 и рапортовал «0 предупреждений».
const URL_BASE = positional[0] ?? "http://127.0.0.1:3000";
const CHROME =
  positional[1] ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const routesFlag = flagArgs.find((a) => a.startsWith("--routes="));
const ROUTES = routesFlag
  ? routesFlag
      .slice("--routes=".length)
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)
  : ["/", "/privacy"];
const DEBUG_PORT = 9778;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const key = crypto.randomBytes(16).toString("base64");
    const req = http.request({
      host: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": key,
      },
    });
    req.on("upgrade", (_res, socket) => {
      socket.setNoDelay(true);
      socket.on("error", () => {});
      const listeners = new Set();
      let buf = Buffer.alloc(0);
      let parts = [];
      const send = (text) => {
        const payload = Buffer.from(text, "utf8");
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 0x80 | 126;
          header.writeUInt16BE(payload.length, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x81;
          header[1] = 0x80 | 127;
          header.writeBigUInt64BE(BigInt(payload.length), 2);
        }
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        socket.write(Buffer.concat([header, mask, payload]));
      };
      socket.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          if (buf.length < 2) return;
          const fin = (buf[0] & 0x80) !== 0;
          const opcode = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) {
            if (buf.length < 4) return;
            len = buf.readUInt16BE(2);
            off = 4;
          } else if (len === 127) {
            if (buf.length < 10) return;
            len = Number(buf.readBigUInt64BE(2));
            off = 10;
          }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len);
          buf = buf.subarray(off + len);
          if (opcode === 8) {
            socket.end();
            return;
          }
          parts.push(payload);
          if (fin) {
            const msg = Buffer.concat(parts).toString("utf8");
            parts = [];
            for (const fn of listeners) fn(msg);
          }
        }
      });
      resolve({ send, listeners, socket });
    });
    req.on("error", reject);
    req.end();
  });
}

async function cdpSession(wsUrl) {
  const ws = await wsConnect(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const handlers = new Map();
  ws.listeners.add((raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && handlers.has(msg.method)) {
      for (const fn of handlers.get(msg.method)) fn(msg.params);
    }
  });
  // ⚠️ СМЕРТЬ СОКЕТА ОБЯЗАНА БЫТЬ ОШИБКОЙ, А НЕ ТИШИНОЙ.
  // Без этого висящие `call` никто не отклонял: событийный цикл пустел, и
  // node выходил С КОДОМ 0 И ПУСТЫМ ВЫВОДОМ — прогон «успешно проходил», не
  // проверив ни одного маршрута. Ловилось на конкуренции за отладочный порт
  // (нашёл `fizik`; он же поймал это 4 раза подряд). Прибор, который молчит
  // при поломке, опаснее отсутствующего: его молчание читают как «чисто».
  let dead = false;
  const killPending = (why) => {
    if (dead) return;
    dead = true;
    const err = new Error(`CDP-сессия оборвалась: ${why}`);
    for (const [, p] of pending) p.reject(err);
    pending.clear();
  };
  ws.socket.on("close", () => killPending("сокет закрыт"));
  ws.socket.on("error", (e) => killPending(e?.message || "ошибка сокета"));

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (dead) {
        reject(new Error("CDP-сессия мертва: вызов после обрыва"));
        return;
      }
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const on = (method, fn) => {
    if (!handlers.has(method)) handlers.set(method, new Set());
    handlers.get(method).add(fn);
  };
  return { call, on, close: () => ws.socket.end() };
}

function httpJson(path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: DEBUG_PORT, path }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function launchChrome(flags = []) {
  return spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--user-data-dir=" + process.env.TEMP + "\\optimist-cdp-hydration",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      ...flags,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
}

const HYDRATION_RE =
  /hydrat|did not match|server (?:rendered|html)|Text content does not|tree hydrated|Expected server HTML|Warning: Prop/i;

async function run(label, flags, route) {
  const chrome = launchChrome(flags);
  const messages = [];
  let loaded = false;
  let status = null;
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(300);
      targets = await httpJson("/json/list").catch(() => null);
    }
    const page = targets.find((t) => t.type === "page");
    const cdp = await cdpSession(page.webSocketDebuggerUrl);
    await cdp.call("Runtime.enable");
    await cdp.call("Log.enable");
    await cdp.call("Page.enable");
    await cdp.call("Network.enable");

    // Код ответа ДОКУМЕНТА. Без него прибор врал: страница 404 у Next — это
    // тоже живой <main> с текстом по тому же адресу, и опечатка в маршруте
    // возвращалась «чистой гидрацией» непроверенной страницы.
    let docStatus = null;
    cdp.on("Network.responseReceived", (p) => {
      if (p.type === "Document" && docStatus === null) docStatus = p.response?.status ?? null;
    });

    const record = (text, level) => {
      if (text && HYDRATION_RE.test(text)) messages.push({ level, text: text.slice(0, 300) });
    };
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") {
        const text = (p.args || [])
          .map((a) => a.value ?? a.description ?? "")
          .join(" ");
        record(text, p.type);
      }
    });
    cdp.on("Log.entryAdded", (p) => record(p.entry?.text, p.entry?.level));
    cdp.on("Runtime.exceptionThrown", (p) =>
      record(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text, "exception")
    );

    await cdp.call("Page.navigate", { url: URL_BASE + route });
    await sleep(9000); // dev-компиляция + гидрация

    // Санити: страница ДОЛЖНА быть живой. Иначе «0 предупреждений» — ложный
    // пасс (пустая вкладка / не тот порт / упавший dev), а не чистая гидрация.
    // Сверяем и АДРЕС: молчаливый редирект (404 → not-found) отдал бы чистую
    // чужую страницу за проверенный маршрут.
    const { result } = await cdp.call("Runtime.evaluate", {
      expression: `(() => {
        const alive = !!document.querySelector('main') && document.body.innerText.length > 200;
        const here = location.pathname.replace(/\\/$/, "") === ${JSON.stringify(route)}.replace(/\\/$/, "");
        return alive && here;
      })()`,
      returnByValue: true,
    });
    loaded = result?.value === true;
    status = docStatus;
    cdp.close();
  } finally {
    chrome.kill();
  }
  if (!loaded || status !== 200) {
    throw new Error(
      `[${label}] маршрут ${route} недостоверен: HTTP ${status ?? "—"}, ` +
        `живая разметка: ${loaded ? "да" : "нет"}. ` +
        `Либо 'npm run dev' не слушает ${URL_BASE}, либо такого маршрута нет ` +
        `(страница 404 — тоже живой <main>, и без кода ответа она сходила за «чистую»).`
    );
  }
  return { route, label, status, count: messages.length, messages };
}

async function main() {
  const out = [];
  for (const route of ROUTES) {
    out.push(await run("normal@1440", [], route));
    await sleep(800);
    out.push(await run("reduced-motion@1440", ["--force-prefers-reduced-motion"], route));
    await sleep(800);
    out.push(await run("mobile@390", ["--window-size=390,800"], route));
    await sleep(800);
  }
  console.log(JSON.stringify(out, null, 2));

  // ⚠️ Пустой прогон — ПРОВАЛ, а не успех. Ожидаем ровно три прохода на
  // маршрут (обычный / reduced-motion / мобильный); недобор означает, что
  // часть проверок молча не состоялась, а «чисто» по ним — вымысел.
  const expected = ROUTES.length * 3;
  if (out.length !== expected) {
    console.error(
      `\nПРОГОН НЕПОЛНЫЙ: состоялось ${out.length} проверок из ${expected}. ` +
        `Результату верить нельзя.`
    );
    process.exit(1);
  }

  const dirty = out.filter((r) => r.count > 0);
  if (dirty.length) {
    console.error(
      `\nГИДРАЦИЯ ГРЯЗНАЯ: ${dirty.length} прогон(ов) из ${out.length} — ` +
        dirty.map((r) => `${r.route} [${r.label}]: ${r.count}`).join("; ")
    );
    process.exit(1);
  }
  console.log(
    `\nГИДРАЦИЯ ЧИСТА: ${out.length} прогонов — маршруты ${ROUTES.join(", ")} ` +
      `× (обычный / reduced-motion / мобильный).`
  );
}

main().catch((e) => {
  console.error("ПРОВЕРКА УПАЛА:", e);
  process.exit(1);
});

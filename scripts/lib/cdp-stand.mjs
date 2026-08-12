/**
 * СТЕНД CDP — общий фундамент приборов: ЛОКАЛЬНЫЙ Chrome или ЖИВОЙ ТЕЛЕФОН.
 *
 * ⚠️ ЗАЧЕМ. До сегодняшнего дня каждый прибор поднимал свой Chrome и сам
 * НАВЯЗЫВАЛ ЕМУ ЖЕЛЕЗО: `setDeviceMetricsOverride` (390×844 @2,625),
 * `setTouchEmulationEnabled`, `setCPUThrottlingRate` 4×. На эмуляции это
 * честный стенд. На живом A54 ровно эти три вызова — ВРАНЬЁ ПРО ЖЕЛЕЗО:
 * они переопределяют настоящую плотность телефона выдуманной, подменяют
 * настоящий тач синтетическим и душат настоящий CPU поверх настоящего же.
 * Прибор, сделавший это на устройстве, померил бы гибрид, которого нет
 * в природе, и подписался бы «живой A54».
 *
 * ПОЭТОМУ ГРАНИЦА ПРОВЕДЕНА ЗДЕСЬ, ОДИН РАЗ, ДЛЯ ВСЕХ ПРИБОРОВ:
 *  · `ATTACH=1` → НИКАКОГО `spawn`. Присоединяемся к уже живому браузеру
 *    по `/json/list` на PORT (на телефоне это `adb forward`);
 *  · ЦЕЛЬ ИЩЕТСЯ ПО URL, а не «первая page». На телефоне вкладок много,
 *    и «первая» — это лотерея: прибор молча померил бы чужую страницу;
 *  · на устройстве ЗАПРЕЩЕНЫ вызовы из `DEVICE_FORBIDDEN` — попытка
 *    РОНЯЕТ ПРОГОН, а не оговаривается в отчёте. Разрешены `setEmulatedMedia`
 *    (reduce — это ВЫБОР ПОЛЬЗОВАТЕЛЯ, а не железо) и
 *    `addScriptToEvaluateOnNewDocument` (отказ WebGL — тоже не железо);
 *  · плотность, вьюпорт и экран ЧИТАЮТСЯ С УСТРОЙСТВА и печатаются: у A54
 *    DPR 2,625, а не 2, и от него зависят все числа нормировки цепочки FBO.
 *
 * ПРЕДОХРАНИТЕЛИ (каждый РОНЯЕТ прогон):
 *  1. ПОДЛИННОСТЬ УСТРОЙСТВА. `Browser.getVersion` — в UA обязан быть
 *     Android. Прибор, молча померивший десктоп и подписавшийся «живой
 *     A54», — худший из возможных: его числа уйдут в канон навсегда.
 *     Сверяются ОБА уровня (браузер и страница): расхождение означает, что
 *     UA кто-то подменяет, и подлинность не доказана.
 *  2. ВКЛАДКА НА ЭКРАНЕ. `document.visibilityState` обязан быть `visible`:
 *     в фоновой вкладке rAF заморожен, и прибор мерил бы СТОЯЩУЮ страницу,
 *     честно рапортуя о числах (проект это уже проходил — «деградации после
 *     прогрева нет» было выводом об остановленной странице).
 *  3. ЖЕЛЕЗО НЕ ПОДМЕНЕНО — см. `DEVICE_FORBIDDEN`.
 *
 * ⚠️ ЧТО ЭТОТ МОДУЛЬ НЕ ДОКАЗЫВАЕТ. Что attach реально доедет до телефона
 * по `adb`, здесь не проверено ничем: проверка требует телефона. Гейт
 * самопроверки (`npm run check:attach`) доказывает ДРУГОЕ, и только это:
 * путь без `spawn` и без подмены железа работает, а на неандроидном UA
 * ПАДАЕТ. Гейты доказываются падением.
 */
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Вызовы, которые на ЖИВОМ устройстве врут про железо. */
export const DEVICE_FORBIDDEN = new Set([
  "Emulation.setDeviceMetricsOverride",
  "Emulation.clearDeviceMetricsOverride",
  "Emulation.setCPUThrottlingRate",
  "Emulation.setTouchEmulationEnabled",
  "Emulation.setEmitTouchEventsForMouse",
  "Emulation.setUserAgentOverride",
  "Emulation.setDeviceOrientationOverride",
  "Emulation.setScrollbarsHidden",
  // Врут про устройство ровно так же, как задушенный CPU (находка `fizik`):
  // первое подменяет канал, второе — число ядер, а оба числа уходят в отчёт
  // как «замер на живом A54».
  "Network.emulateNetworkConditions",
  "Emulation.setHardwareConcurrencyOverride",
]);

const DEFAULT_CHROME =
  process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

export function isAttach() {
  return process.env.ATTACH === "1";
}

/** Сырое WS-соединение к CDP. Хост/порт — НАШИ, путь — от цели.
 *  ⚠️ Хост из `webSocketDebuggerUrl` брать нельзя: телефон возвращает
 *  собственный адрес, а мы ходим через `adb forward` на 127.0.0.1. */
export function wsConnect(wsUrl, host, port) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const req = http.request({
      host: host || u.hostname,
      port: port || u.port,
      path: u.pathname + u.search,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
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

function httpJson(host, port, path) {
  return new Promise((res) =>
    http
      .get({ host, port, path }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch {
            res(null);
          }
        });
      })
      .on("error", () => res(null))
  );
}

/**
 * Поднять или найти стенд.
 *
 * @param {object} o
 * @param {number} o.port            порт CDP (на телефоне — `adb forward`)
 * @param {string} o.baseUrl         адрес стенда; в attach служит признаком цели
 * @param {string} [o.targetUrl]     подстрока URL искомой вкладки (иначе baseUrl)
 * @param {string[]} [o.args]        доп. аргументы Chrome (только spawn)
 * @param {boolean} [o.headless]
 * @param {string} [o.profile]       user-data-dir (только spawn)
 * @param {(m:string)=>void} [o.die] как падать (по умолчанию — process.exit 1)
 */
export async function openStand(o) {
  const attach = isAttach();
  const host = process.env.CDP_HOST || "127.0.0.1";
  const port = o.port;
  const die =
    o.die ||
    ((m) => {
      console.error("\n❌ ПРОГОН УПАЛ: " + m);
      process.exit(1);
    });

  let child = null;
  if (!attach) {
    child = spawn(
      o.chrome || DEFAULT_CHROME,
      [
        ...(o.headless ? ["--headless=new"] : []),
        `--remote-debugging-port=${port}`,
        ...(o.profile ? ["--user-data-dir=" + o.profile] : []),
        "--no-first-run",
        "--no-default-browser-check",
        "--force-color-profile=srgb",
        "--hide-scrollbars",
        ...(o.args || []),
        "about:blank",
      ],
      { stdio: "ignore" }
    );
  }

  let targets = null;
  const tries = attach ? 10 : 60;
  for (let i = 0; i < tries && !targets; i++) {
    await sleep(300);
    targets = await httpJson(host, port, "/json/list");
  }
  if (!targets)
    die(
      attach
        ? `нет ответа CDP на ${host}:${port}. Для телефона: включить «Отладка по USB», ` +
            `затем \`adb forward tcp:${port} localabstract:chrome_devtools_remote\``
        : "Chrome не поднялся"
    );

  const pages = targets.filter((t) => t.type === "page");
  let page;
  if (attach) {
    // ⚠️ ЦЕЛЬ — ПО URL. «Первая page» на телефоне это лотерея из чужих вкладок.
    const needle = o.targetUrl || o.baseUrl;
    const hits = pages.filter((t) => (t.url || "").includes(needle));
    if (!hits.length)
      die(
        `среди ${pages.length} вкладок нет ни одной с «${needle}» в адресе.\n     ` +
          `Открыто: ${pages.map((t) => t.url).join("\n               ") || "— ничего"}\n     ` +
          `Если стенд поднят на этой машине, телефону нужен ОБРАТНЫЙ проброс: ` +
          `\`adb reverse tcp:3100 tcp:3100\``
      );
    if (hits.length > 1)
      console.log(`  (вкладок с «${needle}»: ${hits.length}, беру первую: ${hits[0].url})`);
    page = hits[0];
  } else {
    page = pages[0];
    if (!page) die("нет страницы в /json/list (запертый профиль?)");
  }

  const ws = await wsConnect(page.webSocketDebuggerUrl, host, port);
  let id = 1;
  const pending = new Map();
  const events = new Map();
  ws.listeners.add((raw) => {
    const m = JSON.parse(raw);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    const fns = events.get(m.method);
    if (fns) for (const fn of fns) fn(m.params);
  });

  const calls = [];
  const call = (method, params = {}) => {
    // ⚠️ ГЛАВНЫЙ ПРЕДОХРАНИТЕЛЬ МОДУЛЯ. Не «залогировать и продолжить»:
    // подмена железа на устройстве обесценивает ВЕСЬ прогон, а не один вызов.
    if (attach && DEVICE_FORBIDDEN.has(method))
      die(
        `на ЖИВОМ устройстве запрещён вызов ${method} — он врёт про железо. ` +
          `Прибор обязан мерить телефон таким, какой он есть`
      );
    calls.push(method);
    return new Promise((res) => {
      pending.set(id, (m) => res(m.result));
      ws.send(JSON.stringify({ id: id++, method, params }));
    });
  };
  const on = (method, fn) => {
    if (!events.has(method)) events.set(method, new Set());
    events.get(method).add(fn);
  };
  const ev = async (expr, awaitP = true) => {
    const { result, exceptionDetails } = await call("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: awaitP,
    });
    if (exceptionDetails)
      die("JS в странице упал: " + JSON.stringify(exceptionDetails).slice(0, 500));
    return result?.value;
  };

  await call("Page.enable");
  await call("Runtime.enable");

  /* ---------- подлинность устройства ---------- */
  const ver = await call("Browser.getVersion");
  const browserUA = ver?.userAgent || "";
  let device = { browserUA, product: ver?.product || "" };
  if (attach) {
    const pageUA = await ev(
      `({ua:navigator.userAgent, vis:document.visibilityState, dpr:devicePixelRatio,
          iw:innerWidth, ih:innerHeight, sw:screen.width, sh:screen.height,
          touch:navigator.maxTouchPoints, mem:navigator.deviceMemory||null,
          cores:navigator.hardwareConcurrency||null, url:location.href,
          reduce:matchMedia('(prefers-reduced-motion: reduce)').matches,
          fine:matchMedia('(pointer: fine)').matches})`
    );
    const androidBrowser = /Android/i.test(browserUA);
    const androidPage = /Android/i.test(pageUA?.ua || "");
    if (!androidBrowser && !androidPage)
      die(
        `ATTACH=1 объявляет ЖИВОЕ УСТРОЙСТВО, но в UA нет Android:\n     ` +
          `браузер: ${browserUA || "—"}\n     страница: ${pageUA?.ua || "—"}\n     ` +
          `Это десктопный Chrome. Прибор, померивший десктоп и подписавшийся ` +
          `«живой A54», отравил бы канон навсегда`
      );
    if (androidBrowser !== androidPage)
      die(
        `UA браузера и страницы РАСХОДЯТСЯ (браузер: ${androidBrowser ? "Android" : "не Android"}, ` +
          `страница: ${androidPage ? "Android" : "не Android"}) — кто-то подменяет UA, ` +
          `подлинность устройства не доказана`
      );
    /* ⚠️ ОДНОГО UA МАЛО, И САМОПРОВЕРКА ЭТО ПОКАЗЫВАЕТ: её положительная
       ловушка — ДЕСКТОПНЫЙ Chrome с андроидным `--user-agent`, и по UA он
       неотличим от телефона. Случайную ошибку (забыли `adb`, присоединились
       к локальному браузеру) UA ловит; намеренную подмену — нет. Поэтому
       спрашиваем ещё и железо, которое модуль и так читает: у телефона
       МУЛЬТИТАЧ. Признак выбран `maxTouchPoints`, а не `pointer: fine`:
       второй зависит от того, подключена ли к машине мышь, и ронял бы
       прогон на телефоне со стилусом или OTG-мышью (находка `fizik`,
       признак сужен исполнителем). */
    if (!(pageUA?.touch > 0))
      die(
        `ATTACH=1 объявляет ЖИВОЕ УСТРОЙСТВО, но у него НЕТ СЕНСОРНОГО ВВОДА ` +
          `(maxTouchPoints = ${pageUA?.touch}). Телефон без тача не бывает — ` +
          `это десктоп с подменённым UA`
      );
    if (pageUA?.fine)
      console.log(
        `  ⚠️ у устройства pointer:fine — это законно (стилус, мышь по OTG), ` +
          `но выводы о тач-эквивалентах на таком стенде делать нельзя`
      );
    if (pageUA?.vis !== "visible")
      die(
        `вкладка не на экране (visibilityState = ${pageUA?.vis}): в фоне rAF заморожен, ` +
          `и прибор померил бы СТОЯЩУЮ страницу. Разбудить экран, открыть вкладку`
      );
    device = { ...device, ...pageUA };
    console.log(
      `СТЕНД: ЖИВОЕ УСТРОЙСТВО (attach ${host}:${port}), железо НЕ подменяется\n` +
        `  ${browserUA}\n` +
        `  вьюпорт ${pageUA.iw}×${pageUA.ih} CSS, экран ${pageUA.sw}×${pageUA.sh}, DPR ${pageUA.dpr}\n` +
        `  ядер ${pageUA.cores ?? "?"}, память ${pageUA.mem ?? "?"} ГБ, точек касания ${pageUA.touch}, ` +
        `pointer:fine=${pageUA.fine}, reduce=${pageUA.reduce}\n` +
        `  вкладка: ${pageUA.url}`
    );
  }

  return {
    attach,
    spawned: !!child,
    host,
    port,
    call,
    ev,
    on,
    calls,
    device,
    die,
    ws,
    /**
     * Навязать стенду железо. На эмуляции — как раньше; на устройстве —
     * НИЧЕГО, и это печатается: числа обязаны быть сравнимы осознанно,
     * а не «похоже, тот же стенд».
     */
    async applyStand({ W, H, DSF, CPU, touch = true, mobile = true, maxTouchPoints = 1 }) {
      if (attach) {
        console.log(
          `  железо стенда НЕ навязывается: ни метрик, ни CPU-троттлинга, ни тач-эмуляции — ` +
            `меряется телефон как есть (эмуляция дала бы CPU ${CPU}× ПОВЕРХ настоящего)`
        );
        return { emulated: false };
      }
      await call("Emulation.setDeviceMetricsOverride", {
        width: W,
        height: H,
        deviceScaleFactor: DSF,
        mobile,
      });
      if (touch)
        await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints });
      if (CPU) await call("Emulation.setCPUThrottlingRate", { rate: CPU });
      return { emulated: true, W, H, DSF, CPU };
    },
    /** Сколько раз прибор трогал запрещённое на устройстве (для самопроверки). */
    forbiddenUsed() {
      return calls.filter((m) => DEVICE_FORBIDDEN.has(m));
    },
    close() {
      try {
        ws.socket.end();
      } catch {}
      if (child) child.kill();
    },
  };
}

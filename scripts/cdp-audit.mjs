/**
 * Рубеж 3 — пиксельная приёмка «парящих оправ» в реальном рендере.
 *
 * Запускает headless Chrome с CDP, делает скриншоты на 1440×900 и сверяет
 * пары пикселей «внутри прямоугольника картинки на чистом фоне» ↔ «снаружи
 * рядом»: RGB обязаны совпадать канал в канал — иначе у multiply-кадра
 * виден шов.
 *
 * NB (этап 1): multiply-оправа переехала из hero в деко-секции — hero теперь
 * портрет (FocusPortrait, /hero/portrait.png: маски + rack-focus, НЕ multiply),
 * а slot hero-float в photos.ts зарегистрирован, но не рендерится ни одним
 * компонентом. Аудит нацелен на deco-2 (#expertise) — единственный уникальный
 * slug среди пяти FloatFrame-секций (deco-1/deco-3 встречаются по два раза).
 *
 * Зерно body::after (плёночная фактура, opacity 0.022, fixed поверх всего
 * вьюпорта) на время строгого замера отключается: оно перебивает каждый
 * пиксель шумом ±1 НЕЗАВИСИМО от положения оправ и шов создать не может,
 * а «канал в канал» с ним недостижим в принципе. Контрольный замер с
 * включённым зерном идёт отдельно с допуском ±1 — подтверждает, что иных
 * источников расхождения нет.
 *
 * Дополнительно: пересечения деко с текстом на 4 ширинах, горизонтальный
 * скролл, мобайл (фильтры выключены, деко скрыты), reduced-motion
 * (отдельный запуск Chrome с --force-prefers-reduced-motion), LCP.
 *
 * Без зависимостей: WebSocket-клиент и PNG-декодер написаны на встроенных
 * модулях Node (правило проекта — никаких новых пакетов).
 *
 * Использование: node scripts/cdp-audit.mjs [urlBase] [chromePath]
 */
import http from "node:http";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { spawn } from "node:child_process";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME =
  process.argv[3] ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const DEBUG_PORT = 9777;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= WebSocket-клиент (минимальный, RFC 6455) ============ */
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
      socket.on("error", () => {}); // обрыв при закрытии браузера — не падать
      const listeners = new Set();
      let buf = Buffer.alloc(0);
      let parts = [];
      const send = (text) => {
        const payload = Buffer.from(text, "utf8");
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) {
          header = Buffer.from([0x81, 0x80 | payload.length]);
        } else if (payload.length < 65536) {
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
          if (opcode === 9) {
            // ping → pong
            const mask = crypto.randomBytes(4);
            const p = Buffer.from(payload);
            for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
            socket.write(Buffer.concat([Buffer.from([0x8a, 0x80 | p.length]), mask, p]));
            continue;
          }
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

/* ================= CDP-обвязка ========================================= */
async function cdpSession(wsUrl) {
  const ws = await wsConnect(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const eventHandlers = new Map();
  ws.listeners.add((raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    } else if (msg.method && eventHandlers.has(msg.method)) {
      for (const fn of eventHandlers.get(msg.method)) fn(msg.params);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const on = (method, fn) => {
    if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
    eventHandlers.get(method).add(fn);
  };
  const once = (method) =>
    new Promise((resolve) => {
      const fn = (p) => {
        eventHandlers.get(method).delete(fn);
        resolve(p);
      };
      on(method, fn);
    });
  return { call, on, once, close: () => ws.socket.end() };
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

/* ================= PNG-декодер (8 бит, RGB/RGBA, без interlace) ======== */
function decodePng(buffer) {
  let pos = 8; // сигнатура
  let width = 0,
    height = 0,
    colorType = 0;
  const idat = [];
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || data[12] !== 0)
        throw new Error(`PNG не поддержан: depth=${bitDepth} color=${colorType}`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowIn = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const prev = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[out + x - bpp] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[prev + x - bpp] : 0;
      let v = rowIn[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      pixels[out + x] = v & 0xff;
    }
  }
  return {
    width,
    height,
    px(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return null;
      const o = (y | 0) * stride + (x | 0) * bpp;
      return [pixels[o], pixels[o + 1], pixels[o + 2]];
    },
  };
}

/* ================= Геометрия =========================================== */
// Точка внутри quad по долям (u,v); экстраполяция за кромки — линейная
function quadPoint(q, u, v) {
  const top = { x: q[0] + (q[2] - q[0]) * u, y: q[1] + (q[3] - q[1]) * u };
  const bot = { x: q[6] + (q[4] - q[6]) * u, y: q[7] + (q[5] - q[7]) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// Пересечение выпуклого quad и прямоугольника (SAT)
function quadIntersectsRect(q, r) {
  const quad = [
    { x: q[0], y: q[1] },
    { x: q[2], y: q[3] },
    { x: q[4], y: q[5] },
    { x: q[6], y: q[7] },
  ];
  const rect = [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.right, y: r.bottom },
    { x: r.left, y: r.bottom },
  ];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < 4; i++) {
    const a = quad[i],
      b = quad[(i + 1) % 4];
    axes.push({ x: -(b.y - a.y), y: b.x - a.x });
  }
  for (const ax of axes) {
    const proj = (pts) => {
      let lo = Infinity,
        hi = -Infinity;
      for (const p of pts) {
        const d = p.x * ax.x + p.y * ax.y;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return [lo, hi];
    };
    const [a1, a2] = proj(quad);
    const [b1, b2] = proj(rect);
    if (a2 < b1 || b2 < a1) return false;
  }
  return true;
}

/* ================= Кандидаты пар [u_in, v_in, u_out, v_out] ============ */
const CANDIDATES = {
  "deco-2": [
    [0.45, 0.06, 0.45, -0.14],
    [0.55, 0.06, 0.55, -0.14],
    [0.75, 0.06, 0.75, -0.14],
    [0.92, 0.15, 1.12, 0.15],
    [0.92, 0.5, 1.12, 0.5],
    [0.92, 0.88, 1.12, 0.88],
    [0.5, 0.94, 0.5, 1.15],
  ],
};

/* ================= Аудит =============================================== */
function launchChrome(extraFlags = []) {
  return spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      "--user-data-dir=" + process.env.TEMP + "\\optimist-cdp-audit",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--window-size=1440,900",
      ...extraFlags,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
}

async function connect() {
  let targets = null;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(300);
    targets = await httpJson("/json/list").catch(() => null);
  }
  if (!targets) throw new Error("CDP не поднялся");
  const page = targets.find((t) => t.type === "page");
  const cdp = await cdpSession(page.webSocketDebuggerUrl);
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("DOM.enable");

  const evaluate = async (expr) => {
    const { result, exceptionDetails } = await cdp.call("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.text + " в " + expr.slice(0, 80));
    return result.value;
  };
  const api = {
    cdp,
    evaluate,
    setViewport: (width, height, mobile = false, dsf = 1) =>
      cdp.call("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: dsf,
        mobile,
      }),
    navigate: async (url) => {
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.call("Page.navigate", { url });
      await loaded;
    },
    reload: async () => {
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.call("Page.reload");
      await loaded;
    },
    screenshot: async () => {
      const { data } = await cdp.call("Page.captureScreenshot", { format: "png" });
      return decodePng(Buffer.from(data, "base64"));
    },
    getQuad: async (selector) => {
      const { root } = await cdp.call("DOM.getDocument", { depth: 1 });
      const { nodeId } = await cdp.call("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      if (!nodeId) return null;
      const quads = await cdp
        .call("DOM.getContentQuads", { nodeId })
        .then((r) => r.quads)
        .catch(() => null);
      return quads?.[0] ?? null;
    },
    scrollTo: async (y) => {
      await evaluate(`window.scrollTo(0, ${y}); window.scrollY`);
      await sleep(150);
      return evaluate("window.scrollY");
    },
    // отключить зерно для строгого замера (идемпотентно)
    grainOff: () =>
      evaluate(`(() => {
        if (!document.getElementById('audit-no-grain')) {
          const s = document.createElement('style');
          s.id = 'audit-no-grain';
          s.textContent = 'body::after{display:none!important}';
          document.head.appendChild(s);
        } return true; })()`),
    grainOn: () =>
      evaluate(
        `(() => { document.getElementById('audit-no-grain')?.remove(); return true; })()`
      ),
  };
  return api;
}

// однородность: пиксель и 4 соседа (±3px) совпадают с допуском → точка
// не на линии/глифе/краю тени, сравнение честное
function uniformPx(img, x, y, tol = 0) {
  const c = img.px(x, y);
  if (!c) return null;
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
    const n = img.px(x + dx, y + dy);
    if (!n) return null;
    for (let k = 0; k < 3; k++) if (Math.abs(n[k] - c[k]) > tol) return null;
  }
  return c;
}

async function testPairs(api, report, slot, state, vpW, vpH, tolerance = 0) {
  const quad = await api.getQuad(`img[src*="${slot}"]`);
  if (!quad) {
    report.pairs[`${slot}/${state}`] = { error: "quad не найден" };
    return;
  }
  const img = await api.screenshot();
  const rows = [];
  for (const [ui, vi, uo, vo] of CANDIDATES[slot]) {
    const pin = quadPoint(quad, ui, vi);
    const pout = quadPoint(quad, uo, vo);
    const inBounds = (p) => p.x > 4 && p.x < vpW - 4 && p.y > 95 && p.y < vpH - 4;
    if (!inBounds(pin) || !inBounds(pout)) continue;
    const cin = uniformPx(img, pin.x, pin.y, tolerance);
    const cout = uniformPx(img, pout.x, pout.y, tolerance);
    if (!cin || !cout) continue;
    const maxDelta = Math.max(
      Math.abs(cin[0] - cout[0]),
      Math.abs(cin[1] - cout[1]),
      Math.abs(cin[2] - cout[2])
    );
    rows.push({
      in: { x: Math.round(pin.x), y: Math.round(pin.y), rgb: cin },
      out: { x: Math.round(pout.x), y: Math.round(pout.y), rgb: cout },
      maxDelta,
      ok: maxDelta <= tolerance,
    });
  }
  report.pairs[`${slot}/${state}`] = {
    tolerance,
    quad: quad.map((n) => Math.round(n)),
    rows,
    pass: rows.length >= 3 && rows.every((r) => r.ok),
  };
}

async function main() {
  const report = { pairs: {}, checks: [], lcp: null };

  /* ============ Сессия 1: обычный рендер ============ */
  let chrome = launchChrome();
  try {
    const api = await connect();
    const { evaluate, setViewport, navigate, scrollTo } = api;

    await setViewport(1440, 900);
    await navigate(URL_BASE + "/");
    await sleep(6500); // прелоадер ≤1.8s + каскад появления

    report.lcp = await evaluate(`new Promise((res) => {
      const po = new PerformanceObserver((l) => {
        const e = l.getEntries().pop();
        if (e) res({ ms: Math.round(e.startTime), el: e.element ? e.element.tagName + (e.element.currentSrc ? ':' + e.element.currentSrc.slice(-40) : '') : null });
      });
      po.observe({ type: 'largest-contentful-paint', buffered: true });
      setTimeout(() => res(null), 2000);
    })`);

    const imgFilter = (slot) =>
      evaluate(
        `getComputedStyle(document.querySelector('img[src*="${slot}"]')).filter`
      );

    // Multiply-оправа теперь живёт в деко-секциях (hero перешёл на портрет,
    // slot hero-float не рендерится). Аудитим deco-2 (#expertise).
    const decoTop = await evaluate(`(() => {
      const el = document.querySelector('img[src*="deco-2"]');
      const r = el.getBoundingClientRect();
      return Math.round(r.top + window.scrollY + r.height / 2);
    })()`);

    // deco-2 у центра вьюпорта (резкость): контрольный замер С зерном (±1)…
    await scrollTo(decoTop - 450);
    await sleep(2500); // entrance once + спокойный spring
    report.checks.push({
      name: "deco-2 img filter (у центра вьюпорта)",
      value: await imgFilter("deco-2"),
    });
    await testPairs(api, report, "deco-2", "center@1440+grain(±1)", 1440, 900, 1);
    // …и строгий без зерна (канал в канал)
    await api.grainOff();
    await testPairs(api, report, "deco-2", "center@1440", 1440, 900, 0);

    // deco-2 со сдвигом (focal blur активен)
    await scrollTo(decoTop - 450 - 240);
    await sleep(1500);
    report.checks.push({
      name: "deco-2 img filter (сдвиг 240 — focal blur)",
      value: await imgFilter("deco-2"),
    });
    await testPairs(api, report, "deco-2", "parallax@1440", 1440, 900, 0);

    /* ---------- Пересечения с текстом + h-скролл на 4 ширинах ---------- */
    for (const w of [1024, 1280, 1440, 1920]) {
      await setViewport(w, 900);
      await sleep(700);
      const hscroll = await evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
      );
      await scrollTo(0);
      await sleep(400);
      const dTop = await evaluate(`(() => {
        const el = document.querySelector('img[src*="deco-2"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0) return null;
        return Math.round(r.top + window.scrollY + r.height / 2);
      })()`);
      let decoHits = null;
      if (dTop) {
        await scrollTo(dTop - 450);
        await sleep(900);
        const dq = await api.getQuad('img[src*="deco-2"]');
        const texts = await evaluate(`(() => {
          const els = document.querySelectorAll('#expertise h2, #expertise p, #expertise span, #expertise div.border-t');
          return [...els].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect();
            return { tag: e.tagName, left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
        })()`);
        decoHits = dq ? texts.filter((r) => quadIntersectsRect(dq, r)).length : "quad?";
      }
      report.checks.push({
        name: `ширина ${w}`,
        hscroll,
        decoTextHits: decoHits,
      });
      await scrollTo(0);
    }

    /* ---------- Мобайл 360/390 ---------- */
    for (const w of [360, 390]) {
      await setViewport(w, 800, true, 2);
      await sleep(700);
      await scrollTo(0);
      const r = await evaluate(`(() => {
        const doc = document.documentElement;
        const deco = document.querySelector('img[src*="deco-2"]');
        return {
          hscroll: doc.scrollWidth - doc.clientWidth,
          decoHidden: deco ? deco.getBoundingClientRect().width === 0 : 'нет узла',
        };
      })()`);
      report.checks.push({ name: `мобайл ${w}`, ...r });
    }

    /* ---------- Середина entrance deco-2 (multiply при 0<opacity<1) ------ */
    await setViewport(1440, 900);
    await api.reload();
    // после reload страница вверху; подводим deco-2 к нижней кромке вьюпорта,
    // чтобы запустить его inView-entrance, и ловим момент 0<opacity<1
    const decoTop2 = await evaluate(`(() => {
      const el = document.querySelector('img[src*="deco-2"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.top + window.scrollY + r.height / 2);
    })()`);
    let entranceOpacity = "0";
    if (decoTop2 != null) {
      await scrollTo(decoTop2 - 780);
      for (let i = 0; i < 12; i++) {
        await sleep(i === 0 ? 60 : 80);
        entranceOpacity = await evaluate(
          `(() => { const el = document.querySelector('img[src*="deco-2"]'); return el ? getComputedStyle(el).opacity : '0'; })()`
        );
        const v = parseFloat(entranceOpacity);
        if (v > 0.05 && v < 0.92) break;
      }
    }
    await api.grainOff();
    report.checks.push({
      name: "mid-entrance deco-2: opacity в момент замера",
      value: entranceOpacity,
    });
    await testPairs(api, report, "deco-2", "mid-entrance@1440", 1440, 900, 0);

    api.cdp.close();
  } finally {
    chrome.kill();
  }
  await sleep(800);

  /* ============ Сессия 2: reduced-motion (форс на уровне браузера) ===== */
  chrome = launchChrome(["--force-prefers-reduced-motion"]);
  try {
    const api = await connect();
    await api.setViewport(1440, 900);
    await api.navigate(URL_BASE + "/");
    await sleep(4500);
    // доскроллить до deco-2 (в reduced-motion оправа — статичный резкий кадр)
    const decoTop = await api.evaluate(`(() => {
      const el = document.querySelector('img[src*="deco-2"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.round(r.top + window.scrollY + r.height / 2);
    })()`);
    if (decoTop != null) {
      await api.scrollTo(decoTop - 450);
      await sleep(800);
    }
    report.checks.push({
      name: "reduced-motion: deco-2 img",
      value: await api.evaluate(`(() => {
        const img = document.querySelector('img[src*="deco-2"]');
        const layer = img.parentElement;
        return {
          matchMedia: matchMedia('(prefers-reduced-motion: reduce)').matches,
          filter: getComputedStyle(img).filter,
          opacity: getComputedStyle(img).opacity,
          layerTransform: getComputedStyle(layer).transform,
        };
      })()`),
    });
    await api.grainOff();
    await testPairs(api, report, "deco-2", "reduced-motion@1440", 1440, 900, 0);
    api.cdp.close();
  } finally {
    chrome.kill();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("АУДИТ УПАЛ:", e);
  process.exit(1);
});

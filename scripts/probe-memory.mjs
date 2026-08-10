/**
 * ПАМЯТЬ «/» ПО РЕАЛЬНО ОТДАННЫМ АССЕТАМ (шаг 7 этапа 6).
 *
 * ⚠️ `naturalWidth` НЕ ГОДИТСЯ: браузер нормирует его на плотность srcset —
 * реестр однажды получил из него занижение в 2,4 раза. Здесь для каждого
 * УНИКАЛЬНОГО `currentSrc` качается сам байт-поток и его пиксельный размер
 * читается sharp-ом. Декод = w × h × 4 (RGBA8).
 *
 * Два стенда: канон (390×844 @3) и НАСТОЯЩИЙ Galaxy A54 (411×914 @2,625) —
 * плотность меняет выбранный вариант srcset, а с ним и всю память.
 *
 * Плюс проба композиторных слоёв: сколько GPU-памяти держит слой светов,
 * пока он НЕВИДИМ (`will-change: opacity` промотирует его навсегда).
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
// Прибор живёт вне дерева проекта — sharp берём из его node_modules явно.
const sharp = createRequire("C:/Users/User/Desktop/website/optimist_new/package.json")("sharp");

const BASE = process.env.BASE || "http://127.0.0.1:3100";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.PORT || 9831);
const MiB = 1048576;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (m) => {
  console.error("\n❌ ПРОГОН УПАЛ: " + m);
  process.exit(1);
};

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const req = http.request({
      host: u.hostname,
      port: u.port,
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

const fetchBuf = (url) =>
  new Promise((res, rej) => {
    const u = new URL(url);
    http
      .get({ host: u.hostname, port: u.port, path: u.pathname + u.search }, (r) => {
        const bufs = [];
        r.on("data", (c) => bufs.push(c));
        r.on("end", () => res({ buf: Buffer.concat(bufs), code: r.statusCode }));
      })
      .on("error", rej);
  });

async function stand(call, ev, label, W, H, DSF) {
  await call("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: DSF,
    mobile: true,
  });
  await call("Page.navigate", { url: BASE + "/?m=" + Date.now() });
  await sleep(5000);
  // Проход по ВСЕЙ странице: без него ленивые кадры не декодированы,
  // и «пик» был бы посчитан по половине картинок.
  const hgt = await ev(`document.documentElement.scrollHeight`);
  for (let y = 0; y < hgt; y += Math.round(H * 0.55)) {
    await ev(`window.scrollTo(0,${y});0`);
    await sleep(700);
  }
  await ev(`window.scrollTo(0,${hgt});0`);
  await sleep(2500);
  // Обратный проход — сценарий обязателен: он же проверяет, не растёт ли heap.
  for (let y = hgt; y > 0; y -= Math.round(H * 0.8)) {
    await ev(`window.scrollTo(0,${Math.max(0, y)});0`);
    await sleep(400);
  }
  await sleep(2000);

  const inv = await ev(`(()=>{
    const imgs=[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0)
      .map(i=>({src:i.currentSrc||i.src, hal:i.hasAttribute('data-halation')}));
    const cvs=[...document.querySelectorAll('canvas')].map(c=>({w:c.width,h:c.height,
      cw:c.clientWidth,ch:c.clientHeight,id:(c.closest('#vision')?'vision':'иной')}));
    const notDone=[...document.querySelectorAll('img')].filter(i=>!(i.complete&&i.naturalWidth>0)).length;
    return {imgs,cvs,notDone,heap:performance.memory?performance.memory.usedJSHeapSize:null,
      dpr:devicePixelRatio, w:innerWidth};})()`);

  const uniq = new Map();
  for (const im of inv.imgs) {
    if (!uniq.has(im.src)) uniq.set(im.src, { n: 0, hal: im.hal });
    uniq.get(im.src).n++;
    if (im.hal) uniq.get(im.src).hal = true;
  }
  console.log(
    `\n════ СТЕНД «${label}»: ${W}×${H} @${DSF} (innerWidth ${inv.w}, DPR ${inv.dpr.toFixed(3)}) ════`
  );
  let total = 0;
  const rows = [];
  for (const [src, meta] of uniq) {
    const got = await fetchBuf(src);
    if (got.code !== 200) die(`ассет отдан с кодом ${got.code}: ${src}`);
    const md = await sharp(got.buf).metadata();
    const bytes = md.width * md.height * 4;
    total += bytes;
    rows.push({ src, meta, w: md.width, h: md.height, fmt: md.format, net: got.buf.length, bytes });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  for (const r of rows)
    console.log(
      `  ${(r.bytes / MiB).toFixed(2).padStart(6)} MiB  ${String(r.w + "×" + r.h).padEnd(11)}` +
        ` ${String(r.fmt).padEnd(4)} сеть ${String(Math.round(r.net / 1024) + "К").padStart(6)}` +
        `  ${r.meta.n > 1 ? `${r.meta.n}× узла ` : ""}${r.meta.hal ? "◀ ХАЛЯЦИЯ " : ""}` +
        decodeURIComponent(r.src).replace(BASE, "")
    );
  const canvasBytes = inv.cvs.reduce((s, c) => s + c.w * c.h * 4, 0);
  console.log(
    `  ─── изображений уникальных ${rows.length} (узлов ${inv.imgs.length}, не догружено ${inv.notDone})` +
      `  ИТОГО декод ${(total / MiB).toFixed(1)} MiB`
  );
  console.log(
    `  канвасы: ${inv.cvs.map((c) => `${c.id} ${c.w}×${c.h}`).join(", ")} → буферы ${(
      canvasBytes / MiB
    ).toFixed(2)} MiB;  heap ${(inv.heap / MiB).toFixed(1)} MiB`
  );
  const hal = rows.find((r) => r.meta.hal);
  if (!hal) die("слоя халяции нет среди декодированных — инвентарь без него неполон");
  console.log(
    `  ХАЛЯЦИЯ: ${(hal.bytes / MiB).toFixed(2)} MiB (${((hal.bytes / total) * 100).toFixed(
      1
    )} % всего декода «/»)`
  );
  return { total, rows, inv, canvasBytes, hal };
}

async function main() {
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=" + process.env.TEMP + "\\optimist-p3-mem",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--window-size=1500,1000",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      await sleep(300);
      targets = await new Promise((res) =>
        http
          .get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => {
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
    if (!targets) die("Chrome не поднялся");
    const page = targets.find((t) => t.type === "page");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    const layerEvents = [];
    ws.listeners.add((raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method === "LayerTree.layerTreeDidChange") layerEvents.push(m.params);
    });
    const call = (method, params = {}) =>
      new Promise((res) => {
        pending.set(id, (m) => res(m.result));
        ws.send(JSON.stringify({ id: id++, method, params }));
      });
    const ev = async (expr) => {
      const { result, exceptionDetails } = await call("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails) die("JS в странице упал: " + JSON.stringify(exceptionDetails).slice(0, 400));
      return result?.value;
    };

    await call("Page.enable");
    await call("Runtime.enable");

    const a54 = await stand(call, ev, "настоящий Galaxy A54", 411, 914, 2.625);
    const canon = await stand(call, ev, "канон реестра", 390, 844, 3);

    /* ---------- композиторные слои: чем стоит will-change: opacity ---------- */
    console.log("\n════ КОМПОЗИТОРНЫЕ СЛОИ (слой светов НЕВИДИМ: 0 дптр) ════");
    // Доезд до шторки и сброс на 0 дптр клавишей Home (ползунок уже фокусируем).
    for (let k = 0; k < 6; k++) {
      await ev(
        `(()=>{const el=document.querySelectorAll('#vision .cursor-ew-resize')[0];
          const r=el.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + r.top - Math.max(12,(innerHeight-r.height)/2));return 0;})()`
      );
      await sleep(350);
    }
    await sleep(1500);
    const zero = await ev(`(()=>{const el=document.querySelectorAll('#vision .cursor-ew-resize')[0];
      const h=el.querySelector('[role="slider"]');
      h.focus(); h.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
      return 'sent';})()`);
    await sleep(1200);
    const st0 = await ev(`(()=>{const el=document.querySelectorAll('#vision .cursor-ew-resize')[0];
      const i=el.querySelector('[data-halation]'); if(!i) return null;
      let n=i.parentElement; while(n && getComputedStyle(n).mixBlendMode!=='screen') n=n.parentElement;
      const cs=n?getComputedStyle(n):null;
      return {now:el.querySelector('[role=slider]').getAttribute('aria-valuenow'),
        op: cs?cs.opacity:null, wc: cs?cs.willChange:null, blend: cs?cs.mixBlendMode:null,
        box: n?[Math.round(n.getBoundingClientRect().width),Math.round(n.getBoundingClientRect().height)]:null};})()`);
    if (!st0) die("узла слоя светов нет — судить о слоях нечем");
    console.log(
      `  ползунок на ${st0.now} дптр; узел слоя: opacity ${st0.op}, will-change «${st0.wc}», ` +
        `blend ${st0.blend}, бокс ${st0.box.join("×")} CSS`
    );
    if (st0.now !== "0")
      console.log(`  🟠 сбросить на 0 дптр не удалось (${st0.now}) — числа ниже относятся к этой ступени`);

    await call("LayerTree.enable");
    const grab = async (tag) => {
      layerEvents.length = 0;
      await ev(`document.body.style.zoom=''; 0`);
      // Пинок компоновщику, чтобы прилетело свежее дерево.
      await ev(`window.scrollBy(0,1); window.scrollBy(0,-1); 0`);
      await sleep(1800);
      const last = layerEvents[layerEvents.length - 1];
      if (!last || !last.layers) return null;
      const layers = last.layers.filter((l) => l.width > 1 && l.height > 1);
      const bytes = layers.reduce((s, l) => s + l.width * l.height * 4, 0);
      console.log(
        `  ${tag}: слоёв ${layers.length}, суммарно ${(bytes / MiB).toFixed(2)} MiB; ` +
          `крупнейшие ${layers
            .slice()
            .sort((a, b) => b.width * b.height - a.width * a.height)
            .slice(0, 4)
            .map((l) => `${l.width}×${l.height}`)
            .join(", ")}`
      );
      return { n: layers.length, bytes };
    };
    const withLayer = await grab("слой светов В ДЕРЕВЕ (opacity 0)");
    await ev(`(()=>{const el=document.querySelectorAll('#vision .cursor-ew-resize')[0];
      const i=el.querySelector('[data-halation]');
      let n=i.parentElement; while(n && getComputedStyle(n).mixBlendMode!=='screen') n=n.parentElement;
      window.__saved=n; n.style.display='none'; return 0;})()`);
    const without = await grab("слой светов display:none");
    await ev(`(()=>{window.__saved.style.display=''; return 0;})()`);
    if (withLayer && without) {
      const d = withLayer.bytes - without.bytes;
      console.log(
        `  ⇒ дельта: ${(d / MiB).toFixed(2)} MiB и ${withLayer.n - without.n} слой(ёв) — ` +
          `столько GPU-памяти держит НЕВИДИМЫЙ слой светов`
      );
      if (d === 0)
        console.log(
          `  (ноль — значит слой НЕ промотирован в отдельную поверхность: will-change: opacity ` +
            `здесь не создаёт постоянного слоя; либо LayerTree не отдаёт его отдельно — см. число слоёв)`
        );
    } else console.log("  🟠 дерево слоёв не пришло — этот пункт НЕ ИЗМЕРЕН");

    fs.writeFileSync(
      process.env.OUT || "p3-mem.json",
      JSON.stringify(
        {
          a54: { total: a54.total, rows: a54.rows, canvasBytes: a54.canvasBytes },
          canon: { total: canon.total, rows: canon.rows, canvasBytes: canon.canvasBytes },
          layers: { withLayer, without },
        },
        null,
        1
      )
    );
    ws.socket.end();
  } finally {
    chrome.kill();
  }
}
main().catch((e) => die(String(e && e.stack ? e.stack : e)));

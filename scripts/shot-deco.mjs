/**
 * Разовая визуальная съёмка деко-оправ для приёмки размещения.
 * Снимает вьюпорт с каждым деко-слотом по центру на заданных ширинах,
 * плюс печатает пересечения quad деко с текстом секции (SAT).
 * Использование: node scripts/shot-deco.mjs
 * Без зависимостей (CDP по сырому WebSocket, как в cdp-audit.mjs).
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";

const URL_BASE = "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9779;
const OUT = "tmp-frames";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// слот → секция-хост (для проверки пересечений с текстом).
// Одно фото может жить в двух секциях (на разных полях) — запрос
// скоупится секцией, поэтому пары (slot, section) уникальны.
const SLOTS = [
  { slot: "deco-3", section: "#about" },
  { slot: "deco-1", section: "#salons" },
  { slot: "deco-2", section: "#expertise" },
  { slot: "deco-3", section: "#services" }, // новое: левое поле
  { slot: "deco-1", section: "#collections" }, // новое: правое поле, под навигацией
];

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: {
        Connection: "Upgrade", Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
      },
    });
    req.on("upgrade", (_res, socket) => {
      socket.setNoDelay(true);
      socket.on("error", () => {});
      const listeners = new Set();
      let buf = Buffer.alloc(0); let parts = [];
      const send = (text) => {
        const payload = Buffer.from(text, "utf8");
        const mask = crypto.randomBytes(4);
        let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) {
          header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126;
          header.writeUInt16BE(payload.length, 2);
        } else {
          header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127;
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
          let len = buf[1] & 0x7f; let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len);
          buf = buf.subarray(off + len);
          if (opcode === 8) { socket.end(); return; }
          parts.push(payload);
          if (fin) { const msg = Buffer.concat(parts).toString("utf8"); parts = []; for (const fn of listeners) fn(msg); }
        }
      });
      resolve({ send, listeners, socket });
    });
    req.on("error", reject);
    req.end();
  });
}

function quadIntersectsRect(q, r) {
  const quad = [{ x: q[0], y: q[1] }, { x: q[2], y: q[3] }, { x: q[4], y: q[5] }, { x: q[6], y: q[7] }];
  const rect = [{ x: r.left, y: r.top }, { x: r.right, y: r.top }, { x: r.right, y: r.bottom }, { x: r.left, y: r.bottom }];
  const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < 4; i++) { const a = quad[i], b = quad[(i + 1) % 4]; axes.push({ x: -(b.y - a.y), y: b.x - a.x }); }
  for (const ax of axes) {
    const proj = (pts) => { let lo = Infinity, hi = -Infinity; for (const p of pts) { const d = p.x * ax.x + p.y * ax.y; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
    const [a1, a2] = proj(quad); const [b1, b2] = proj(rect);
    if (a2 < b1 || b2 < a1) return false;
  }
  return true;
}

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\optimist-shot",
    "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank",
  ], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) { await sleep(300); targets = await new Promise((res) => http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on("error", () => res(null))); }
    const page = targets.find((t) => t.type === "page");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1; const pending = new Map(); const evHandlers = new Map();
    ws.listeners.add((raw) => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method && evHandlers.has(m.method)) { for (const fn of evHandlers.get(m.method)) fn(m.params); } });
    const call = (method, params = {}) => new Promise((res) => { pending.set(id, (m) => res(m.result)); ws.send(JSON.stringify({ id: id++, method, params })); });
    const evaluate = async (expr) => { const { result } = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return result.value; };
    await call("Page.enable"); await call("Runtime.enable"); await call("DOM.enable");
    const getQuad = async (selector) => {
      const { root } = await call("DOM.getDocument", { depth: 1 });
      const { nodeId } = await call("DOM.querySelector", { nodeId: root.nodeId, selector });
      if (!nodeId) return null;
      const r = await call("DOM.getContentQuads", { nodeId }).catch(() => null);
      return r?.quads?.[0] ?? null;
    };

    for (const w of [1024, 1280, 1440, 1920]) {
      await call("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      if (w === 1024) { await call("Page.navigate", { url: URL_BASE + "/" }); await sleep(6000); }
      await sleep(500);
      for (const { slot, section } of SLOTS) {
        const sel = `${section} img[src*="${slot}"]`;
        const tag = `${slot}@${section}`;
        const center = await evaluate(`(() => { const el = document.querySelector('${sel}'); if (!el) return null; const r = el.getBoundingClientRect(); if (r.width === 0) return null; return Math.round(r.top + window.scrollY + r.height/2); })()`);
        if (center == null) { console.log(`${tag}@${w}: скрыт/нет узла`); continue; }
        await evaluate(`window.scrollTo(0, ${center - 450}); window.scrollY`);
        await sleep(1400);
        // пересечения с текстом секции
        const dq = await getQuad(sel);
        const texts = await evaluate(`(() => { const els = document.querySelectorAll('${section} h1, ${section} h2, ${section} h3, ${section} p, ${section} a, ${section} span'); return [...els].filter(e=>e.offsetParent && e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect(); return {tag:e.tagName, t:(e.textContent||'').trim().slice(0,24), left:r.left, top:r.top, right:r.right, bottom:r.bottom};}); })()`);
        const hits = dq ? texts.filter((r) => quadIntersectsRect(dq, r)) : [];
        console.log(`${tag}@${w}: quad=[${dq ? dq.map((n)=>Math.round(n)).join(",") : "—"}] пересечений=${hits.length}${hits.length ? " → " + hits.map(h=>h.tag+'"'+h.t+'"').join(", ") : ""}`);
        // скриншот только на 1024 и 1440 (узкий риск + эталон)
        if (w === 1024 || w === 1440) {
          const { data } = await call("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(`${OUT}/shot-${slot}-${section.replace("#","")}-${w}.png`, Buffer.from(data, "base64"));
        }
      }
    }
    ws.socket.end();
  } finally { chrome.kill(); }
}
main().catch((e) => { console.error("СЪЁМКА УПАЛА:", e); process.exit(1); });

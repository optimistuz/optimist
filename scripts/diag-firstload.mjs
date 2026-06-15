/**
 * Диагностика «первый заход vs рефреш»: свежая навигация на /, сбор консоли
 * (гидратация!) и реального состояния интро/героя. Без зависимостей (CDP).
 * Запуск: node scripts/diag-firstload.mjs
 */
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const URL_BASE = process.env.BASE || "http://localhost:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9783;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wsConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64") },
    });
    req.on("upgrade", (_res, socket) => {
      socket.setNoDelay(true); socket.on("error", () => {});
      const listeners = new Set(); let buf = Buffer.alloc(0); let parts = [];
      const send = (text) => {
        const payload = Buffer.from(text, "utf8"); const mask = crypto.randomBytes(4); let header;
        if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
        else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
        else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        socket.write(Buffer.concat([header, mask, payload]));
      };
      socket.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        for (;;) {
          if (buf.length < 2) return;
          const fin = (buf[0] & 0x80) !== 0; const opcode = buf[0] & 0x0f;
          let len = buf[1] & 0x7f; let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
          if (opcode === 8) { socket.end(); return; }
          parts.push(payload);
          if (fin) { const msg = Buffer.concat(parts).toString("utf8"); parts = []; for (const fn of listeners) fn(msg); }
        }
      });
      resolve({ send, listeners, socket });
    });
    req.on("error", reject); req.end();
  });
}

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\optimist-diag",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--window-size=1440,900", "about:blank",
  ], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) { await sleep(300); targets = await new Promise((res) => http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on("error", () => res(null))); }
    const page = targets.find((t) => t.type === "page");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1; const pending = new Map(); const evHandlers = new Map();
    ws.listeners.add((raw) => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method && evHandlers.has(m.method)) { for (const fn of evHandlers.get(m.method)) fn(m.params); } });
    const call = (method, params = {}) => new Promise((res) => { pending.set(id, (m) => res(m.result)); ws.send(JSON.stringify({ id: id++, method, params })); });
    const on = (method, fn) => { if (!evHandlers.has(method)) evHandlers.set(method, new Set()); evHandlers.get(method).add(fn); };
    const evaluate = async (expr) => { const { result } = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return result?.value; };

    const consoleMsgs = [];
    on("Runtime.consoleAPICalled", (p) => consoleMsgs.push(`[${p.type}] ` + (p.args || []).map((a) => a.value ?? a.description ?? "").join(" ")));
    on("Log.entryAdded", (p) => consoleMsgs.push(`[log/${p.entry.level}] ${p.entry.text}`));
    on("Runtime.exceptionThrown", (p) => consoleMsgs.push(`[exception] ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));

    await call("Page.enable"); await call("Runtime.enable"); await call("Log.enable");

    console.log("=== СВЕЖАЯ НАВИГАЦИЯ на / ===");
    await call("Page.navigate", { url: URL_BASE + "/" });
    await sleep(6000);

    const diag = await evaluate(`(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const h1inner = document.querySelector('#hero h1 .block .block, #hero h1 span span');
      const heroH1 = document.querySelector('#hero h1');
      const cs = heroH1 ? getComputedStyle(heroH1) : null;
      // ищем оверлей интро по z-60/bg-offwhite фиксированному
      const overlay = [...document.querySelectorAll('div')].find(d => {
        const s = getComputedStyle(d); return s.position === 'fixed' && d.className && /z-\\[60\\]/.test(d.className);
      });
      return {
        navType: nav ? nav.type : 'n/a',
        referrer: document.referrer,
        heroH1opacity: cs ? cs.opacity : 'no-h1',
        heroH1text: heroH1 ? heroH1.innerText.slice(0,40) : 'no-h1',
        overlayPresent: !!overlay,
        overlayOpacity: overlay ? getComputedStyle(overlay).opacity : 'none',
        overlayVisibility: overlay ? getComputedStyle(overlay).visibility : 'none',
      };
    })()`);

    console.log("ДИАГНОСТИКА:", JSON.stringify(diag, null, 2));
    console.log("\n=== КОНСОЛЬ/ОШИБКИ (", consoleMsgs.length, ") ===");
    for (const m of consoleMsgs.slice(0, 40)) console.log(m);

    ws.socket.end();
  } finally { chrome.kill(); }
}
main().catch((e) => { console.error("ДИАГ УПАЛ:", e); process.exit(1); });

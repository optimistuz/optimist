/**
 * Переиспользуемый скриншоттер сайта для приёмки визуального апгрейда.
 * Без зависимостей (CDP по сырому WebSocket, как cdp-audit.mjs / shot-deco.mjs).
 * Снимает заданные кадры (ширина × scrollY) за один запуск Chrome.
 *
 * Кадры задаются в массиве SHOTS ниже — правь его под нужный проход.
 * Запуск: node scripts/shot-site.mjs   → PNG в tmp-frames/site-*.png
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";

const URL_BASE = process.env.BASE || "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9781;
const OUT = "tmp-frames";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// label, path, width, scrollY (px), dsf (deviceScaleFactor), height
const SHOTS = JSON.parse(process.env.SHOTS || "null") || [
  { label: "header-scrolled", path: "/", w: 1440, y: 760, dsf: 2, h: 900 },
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

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\optimist-shot-site",
    "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb",
    "--hide-scrollbars", "--window-size=1920,1200", "about:blank",
  ], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(300);
      targets = await new Promise((res) => http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on("error", () => res(null)));
    }
    const page = targets.find((t) => t.type === "page");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1; const pending = new Map();
    ws.listeners.add((raw) => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    const call = (method, params = {}) => new Promise((res) => { pending.set(id, (m) => res(m.result)); ws.send(JSON.stringify({ id: id++, method, params })); });
    const evaluate = async (expr) => { const { result } = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return result?.value; };
    await call("Page.enable"); await call("Runtime.enable");

    let lastPath = null;
    for (const s of SHOTS) {
      await call("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h || 900, deviceScaleFactor: s.dsf || 1, mobile: !!s.mobile });
      if (s.reload) {
        await call("Page.reload", { ignoreCache: false });
        await sleep(s.navWait || 3200);
      } else if (s.path !== lastPath) {
        await call("Page.navigate", { url: URL_BASE + s.path });
        await sleep(s.navWait || 3200); // загрузка + прелоадер (+ холодная компиляция)
        lastPath = s.path;
      }
      // Синтетический клик (приёмка состояний за переключателем: режимы формы,
      // открытие аккордеона и т. п.). Выполняется ДО скролла — лейаут успевает
      // перестроиться, и anchor считает корректные позиции.
      if (s.clickOn) {
        await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(s.clickOn)}); if(el) el.click(); return 0;})()`);
        await sleep(s.clickWait || 500);
      }
      if (s.bottom) {
        // Надёжный доезд до подвала: страница длинная, нижние секции
        // догружают высоту по мере появления — прыгаем к растущему низу
        // несколько раз, пока он не стабилизируется (и Lenis успевает встать).
        for (let k = 0; k < 8; k++) {
          await evaluate(`window.scrollTo(0, document.body.scrollHeight); 0`);
          await sleep(400);
        }
      } else if (s.anchor) {
        await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(s.anchor)}); if(el){const r=el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - ${s.anchorOffset ?? 260});} return 0;})()`);
      } else {
        await evaluate(`window.scrollTo(0, ${s.y || 0}); 0`);
      }
      await sleep(s.wait || 1300);

      /* Клик в ТОЧКУ внутри элемента — доля его ширины (0…1) и высоты.
         ⚠️ `clickOn` (el.click()) для этого не годится: он бьёт в центр и не
         несёт координат, а ползунку-шторке нужна именно позиция — состояние
         эффекта задаётся тем, ГДЕ нажали. Сделано ради кадров −1/−3/−6 дптр
         в приёмке этапа 6; годится любому слайдеру и любой шторке.
         Идёт ПОСЛЕ скролла: координаты считаются от уже доехавшего лейаута. */
      if (s.clickAt) {
        const at = await evaluate(
          `(()=>{const el=document.querySelector(${JSON.stringify(s.clickAt.on)});
            if(!el) return null; const r=el.getBoundingClientRect();
            return [Math.round(r.left + r.width * ${s.clickAt.fx ?? 0.5}),
                    Math.round(r.top + r.height * ${s.clickAt.fy ?? 0.5})];})()`
        );
        if (at) {
          for (const type of ["mousePressed", "mouseReleased"]) {
            await call("Input.dispatchMouseEvent", {
              type, x: at[0], y: at[1], button: "left", clickCount: 1, pointerType: "mouse",
            });
          }
          await sleep(s.clickAt.wait ?? 900);
        }
      }
      // Синтетическое наведение курсора (для приёмки фокус-курсора/лупы):
      // mouseOn — по центру селектора; mouse — по абсолютным [x,y].
      let mxy = Array.isArray(s.mouse) ? s.mouse : null;
      if (s.mouseOn) {
        mxy = await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(s.mouseOn)}); if(!el)return null; const r=el.getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)];})()`);
      }
      if (mxy) {
        await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: mxy[0], y: mxy[1], buttons: 0, pointerType: "mouse" });
        await sleep(550);
      }
      const { data } = await call("Page.captureScreenshot", { format: "png" });
      const file = `${OUT}/site-${s.label}.png`;
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`✓ ${file}  (${s.w}×${s.h || 900} @${s.dsf || 1}x, y=${s.y || 0})`);
    }
    ws.socket.end();
  } finally { chrome.kill(); }
}
main().catch((e) => { console.error("СЪЁМКА УПАЛА:", e); process.exit(1); });

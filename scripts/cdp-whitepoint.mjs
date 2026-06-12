/**
 * Замер белой точки битмапов, которые реально получает браузер:
 * оригинал /photos/*.jpg против вариантов оптимизатора /_next/image.
 * Канвас-ридбек — это декодированный RGB без участия композитинга.
 */
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9781;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      let buf = Buffer.alloc(0);
      let parts = [];
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
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
          if (buf.length < off + len) return;
          const payload = buf.subarray(off, off + len);
          buf = buf.subarray(off + len);
          if (opcode === 9) {
            const mask = crypto.randomBytes(4);
            const p = Buffer.from(payload);
            for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
            socket.write(Buffer.concat([Buffer.from([0x8a, 0x80 | p.length]), mask, p]));
            continue;
          }
          if (opcode === 8) { socket.end(); return; }
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

async function main() {
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + process.env.TEMP + "\\optimist-cdp-wp",
    "--no-first-run", "--force-color-profile=srgb",
    "--window-size=900,700", "about:blank",
  ], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
      await sleep(300);
      targets = await new Promise((res) =>
        http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => {
          let d = ""; r.on("data", (c) => (d += c));
          r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } });
        }).on("error", () => res(null))
      );
    }
    const page = targets.find((t) => t.type === "page");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1;
    const pending = new Map();
    ws.listeners.add((raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    });
    const call = (method, params = {}) => new Promise((res) => {
      pending.set(id, res);
      ws.send(JSON.stringify({ id: id++, method, params }));
    });
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Page.navigate", { url: "http://127.0.0.1:3000/" });
    await sleep(3000);

    const result = await call("Runtime.evaluate", {
      expression: `(async () => {
        const urls = [
          ["оригинал hero-float.jpg", "/photos/hero-float.jpg"],
          ["next/image w=750 q=90 (как на странице)", "/_next/image?url=%2Fphotos%2Fhero-float.jpg&w=750&q=90"],
          ["next/image w=1080 q=90", "/_next/image?url=%2Fphotos%2Fhero-float.jpg&w=1080&q=90"],
          ["next/image w=750 q=100", "/_next/image?url=%2Fphotos%2Fhero-float.jpg&w=750&q=100"],
          ["оригинал deco-2.jpg", "/photos/deco-2.jpg"],
          ["next/image deco w=256 q=90", "/_next/image?url=%2Fphotos%2Fdeco-2.jpg&w=256&q=90"],
        ];
        const out = [];
        for (const [label, url] of urls) {
          const img = new Image();
          img.src = url;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
          ctx.drawImage(img, 0, 0);
          // точки фона: верхний левый угол, верх-центр, у левой кромки
          const pts = [[0.05, 0.06], [0.5, 0.04], [0.05, 0.3]];
          const vals = pts.map(([u, v]) => {
            const d = ctx.getImageData(Math.round(u * c.width), Math.round(v * c.height), 1, 1).data;
            return d[0] + ',' + d[1] + ',' + d[2];
          });
          out.push(label + ' [' + img.naturalWidth + 'x' + img.naturalHeight + ']: ' + vals.join(' | '));
        }
        return out.join('\\n');
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(result.result.value);
    ws.socket.end();
  } finally {
    chrome.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

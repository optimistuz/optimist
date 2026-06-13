/**
 * Ловит hydration-warnings в dev-режиме (они есть только в next dev).
 * Запускает headless Chrome, слушает console (Runtime.consoleAPICalled)
 * и Log, грузит страницу в обычном режиме и в reduced-motion, печатает
 * все сообщения про гидрацию. Без зависимостей.
 *
 * Использование: node scripts/cdp-hydration.mjs [urlBase] [chromePath]
 */
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const URL_BASE = process.argv[2] ?? "http://127.0.0.1:3001";
const CHROME =
  process.argv[3] ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
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
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
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

async function run(label, flags) {
  const chrome = launchChrome(flags);
  const messages = [];
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

    await cdp.call("Page.navigate", { url: URL_BASE + "/" });
    await sleep(9000); // dev-компиляция + гидрация
    cdp.close();
  } finally {
    chrome.kill();
  }
  return { label, count: messages.length, messages };
}

async function main() {
  const out = [];
  out.push(await run("normal@1440", []));
  await sleep(800);
  out.push(await run("reduced-motion@1440", ["--force-prefers-reduced-motion"]));
  await sleep(800);
  out.push(await run("mobile@390", ["--window-size=390,800"]));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("ПРОВЕРКА УПАЛА:", e);
  process.exit(1);
});

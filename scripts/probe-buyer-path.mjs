/**
 * ПУТЬ ГЛАЗАМИ ВЛАДЕЛЬЦА — прибор приёмки (`priyomshchik`, введён шагом 7
 * этапа 6). Эмуляция Galaxy A54: 390×844, DPR 2,625, mobile+touch, CPU 4×.
 *
 * ⚠️ ПОЧЕМУ ОН В РЕПОЗИТОРИИ. Им вынесен вердикт «шаг 7 принят с хвостами»,
 * и на нём же стоят три проверки, которых не делал ни один другой аудитор
 * (окно загрузки, CSS-фолбэк, поворот экрана). Прибор жил в `tmp-frames/` —
 * папке, которая В `.gitignore`, то есть исчез бы с первой уборкой вместе
 * с возможностью перепроверить приёмку. Канон говорит буквально: прибор,
 * который нельзя запустить снова, — не прибор, а воспоминание; проект уже
 * дважды за это платил (вся кампания «6б» держалась на скрипте в `%TEMP%`).
 * ⚠️ И он НЕ ПРО ОДИН ШАГ: на этапах витрины ПЕРВЫМ пунктом приёмки стоит
 * путь покупателя (реклама → каталог → полка/примерка → заявка), и режимы
 * ниже — готовый каркас для него.
 *
 * ⚠️ ШТОРКА ВЕДЁТСЯ ПЕРЕТАСКИВАНИЕМ (тач), а не кликом: на десктопной ширине
 * рельс «Шкалы наводки» перехватывает клик по правой части кадра (на 1280 —
 * правые 112 px, 9,5 % ширины), и приёмка обязана трогать кадр так же, как
 * палец. `setPointerCapture` отдаёт движения кадру поверх любого хрома.
 *
 * РЕЖИМЫ (env `MODE`, дефолт `main`):
 *   main     — путь покупателя: ступени 0/−1/−3/−6 пальцем, второй симулятор
 *              (книга), поворот экрана, клавиатура и ARIA обоих ползунков
 *   reduce   — `prefers-reduced-motion`: функциональность цела, гаптика молчит
 *   fallback — WebGL выключен: работает ли CSS-ветка и лежит ли слой светов
 *              на своём источнике
 *   load     — окно загрузки: кадр секции задерживается Fetch-перехватом,
 *              ищется тёмная плита blend-слоя над непрозрачным полом группы
 *   rail     — хит-тест кадра: какую его часть накрывает хром «Шкалы наводки»
 *   touch    — вертикальный жест по кадру: не крадёт ли шторка скролл страницы
 *
 * Прочие переменные: BASE, PORT, W, H, DSF, CPU. Кадры — в `tmp-frames/`.
 * Нужен живой `npm run dev` на :3000.
 *
 * ⚠️ ДВА ДЕФЕКТА, НАЙДЕННЫЕ У САМОГО СЕБЯ (читать ДО, а не ПОСЛЕ):
 *  1. Окно замера шва хватало КРУГЛУЮ РУЧКУ и КРОМКУ КАДРА — «ступеньки»
 *     120,1 и 20,9 оказались ручкой и границей кадра, а не артефактом склейки
 *     (разбор и починка — `probe-seam.mjs`).
 *  2. Проба совпадения слоя КОРРЕЛЯЦИЕЙ ЯРКОСТЕЙ провалила собственный
 *     контроль: в центре кадра, где сдвиг обязан быть нулём, дала −32 px.
 *     Заменена прямым замером ГЕОМЕТРИИ (рамки, пропорции, `object-fit`).
 *     Мера, не прошедшая свой нулевой контроль, не мера.
 *
 * ⚠️ ИСХОД «СУДИТЬ НЕЧЕМ» — законный и обязательный. Вертикальный тач-скролл
 * этот прибор НЕ проверяет: он не скроллит страницу синтетическим тачем даже
 * ВНЕ кадра (контроль тоже даёт 0), поэтому «шторка не крадёт скролл» здесь
 * НЕ ДОКАЗАНО, а не подтверждено. Проверять телефоном в руках.
 *
 * ⚠️ Как убедиться, что гейт умеет ПАДАТЬ (закон «гейты доказываются
 * падением»): сделать копию прибора с обезвреженным отрицательным контролем
 * и убедиться, что прогон выходит с кодом 1. Для `probe-halation.mjs` это
 * снятие пола группы (`backgroundColor=''`) — проверено, exit 1.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import sharp from "sharp";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.PORT || 9793);
const OUT = "tmp-frames";
const MODE = process.env.MODE || "main";
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);
const DSF = Number(process.env.DSF || 2.625);
const CPU = Number(process.env.CPU || 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const note = (ok, text) => {
  console.log(`${ok ? "✅" : "❌"} ${text}`);
  if (!ok) fail.push(text);
};

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

/* Средняя яркость окна ФИЗИЧЕСКИХ пикселей (снимок приходит в них). */
function lum(raw, info, x0, y0, x1, y1) {
  const { width, height, channels } = info;
  const X0 = Math.max(0, Math.min(width - 1, Math.round(x0)));
  const X1 = Math.max(0, Math.min(width, Math.round(x1)));
  const Y0 = Math.max(0, Math.min(height - 1, Math.round(y0)));
  const Y1 = Math.max(0, Math.min(height, Math.round(y1)));
  let s = 0, n = 0;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (y * width + x) * channels;
      s += 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
      n++;
    }
  }
  return n ? { mean: s / n, n } : { mean: NaN, n: 0 };
}
/** Профиль столбцов вокруг шва: средняя яркость каждой физической колонки. */
function columnProfile(raw, info, xc, y0, y1, half = 8) {
  const cols = [];
  for (let x = Math.round(xc - half); x <= Math.round(xc + half); x++) {
    cols.push({ x, mean: lum(raw, info, x, y0, x + 1, y1).mean });
  }
  return cols;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const profile = process.env.TEMP + "\\optimist-priem7-" + MODE;
  fs.rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${PORT}`,
    "--user-data-dir=" + profile,
    "--no-first-run", "--no-default-browser-check", "--force-color-profile=srgb",
    "--hide-scrollbars", "--window-size=1200,1000", "about:blank",
  ], { stdio: "ignore" });
  try {
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      await sleep(300);
      targets = await new Promise((res) => http.get({ host: "127.0.0.1", port: PORT, path: "/json/list" }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch { res(null); } }); }).on("error", () => res(null)));
    }
    const page = (targets || []).find((t) => t.type === "page");
    if (!page) throw new Error("нет страницы в /json/list (запертый профиль?)");
    const ws = await wsConnect(page.webSocketDebuggerUrl);
    let id = 1; const pending = new Map();
    const netUrls = [];
    ws.listeners.add((raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === "Network.requestWillBeSent") netUrls.push(m.params.request.url);
      if (m.method === "Fetch.requestPaused") onPaused(m.params);
    });
    const call = (method, params = {}) => new Promise((res) => { pending.set(id, (m) => res(m.result)); ws.send(JSON.stringify({ id: id++, method, params })); });
    /* Задержка ОДНОГО запроса — кадра секции. Так воспроизводится ровно тот
       случай, где `fizik` видел тёмную плиту: слой светов (9 КБ) уже пришёл,
       фото (85 КБ) ещё нет. Глобальный троттлинг для этого НЕ ГОДИТСЯ: на
       dev-сборке при 400 кбит/с страница вообще не гидрируется, машинерия
       не поднимается, слоя в DOM нет — и опасное окно не открывается вовсе
       (проверено: 63 с белого кадра, вердикт был бы пустым). */
    const DELAY_MS = Number(process.env.DELAY_MS || 12000);
    let delayed = 0;
    const onPaused = async (p) => {
      const isPhoto = /street\.jpg/.test(p.request.url);
      if (isPhoto) { delayed++; await sleep(DELAY_MS); }
      await call("Fetch.continueRequest", { requestId: p.requestId });
    };
    const ev = async (expr) => {
      const { result, exceptionDetails } = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (exceptionDetails) throw new Error("JS: " + JSON.stringify(exceptionDetails.exception?.description || exceptionDetails.text));
      return result?.value;
    };
    await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
    await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: process.env.DESKTOP!=='1' });
    await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await call("Emulation.setEmitTouchEventsForMouse", { enabled: false });
    if (MODE === "reduce") {
      await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    }
    // Счётчик вибраций — до первого скрипта страницы (haptics читает
    // navigator.vibrate в момент вызова, поэтому подмена работает).
    await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__vib = []; Object.defineProperty(navigator, 'vibrate',
        { configurable: true, writable: true, value: (ms) => { window.__vib.push(ms); return true; } });`,
    });
    if (MODE === "fallback") {
      /* Честный отказ WebGL: контекста нет вовсе (ветка `onFail` → CSS-blur).
         Так живёт телефон без WebGL — и именно в этой ветке слой светов
         обязан совпадать с размытым кадром (scale-105 у обоих). */
      await call("Page.addScriptToEvaluateOnNewDocument", {
        source: `(()=>{const g=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(t,...a){
            if(String(t).indexOf('webgl')===0||t==='experimental-webgl') return null;
            return g.call(this,t,...a);};})();`,
      });
    }
    await call("Emulation.setCPUThrottlingRate", { rate: CPU });
    const shot = async (label, clip) => {
      const { data } = await call("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
      const file = `${OUT}/priem7-${label}.png`;
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      const { data: raw, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
      return { file, raw, info };
    };

    if (MODE === "load") {
      await call("Network.setCacheDisabled", { cacheDisabled: true });
      await call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
    }
    await call("Page.navigate", { url: BASE + "/" });
    if (MODE === "load") {
      console.log(`\n──── ОКНО ЗАГРУЗКИ: кадр секции задержан, остальное на полной скорости (CPU ${CPU}×) ────`);
      const rows = [];
      const t0 = Date.now();
      for (let k = 0; k < 30; k++) {
        // Доезжаем к кадру, как только ползунок появился в разметке (он в HTML)
        const has = await ev(`document.querySelectorAll('[role="slider"]').length>0`).catch(() => false);
        if (has) {
          await ev(`(()=>{const c=document.querySelectorAll('[role="slider"]')[0].parentElement;
            const r=c.getBoundingClientRect(); if(Math.abs(r.top-150)>40) window.scrollTo(0, window.scrollY + r.top - 150); return 0;})()`);
          const info = await ev(`(()=>{const c=document.querySelectorAll('[role="slider"]')[0].parentElement;
            const b=c.querySelector('img:not([data-halation])');
            const h=c.querySelector('img[data-halation]');
            const r=c.getBoundingClientRect();
            return {baseComplete: b?(b.complete&&b.naturalWidth>0):null, baseOpacity: b?getComputedStyle(b).opacity:null,
                    hal: !!h, halOpacity: h?getComputedStyle(h.parentElement.parentElement).opacity:null,
                    rect:{l:r.left,t:r.top,w:r.width,h:r.height}};})()`);
          if (info && info.rect.w > 100 && info.rect.t > -100 && info.rect.t < 600) {
            const f = await shot(`load-t${String(k).padStart(2, "0")}`);
            const L = lum(f.raw, f.info, (info.rect.l + 6) * DSF, (info.rect.t + 20) * DSF, (info.rect.l + info.rect.w * 0.45) * DSF, (info.rect.t + info.rect.h - 20) * DSF);
            const R = lum(f.raw, f.info, (info.rect.l + info.rect.w * 0.55) * DSF, (info.rect.t + 20) * DSF, (info.rect.l + info.rect.w - 6) * DSF, (info.rect.t + info.rect.h - 20) * DSF);
            rows.push({ ms: Date.now() - t0, ...info, L: L.mean, R: R.mean });
            console.log(`  t=${((Date.now() - t0) / 1000).toFixed(1)} с  фото ${info.baseComplete ? "есть" : "нет"} (opacity ${info.baseOpacity})  слой ${info.hal ? "в DOM" : "нет"}  слева ${L.mean.toFixed(1)}  справа ${R.mean.toFixed(1)}`);
          }
        }
        await sleep(700);
      }
      const before = rows.filter((r) => !r.baseComplete);
      const dark = rows.filter((r) => r.L < r.R - 30);
      note(rows.length > 6, `окно загрузки отснято: ${rows.length} кадров (замеров до прихода фото: ${before.length})`);
      note(before.length > 0, `момент «фото ещё нет» ПОЙМАН (${before.length} кадров) — иначе судить было бы нечем`);
      note(dark.length === 0, `тёмной плиты нет ни в одном кадре окна (кадров с левой половиной темнее правой на 30+: ${dark.length})`);
      const halEarly = rows.filter((r) => r.hal && !r.baseComplete);
      note(halEarly.length === 0, `слой светов НЕ появлялся в DOM раньше кадра (нарушений: ${halEarly.length})`);
      const live = rows.filter((r) => r.hal);
      const drawn = rows.filter((r) => r.baseComplete);
      console.log(`  перехвачено запросов кадра: ${delayed}; кадров со слоем в DOM: ${live.length}; кадров с пришедшим фото: ${drawn.length}`);
      note(delayed > 0, `задержка кадра СРАБОТАЛА (перехватов street.jpg: ${delayed}) — иначе окна не существовало`);
      note(live.length > 0, `слой светов дошёл до DOM в прогоне (${live.length} кадров) — иначе о плите судить нечем`);
      await call("Fetch.disable");
    }
    await sleep(9000); // прелоадер + гидрация под CPU 4×


    /* Селекторы через ARIA-узлы: [0] — близорукость (улица), [1] — дальнозоркость (книга). */
    const SIM = (i) => `document.querySelectorAll('[role="slider"]')[${i}].parentElement`;
    const HANDLE = (i) => `document.querySelectorAll('[role="slider"]')[${i}]`;

    const nSliders = await ev(`document.querySelectorAll('[role="slider"]').length`);
    note(nSliders === 2, `ползунков на странице: ${nSliders} (ждём 2 — по одному на симулятор)`);

    // Доезд до кадра близорукости
    const scrollTo = async (i, offsetTop = 150) => {
      await ev(`(()=>{const r=${SIM(i)}.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.top - ${offsetTop}); return 0;})()`);
      await sleep(2200);
      await ev(`(()=>{const r=${SIM(i)}.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.top - ${offsetTop}); return 0;})()`);
      await sleep(2500);
    };
    await scrollTo(0);

    // Ждём подъёма ленивой машинерии (tabindex ставит именно она)
    let liveOk = false;
    for (let k = 0; k < 40; k++) {
      liveOk = await ev(`(()=>{const h=${HANDLE(0)}; return h.getAttribute('tabindex')==='0';})()`);
      if (liveOk) break;
      await sleep(500);
    }
    note(liveOk, "ленивая машинерия шторки поднялась (tabindex=0 на ползунке)");

    const state = async (i) => ev(`(()=>{const h=${HANDLE(i)}; const c=${SIM(i)};
      const cap=[...c.querySelectorAll('span')].map(s=>s.textContent.trim()).filter(t=>/дптр/.test(t));
      const hal=c.querySelector('img[data-halation]');
      const halBox=hal?hal.closest('div[style]').parentElement:null;
      const layer=hal?hal.parentElement.parentElement:null;
      const cs=layer?getComputedStyle(layer):null;
      const cont=getComputedStyle(c);
      const canvas=c.querySelector('canvas');
      const caption=c.parentElement.querySelector('p');
      return {
        valuenow: h.getAttribute('aria-valuenow'),
        valuetext: h.getAttribute('aria-valuetext'),
        valuemin: h.getAttribute('aria-valuemin'),
        valuemax: h.getAttribute('aria-valuemax'),
        role: h.getAttribute('role'),
        arialabel: h.getAttribute('aria-label'),
        left: h.style.left,
        capsule: cap[0] || null,
        caption: caption ? caption.textContent.trim() : null,
        hasCanvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasCssW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
        hasHalation: !!hal,
        halOpacity: cs ? cs.opacity : null,
        halBlend: cs ? cs.mixBlendMode : null,
        halClip: cs ? cs.clipPath : null,
        halMask: cs ? (cs.maskImage||cs.webkitMaskImage||'none').slice(0,24) : null,
        halTransform: cs ? cs.transform : null,
        halAnim: cs ? cs.animationName : null,
        halSrc: hal ? hal.currentSrc.replace(/^.*\\/_next/,'/_next') : null,
        halRect: hal ? (()=>{const r=hal.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)];})() : null,
        contIsolation: cont.isolation,
        contBg: cont.backgroundColor,
        vib: window.__vib.length,
        rect: (()=>{const r=c.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})(),
      };})()`);

    /* --- ТАЧ-ПЕРЕТАСКИВАНИЕ шторки к нужной ступени --- */
    const dragTo = async (i, dptr, maxD, { midShot = null } = {}) => {
      const r = (await state(i)).rect;
      const y = r.t + r.h * 0.5;
      const curLeftPct = parseFloat((await state(i)).left) || 0;
      /* ⚠️ ЗАЖИМ ВНУТРЬ КАДРА. Первая версия брала x0 РОВНО по позиции ручки,
         и на упоре 100 % палец опускался на границу контейнера (x = right):
         pointerdown уходил мимо элемента, перетаскивания не было вовсе, а
         прибор рапортовал «шторка не работает». Дефект прибора, не кода. */
      const inside = (x) => Math.min(r.l + r.w - 3, Math.max(r.l + 3, x));
      const x0 = inside(r.l + (r.w * curLeftPct) / 100);
      const frac = Math.min(0.998, dptr / maxD);
      const x1 = inside(r.l + r.w * frac);
      const tp = (x) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 12, radiusY: 12, force: 1 }];
      await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(x0) });
      const N = 14;
      for (let k = 1; k <= N; k++) {
        await call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(x0 + ((x1 - x0) * k) / N) });
        await sleep(45);
        if (midShot && k === Math.round(N * 0.6)) {
          // Кадр В ДВИЖЕНИИ (палец ещё на стекле) — стык обязан быть чист и здесь
          midShot.frame = await shot(midShot.label);
          midShot.st = await state(i);
        }
      }
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(1600); // пружинный доснап под CPU 4×
      return state(i);
    };

    const results = [];
    if (MODE === "main") {
      console.log(`\n──── ПУТЬ ПОКУПАТЕЛЯ: ${W}×${H} @${DSF}x, CPU ${CPU}× ────`);
      const st0 = await state(0);
      console.log(`старт (как открылось): valuenow=${st0.valuenow} «${st0.valuetext}» капсула «${st0.capsule}» подпись «${st0.caption}»`);
      note(st0.hasHalation, `слой светов в кадре улицы присутствует (src ${st0.halSrc})`);
      note(st0.contIsolation === "isolate", `контейнер изолирован: isolation=${st0.contIsolation}`);
      const bgOpaque = /rgb\(\d+, \d+, \d+\)/.test(st0.contBg || "");
      note(bgOpaque, `пол группы непрозрачен: background=${st0.contBg}`);

      // Ступени приёмки: 0 → −1 → −3 → −6, кадр в движении на пути к −6
      const mid = { label: "mid-drag-to-6", frame: null, st: null };
      for (const d of [0, 1, 3, 6]) {
        const st = await dragTo(0, d, 6, d === 6 ? { midShot: mid } : {});
        const frame = await shot(`far-d${d}`);
        // крупный план кадра
        await shot(`far-d${d}-crop`, {
          x: Math.round(st.rect.l), y: Math.round(st.rect.t),
          width: Math.round(st.rect.w), height: Math.round(st.rect.h), scale: 1,
        });
        results.push({ d, st, frame });
        console.log(
          `−${d} дптр → valuenow=${st.valuenow} «${st.valuetext}» капсула «${st.capsule}» ` +
          `подпись «${st.caption}» left=${st.left} opacity(слой)=${st.halOpacity} вибраций=${st.vib}`
        );
      }
      if (mid.frame) {
        console.log(`кадр в движении: valuenow=${mid.st.valuenow} left=${mid.st.left} opacity=${mid.st.halOpacity}`);
      }

      /* --- 1. Синхронность: valuenow = капсула = подпись = позиция --- */
      for (const { d, st } of results) {
        const vn = Number(st.valuenow);
        const okVal = Math.abs(vn - d) < 1e-6;
        const okCaps = (st.capsule || "").replace(/\u00a0|\u202f/g, " ").includes(`−${d === 0 ? "0" : String(d)}`) || (d === 0 && /0/.test(st.capsule || ""));
        const okLeft = Math.abs(parseFloat(st.left) - (d / 6) * 100) < 0.6;
        const okOp = Math.abs(Number(st.halOpacity) - d / 6) < 0.02;
        note(okVal && okCaps && okLeft, `−${d}: число ${st.valuenow}, капсула «${st.capsule}», линия left=${st.left} — синхронны`);
        note(okOp, `−${d}: прозрачность слоя ${st.halOpacity} = сила дефекта ${(d / 6).toFixed(3)} (без множителей)`);
      }
      /* --- 2. Слой не двигается: та же геометрия на всех ступенях --- */
      const rects = results.map((r) => JSON.stringify(r.st.halRect));
      note(new Set(rects).size === 1, `геометрия слоя постоянна на всех ступенях (${rects[0]}) — движения в слое нет`);
      const anims = new Set(results.map((r) => r.st.halAnim));
      note([...anims].every((a) => a === "none"), `в слое нет анимаций: animation-name=${[...anims].join("/")}`);
      note(results.every((r) => r.st.halBlend === "screen"), "слой смешивается через screen");
      note(results.every((r) => r.st.halClip && r.st.halClip !== "none"), `клип шторки на слое: ${results[3].st.halClip}`);
      note(results.every((r) => r.st.halMask && r.st.halMask !== "none"), `маска глубины на слое: ${results[3].st.halMask}…`);

      /* --- 3. Вибрация на снапах --- */
      const vibs = results.map((r) => r.st.vib);
      note(vibs[vibs.length - 1] > vibs[0], `вибрации на ступенях: ${vibs.join(" → ")} (счётчик растёт)`);
      const vibKinds = await ev("[...new Set(window.__vib)].join('/')");
      note(vibKinds === "10", `длительность вибраций — только словарное «snap» 10 мс (получено: ${vibKinds})`);

      /* --- 4. Стык шторки (в покое и в движении) + скруглённые углы --- */
      const seam = (frame, st, label) => {
        const xc = (st.rect.l + (st.rect.w * parseFloat(st.left)) / 100) * DSF;
        const y0 = (st.rect.t + st.rect.h * 0.2) * DSF;
        const y1 = (st.rect.t + st.rect.h * 0.8) * DSF;
        const prof = columnProfile(frame.raw, frame.info, xc, y0, y1, 8);
        // ручка-линия сама светлая (bg-paper/60) — ищем ступеньку ВНЕ ±3 px от неё
        const outer = prof.filter((c) => Math.abs(c.x - xc) > 3);
        let maxJump = 0, at = 0;
        for (let k = 1; k < outer.length; k++) {
          const dv = Math.abs(outer[k].mean - outer[k - 1].mean);
          if (dv > maxJump) { maxJump = dv; at = outer[k].x; }
        }
        console.log(`  ${label}: профиль ${prof.map((c) => c.mean.toFixed(0)).join(" ")}`);
        return { maxJump, at };
      };
      console.log("\nстык шторки (яркость по колонкам вокруг линии, физ. px):");
      const s6 = seam(results[3].frame, results[3].st, "покой −6");
      const s3 = seam(results[2].frame, results[2].st, "покой −3");
      const sm = mid.frame ? seam(mid.frame, mid.st, "в движении") : { maxJump: NaN };
      note(s6.maxJump < 12, `покой −6: макс ступенька у шва ${s6.maxJump.toFixed(1)} (порог 12)`);
      note(s3.maxJump < 12, `покой −3: макс ступенька у шва ${s3.maxJump.toFixed(1)} (порог 12)`);
      note(sm.maxJump < 12, `в движении: макс ступенька у шва ${sm.maxJump.toFixed(1)} (порог 12)`);

      // Углы: пиксель в 1 px внутри угла контейнера обязан остаться фоном страницы
      const f6 = results[3].frame; const r6 = results[3].st.rect;
      const corner = (dx, dy) => lum(f6.raw, f6.info, (r6.l + dx) * DSF, (r6.t + dy) * DSF, (r6.l + dx) * DSF + 2, (r6.t + dy) * DSF + 2).mean;
      const outside = lum(f6.raw, f6.info, (r6.l + 4) * DSF, (r6.t - 12) * DSF, (r6.l + 30) * DSF, (r6.t - 6) * DSF).mean;
      const c00 = corner(1, 1), c10 = corner(r6.w - 3, 1), c01 = corner(1, r6.h - 3), c11 = corner(r6.w - 3, r6.h - 3);
      console.log(`  углы: ${c00.toFixed(1)} / ${c10.toFixed(1)} / ${c01.toFixed(1)} / ${c11.toFixed(1)}  фон рядом ${outside.toFixed(1)}`);
      note([c00, c10, c01, c11].every((c) => Math.abs(c - outside) < 8),
        `скруглённые углы целы: канвас/слой не режут угол (Δ к фону ≤ ${Math.max(...[c00, c10, c01, c11].map((c) => Math.abs(c - outside))).toFixed(1)})`);

      /* --- 5. Второй симулятор (книга) — светов быть не должно --- */
      console.log("\n──── ВТОРОЙ СИМУЛЯТОР (книга, дальнозоркость) ────");
      await scrollTo(1);
      for (let k = 0; k < 40; k++) {
        if (await ev(`${HANDLE(1)}.getAttribute('tabindex')==='0'`)) break;
        await sleep(500);
      }
      const b0 = await state(1);
      const bMax = await dragTo(1, 3, 3);
      const bframe = await shot("near-max");
      await shot("near-max-crop", { x: Math.round(bMax.rect.l), y: Math.round(bMax.rect.t), width: Math.round(bMax.rect.w), height: Math.round(bMax.rect.h), scale: 1 });
      console.log(`книга: старт valuenow=${b0.valuenow}, после протяжки valuenow=${bMax.valuenow} «${bMax.valuetext}» капсула «${bMax.capsule}» подпись «${bMax.caption}»`);
      note(!bMax.hasHalation, `в кадре книги слоя светов НЕТ (hasHalation=${bMax.hasHalation})`);
      note(bMax.hasCanvas && bMax.canvasW > 0, `у книги свой живой канвас расфокуса (${bMax.canvasW} px буфер, ${bMax.canvasCssW} css)`);
      const hlReq = netUrls.filter((u) => /highlights/.test(u));
      console.log(`  запросы с «highlights»: ${hlReq.length}${hlReq.length ? " → " + hlReq.map((u) => u.replace(BASE, "")).join(", ") : ""}`);
      note(hlReq.length === 1, `лишних запросов светов нет: ровно ${hlReq.length} (только улица)`);
      note(!netUrls.some((u) => /book-highlights/.test(u)), "запроса book-highlights нет (сборной строки пути не существует)");

      /* --- 6. Клавиатура и ARIA на ОБОИХ симуляторах --- */
      console.log("\n──── КЛАВИАТУРА И ARIA ────");
      const key = async (i, k, code, vk) => {
        await ev(`${HANDLE(i)}.focus(); 0`);
        await sleep(120);
        await call("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
        await sleep(900);
        return state(i);
      };
      for (const [i, name, maxD, step] of [[0, "улица", 6, 0.5], [1, "книга", 3, 0.25]]) {
        await scrollTo(i);
        const home = await key(i, "Home", "Home", 36);
        const right = await key(i, "ArrowRight", "ArrowRight", 39);
        const up = await key(i, "ArrowUp", "ArrowUp", 38);
        const left = await key(i, "ArrowLeft", "ArrowLeft", 37);
        const end = await key(i, "End", "End", 35);
        console.log(`  ${name}: Home→${home.valuenow}, →→${right.valuenow}, ↑→${up.valuenow}, ←→${left.valuenow}, End→${end.valuenow} «${end.valuetext}»`);
        note(Number(home.valuenow) === 0, `${name}: Home ставит 0`);
        note(Math.abs(Number(right.valuenow) - step) < 1e-6, `${name}: → добавляет ступень ${step}`);
        note(Math.abs(Number(up.valuenow) - 2 * step) < 1e-6, `${name}: ↑ тоже увеличивает (APG)`);
        note(Math.abs(Number(left.valuenow) - step) < 1e-6, `${name}: ← уменьшает`);
        note(Number(end.valuenow) === maxD, `${name}: End ставит максимум ${maxD}`);
        note(end.role === "slider" && !!end.arialabel && end.valuemin === "0" && Number(end.valuemax) === maxD,
          `${name}: ARIA-каркас цел (role=${end.role}, label «${end.arialabel}», ${end.valuemin}…${end.valuemax})`);
        note(/дптр|диоптри/.test(end.valuetext || ""), `${name}: aria-valuetext словами — «${end.valuetext}»`);
      }

      /* --- 7. Поворот экрана: размытый слой не стирается --- */
      console.log("\n──── ПОВОРОТ ЭКРАНА (ресайз) ────");
      await scrollTo(0);
      const before = await dragTo(0, 6, 6);
      await call("Emulation.setDeviceMetricsOverride", { width: H, height: W, deviceScaleFactor: DSF, mobile: true });
      await sleep(3000);
      await scrollTo(0, 40);
      const land = await state(0);
      const lframe = await shot("far-d6-landscape");
      // Слева от шва обязано быть размыто: сравним резкость (дисперсия) двух половин
      const sharpness = (frame, rect, side) => {
        const { raw, info } = frame;
        const x0 = (side === "L" ? rect.l + rect.w * 0.08 : rect.l + rect.w * 0.62) * DSF;
        const x1 = (side === "L" ? rect.l + rect.w * 0.38 : rect.l + rect.w * 0.92) * DSF;
        const y0 = (rect.t + rect.h * 0.25) * DSF, y1 = (rect.t + rect.h * 0.6) * DSF;
        let s = 0, n = 0;
        for (let y = Math.round(y0); y < Math.round(y1); y++) {
          for (let x = Math.round(x0); x < Math.round(x1) - 1; x++) {
            const i0 = (y * info.width + x) * info.channels, i1 = i0 + info.channels;
            s += Math.abs(raw[i0] - raw[i1]); n++;
          }
        }
        return n ? s / n : NaN;
      };
      const lL = sharpness(lframe, land.rect, "L"), lR = sharpness(lframe, land.rect, "R");
      console.log(`  после поворота: valuenow=${land.valuenow}, канвас ${land.canvasW}px буфер / ${land.canvasCssW}css, контраст L ${lL.toFixed(2)} против R ${lR.toFixed(2)}`);
      note(land.hasCanvas && land.canvasCssW > 700, `канвас пережил ресайз и пересобрался под новую ширину (${land.canvasCssW} css px)`);
      note(lL < lR * 0.7, `размытый слой на месте после поворота (левая половина мягче: ${lL.toFixed(2)} против ${lR.toFixed(2)})`);
      note(land.hasHalation, "слой светов пережил поворот");
      await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: true });
    }

    if (MODE === "reduce") {
      console.log(`\n──── REDUCE-ПРОХОД: prefers-reduced-motion=reduce, ${W}×${H} @${DSF}x ────`);
      await scrollTo(0);
      for (let k = 0; k < 40; k++) {
        if (await ev(`${HANDLE(0)}.getAttribute('tabindex')==='0'`)) break;
        await sleep(500);
      }
      const st0 = await state(0);
      const st6 = await dragTo(0, 6, 6);
      await shot("reduce-far-d6");
      await shot("reduce-far-d6-crop", { x: Math.round(st6.rect.l), y: Math.round(st6.rect.t), width: Math.round(st6.rect.w), height: Math.round(st6.rect.h), scale: 1 });
      const st0b = await dragTo(0, 0, 6);
      await shot("reduce-far-d0");
      console.log(`reduce: старт ${st0.valuenow} → протяжка ${st6.valuenow} «${st6.valuetext}» → назад ${st0b.valuenow}`);
      note(Number(st6.valuenow) === 6 && Number(st0b.valuenow) === 0, "шторка ФУНКЦИОНАЛЬНА в reduce (значения ходят до упоров)");
      note(st6.caption && st6.caption.length > 0, `подпись состояния жива: «${st6.caption}»`);
      note(st6.hasHalation, "слой светов в reduce остаётся (это часть дефекта, а не движение)");
      note(Math.abs(Number(st6.halOpacity) - 1) < 0.02, `в reduce прозрачность слоя следует за силой: ${st6.halOpacity}`);
      const vib = await ev("window.__vib.length");
      note(vib === 0, `гаптика в reduce молчит: вибраций ${vib}`);
      const hint = await ev(`(()=>{const c=${SIM(0)}; const s=[...c.querySelectorAll('span')].map(x=>x.textContent.trim()); return s.join(' | ');})()`);
      console.log(`  подписи в кадре: ${hint}`);
    }

    if (MODE === "fallback") {
      console.log(`\n──── CSS-ФОЛБЭК (WebGL отказал): слой светов и размытие обязаны совпасть ────`);
      await scrollTo(0);
      for (let k = 0; k < 40; k++) {
        if (await ev(`${HANDLE(0)}.getAttribute('tabindex')==='0'`)) break;
        await sleep(500);
      }
      const st = await dragTo(0, 6, 6);
      note(!st.hasCanvas, `канваса нет — работает честный CSS-фолбэк (hasCanvas=${st.hasCanvas})`);
      note(st.hasHalation, "слой светов в фолбэке на месте");
      const scaleInner = await ev(`(()=>{const h=${SIM(0)}.querySelector('img[data-halation]');
        return getComputedStyle(h.parentElement).transform;})()`);
      const blurInner = await ev(`(()=>{const ns=[...${SIM(0)}.querySelectorAll('div')]
        .filter(d=>/scale-105/.test(d.className)); return ns.length;})()`);
      console.log(`  трансформ внутреннего узла слоя: ${scaleInner}; узлов scale-105 в кадре: ${blurInner}`);
      note(/matrix\(1\.05/.test(scaleInner || ""), `слой светов масштабирован как размываемый (${scaleInner})`);
      /* ⚠️ СОВПАДЕНИЕ ДОКАЗЫВАЕТСЯ ГЕОМЕТРИЕЙ, А НЕ КОРРЕЛЯЦИЕЙ ЯРКОСТЕЙ.
         Проба «где лучше всего ложится прибавка света» провалила собственный
         контроль (в ЦЕНТРЕ кадра пятипроцентный масштаб сдвига не даёт вообще,
         а метод показал −32 px) — она искала совпадение двух РАЗНЫХ функций
         (порогованный разлив против яркости кадра) и находила случайный
         максимум. Прямая мера: рамка отрисованного `<img>` слоя против рамки
         базового `<img>` плюс равенство их собственных пропорций — при
         одинаковом боксе и одинаковом `object-fit: cover` отображение
         совпадает тождественно. */
      const geo = await ev(`(()=>{const c=${SIM(0)};
        const h=c.querySelector('img[data-halation]');
        const b=[...c.querySelectorAll('img:not([data-halation])')];
        const rb=b.map(n=>{const r=n.getBoundingClientRect();
          return {r:[+r.left.toFixed(2),+r.top.toFixed(2),+r.width.toFixed(2),+r.height.toFixed(2)],
                  nat:[n.naturalWidth,n.naturalHeight], fit:getComputedStyle(n).objectFit};});
        const rh=(()=>{const r=h.getBoundingClientRect();
          return {r:[+r.left.toFixed(2),+r.top.toFixed(2),+r.width.toFixed(2),+r.height.toFixed(2)],
                  nat:[h.naturalWidth,h.naturalHeight], fit:getComputedStyle(h).objectFit};})();
        return {base:rb, hal:rh};})()`);
      console.log(`  базовые <img>: ${JSON.stringify(geo.base)}`);
      console.log(`  слой светов:   ${JSON.stringify(geo.hal)}`);
      const blurred = geo.base[geo.base.length - 1]; // размываемый слой фолбэка
      const sameBox = JSON.stringify(blurred.r) === JSON.stringify(geo.hal.r);
      const aspB = blurred.nat[0] / blurred.nat[1], aspH = geo.hal.nat[0] / geo.hal.nat[1];
      note(sameBox, `рамка слоя светов совпадает с рамкой размываемого кадра: ${JSON.stringify(geo.hal.r)} против ${JSON.stringify(blurred.r)}`);
      note(Math.abs(aspB - aspH) < 0.002, `пропорции исходников равны (${aspB.toFixed(4)} против ${aspH.toFixed(4)}) — cover обрезает одинаково`);
      note(blurred.fit === geo.hal.fit, `одинаковый object-fit: ${blurred.fit} / ${geo.hal.fit}`);
      const on = await shot("fallback-d6-on");
      await ev(`(()=>{const h=${SIM(0)}.querySelector('img[data-halation]');
        h.parentElement.parentElement.style.visibility='hidden'; return 0;})()`);
      await sleep(700);
      await shot("fallback-d6-off");
      await ev(`(()=>{const h=${SIM(0)}.querySelector('img[data-halation]');
        h.parentElement.parentElement.style.visibility=''; return 0;})()`);
      console.log(`  кадры: ${on.file} и tmp-frames/priem7-fallback-d6-off.png (рект ${JSON.stringify(st.rect)})`);
    }

    if (MODE === "rail") {
      /* ДЕСКТОП: перехват рельсом «Шкалы наводки» правой части кадра.
         Известное пре-существующее наблюдение — здесь оно ЧИСЛОМ: сколько
         пикселей кадра недоступны клику и что лежит в точке 0,97 ширины. */
      console.log(`\n──── РЕЛЬС ПРОТИВ КАДРА (десктоп ${W}×${H}) ────`);
      await scrollTo(0);
      for (let k = 0; k < 40; k++) {
        if (await ev(`${HANDLE(0)}.getAttribute('tabindex')==='0'`)) break;
        await sleep(500);
      }
      const r = await ev(`(()=>{const c=${SIM(0)}; const cr=c.getBoundingClientRect();
        const rail=document.querySelector('.rail-list');
        const rr=rail?rail.getBoundingClientRect():null;
        const hit=(fx)=>{const el=document.elementFromPoint(Math.round(cr.left+cr.width*fx), Math.round(cr.top+cr.height*0.5));
          return el?(el.className&&el.className.toString().slice(0,40))||el.tagName:'нет';};
        return {cont:[cr.left,cr.right,cr.width], rail: rr?[rr.left,rr.right,rr.width]:null,
                at50:hit(0.5), at90:hit(0.9), at97:hit(0.97), at99:hit(0.99)};})()`);
      console.log(`  кадр ${JSON.stringify(r.cont)}  рельс ${JSON.stringify(r.rail)}`);
      console.log(`  что под курсором: 0,50 → ${r.at50} · 0,90 → ${r.at90} · 0,97 → ${r.at97} · 0,99 → ${r.at99}`);
      /* ⚠️ РЕЛЬСА МОЖЕТ НЕ БЫТЬ — И ЭТО ИСХОД «СУДИТЬ НЕЧЕМ», НЕ НОЛЬ.
         На мобильной ширине узел рельса в документе есть, но его рамка
         нулевая; тогда `cont.right − rail.left` вырождается в ВСЮ ширину
         кадра, и прибор печатал «перехвачено 107 % ширины», отчитываясь
         «все проверки пройдены». Невозможное число обязано роняить прогон:
         этот режим осмыслен только там, где рельс отрисован (≥1280). */
      if (!r.rail || r.rail[2] < 1) {
        note(false, `СУДИТЬ НЕЧЕМ: рельса на ширине ${W} нет (рамка ${JSON.stringify(r.rail)}) — ` +
          `гонять этот режим с W=1280 и больше`);
      } else {
        const overlap = Math.max(0, Math.min(r.cont[2], r.cont[1] - r.rail[0]));
        const share = (overlap / r.cont[2]) * 100;
        if (r.cont[1] - r.rail[0] > r.cont[2])
          note(false, `перехват ${(r.cont[1] - r.rail[0]).toFixed(0)} px ШИРЕ самого кадра ` +
            `(${r.cont[2].toFixed(0)} px) — окно замера не там, где думает прибор`);
        else
          console.log(`  перехваченная полоса кадра: ${overlap.toFixed(0)} px справа (${share.toFixed(1)} % ширины)`);
      }
    }

    if (MODE === "touch") {
      /* ТАЧ-ЧЕСТНОСТЬ: вертикальный жест ПАЛЬЦЕМ по кадру обязан скроллить
         страницу (touch-action: pan-y), а шторку — не трогать. */
      console.log(`\n──── ТАЧ-ЧЕСТНОСТЬ: вертикальный жест по кадру ────`);
      await scrollTo(0);
      for (let k = 0; k < 40; k++) {
        if (await ev(`${HANDLE(0)}.getAttribute('tabindex')==='0'`)) break;
        await sleep(500);
      }
      /* ⚠️ КОНТРОЛЬ ПЕРВЫМ: умеет ли прибор вообще скроллить эту страницу
         тач-жестом (Lenis + headless). Не умеет — исход «СУДИТЬ НЕЧЕМ», а не
         «кадр съел скролл»: иначе критерий сравнивал бы ноль с нулём. */
      const st = await state(0);
      const cy0 = await ev("Math.round(window.scrollY)");
      await call("Input.synthesizeScrollGesture", {
        x: Math.round(st.rect.l + st.rect.w * 0.5),
        y: Math.round(st.rect.t - 60), // текст ВЫШЕ кадра, обычная страница
        yDistance: -260, gestureSourceType: "touch", speed: 800,
      });
      await sleep(2500);
      const cy1 = await ev("Math.round(window.scrollY)");
      const canScroll = Math.abs(cy1 - cy0) > 120;
      console.log(`  контроль (жест по обычному тексту): scrollY ${cy0} → ${cy1}`);
      if (!canScroll) {
        console.log("⚖️  СУДИТЬ НЕЧЕМ: тач-скролл не работает и ВНЕ кадра — прибор не умеет скроллить эту страницу пальцем, вердикт о краже скролла невозможен");
      }
      await ev(`window.scrollTo(0, ${cy0}); 0`);
      await sleep(1500);
      const y0 = await ev("Math.round(window.scrollY)");
      const v0 = (await state(0)).valuenow;
      await call("Input.synthesizeScrollGesture", {
        x: Math.round(st.rect.l + st.rect.w * 0.5),
        y: Math.round(st.rect.t + st.rect.h * 0.5),
        yDistance: -260, gestureSourceType: "touch", speed: 800,
      });
      await sleep(2500);
      const y1 = await ev("Math.round(window.scrollY)");
      const st1 = await state(0);
      console.log(`  scrollY ${y0} → ${y1}; valuenow ${v0} → ${st1.valuenow}`);
      if (canScroll) note(Math.abs(y1 - y0) > 120, `вертикальный жест ПО КАДРУ скроллит страницу (${y0} → ${y1})`);
      note(st1.valuenow === v0, `тот же жест НЕ двигает шторку (осталось ${st1.valuenow})`);
      // Горизонтальный тач-жест наоборот — обязан двигать шторку
      const before = await state(0);
      await call("Input.synthesizeScrollGesture", {
        x: Math.round(before.rect.l + before.rect.w * 0.5),
        y: Math.round(before.rect.t + before.rect.h * 0.5),
        xDistance: -160, yDistance: 0, gestureSourceType: "touch", speed: 800,
      });
      await sleep(2000);
      const after = await state(0);
      const yAfter = await ev("Math.round(window.scrollY)");
      console.log(`  горизонтальный жест: valuenow ${before.valuenow} → ${after.valuenow}, scrollY ${yAfter}`);
      note(after.valuenow !== before.valuenow, `горизонтальный жест достаётся шторке (${before.valuenow} → ${after.valuenow})`);
    }

    console.log("\n──────── ИТОГ ────────");
    if (fail.length) {
      console.log(`ПРОВАЛОВ: ${fail.length}`);
      fail.forEach((f) => console.log(" · " + f));
    } else console.log("все проверки этого прогона пройдены");
    ws.socket.end();
    process.exitCode = fail.length ? 1 : 0;
  } finally { chrome.kill(); }
}
main().catch((e) => { console.error("ПРОГОН УПАЛ:", e); process.exit(2); });

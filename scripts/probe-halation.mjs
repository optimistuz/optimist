/**
 * ПРИБОР ХАЛЯЦИИ СВЕТОВ (этап 6, шаг 7).
 *
 * ⚠️ ЗАЧЕМ ПРИБОР ТАМ, ГДЕ «И ТАК ВИДНО». Слой светов кладётся через
 * `mix-blend-mode: screen`, а под `screen` СВЕТЛЕЕТ ВСЁ, что в слое не
 * абсолютно чёрное. В запечённом `street-highlights.jpg` чистого нуля
 * только 54,6 % площади: остальное — хвосты разлива и звон JPEG на уровне
 * 1…8 из 255. Значит у эффекта есть ровно два исхода, и на глаз они
 * неразличимы: либо СВЕТ, вырвавшийся за свои границы (то, что описывает
 * канон как физику миопии), либо ПЕЛЕНА, ровно поднявшая всю тёмную
 * половину кадра. Второе — «аляповатое свечение» из запрещённого списка,
 * и отличить одно от другого можно только числом.
 *
 * МЕТОД (по законам приёмки CLAUDE.md):
 *  · замер идёт на ОДНОМ И ТОМ ЖЕ участке кадра ПЕРЕКЛЮЧЕНИЕМ СЛОЯ
 *    (`visibility: hidden` на обёртке халяции), а не сравнением двух
 *    сторон шторки: по разные стороны шва лежат разные куски изображения,
 *    и такой замер мерил бы сюжет, а не эффект;
 *  · окно замера берётся в ФИЗИЧЕСКИХ пикселях (rect × deviceScaleFactor):
 *    снимок приходит в них, и CSS-окно на плотном экране уехало бы в угол
 *    страницы — на этом проект уже однажды получил «Δ = 0, непрерывно»;
 *  · ступень прибор спрашивает У ИЗМЕРЯЕМОЙ СИСТЕМЫ (`aria-valuenow`),
 *    а не считает своей копией арифметики: разойдись они — прибор сверял
 *    бы вердикт с самим собой.
 *
 * ПРЕДОХРАНИТЕЛИ (каждый РОНЯЕТ прогон, а не оговаривает результат):
 *  1. СЛОЙ ЕСТЬ В DOM и его картинка ДЕКОДИРОВАНА. Иначе прибор измерил бы
 *     страницу без эффекта и торжественно доложил «пелены нет».
 *  2. РОВНО ОДИН слой на странице (у книги светов нет и быть не должно) —
 *     отрицательный контроль на месте, а не в комментарии.
 *  3. ПЕРЕКЛЮЧЕНИЕ ЧТО-ТО МЕНЯЕТ на максимуме дефекта. Ноль здесь — это
 *     «НЕ ИЗМЕРЕНО» (слой не рисуется, blend не сработал, кадр не тот),
 *     а не «эффект чист».
 *  4. СТУПЕНЬ СОВПАЛА с заказанной: клик по доле ширины мог промахнуться,
 *     и тогда числа относились бы к другим диоптриям.
 *  5. ВЫРОЖДЕННАЯ СЕРИЯ: одинаковые числа на −1/−3/−6 — это не «сила
 *     постоянна», это «мерили одно и то же место».
 *
 * Нужен живой `npm run dev` на :3000 (прибор ходит по dev-сборке — ему
 * нужны пиксели, а не вес).
 *
 *   node scripts/probe-halation.mjs
 *
 * Переменные: DSF (плотность, 1|2), W/H (вьюпорт), BASE, KEEP=1 (оставить PNG).
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import sharp from "sharp";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9784;
const OUT = process.env.OUTDIR || "tmp-frames";
const DSF = Number(process.env.DSF || 1);
const W = Number(process.env.W || 1280);
const H = Number(process.env.H || 1000);
const KEEP = process.env.KEEP === "1";
/** Ступени, на которых снимаются кадры приёмки (§ шаг 7 plan.md). */
const STEPS = [0, 1, 3, 6];
const MAXD = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (msg) => {
  console.error("\n❌ ПРОГОН УПАЛ: " + msg);
  process.exit(1);
};

/* ---------- CDP по сырому WebSocket (как shot-site.mjs / cdp-audit.mjs) ---------- */
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

/* ---------- статистика по окну кадра ---------- */
/** Яркость Rec.709 в окне [x0,x1)×[y0,y1) физических пикселей. */
function lumWindow(raw, info, x0, y0, x1, y1) {
  const ch = info.channels;
  const out = new Float64Array(Math.max(0, (x1 - x0) * (y1 - y0)));
  let n = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * info.width * ch;
    for (let x = x0; x < x1; x++) {
      const i = row + x * ch;
      out[n++] = 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
    }
  }
  return out.subarray(0, n);
}

function quantiles(arr) {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  const at = (q) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  let neg = 0;
  for (const v of s) if (v < -2) neg++;
  return {
    med: at(0.5),
    p90: at(0.9),
    p99: at(0.99),
    max: s[s.length - 1],
    min: s[0],
    p01: at(0.01),
    /** Доля пикселей, ЗАТЕМНЁННЫХ более чем на 2 уровня, %. */
    negShare: (neg / s.length) * 100,
    n: s.length,
  };
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=" + process.env.TEMP + "\\optimist-probe-halation",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--window-size=1920,1200",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const shots = [];
  try {
    let targets = null;
    for (let i = 0; i < 50 && !targets; i++) {
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
    ws.listeners.add((raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
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
      if (exceptionDetails) die("JS в странице упал: " + exceptionDetails.text);
      return result?.value;
    };
    const shot = async (label) => {
      const { data } = await call("Page.captureScreenshot", { format: "png" });
      const buf = Buffer.from(data, "base64");
      const file = `${OUT}/halation-${label}.png`;
      fs.writeFileSync(file, buf);
      shots.push(file);
      const { data: raw, info } = await sharp(buf)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { raw, info, file };
    };

    await call("Page.enable");
    await call("Runtime.enable");
    /**
     * ⚠️ КЭШ БРАУЗЕРА ВЫКЛЮЧЕН, И ЭТО НЕ ПЕДАНТИЗМ. `user-data-dir` прибора
     * переиспользуется между прогонами, поэтому оптимизированный кадр слоя
     * лежал в дисковом кэше Chrome. Слой перепекли с ДРУГИМ радиусом разлива —
     * а прибор выдал те же числа ДО ПОСЛЕДНЕГО ЗНАКА (мед 0,00 · p99 8,28 ·
     * макс 13,79 на всех трёх ступенях): он честно измерил ПРЕЖНИЙ ассет.
     * По закону приёмки совпадение серии до последнего знака — это
     * «НЕ ИЗМЕРЕНО», и здесь оно было ровно им.
     */
    await call("Network.enable");
    await call("Network.setCacheDisabled", { cacheDisabled: true });
    await call("Emulation.setDeviceMetricsOverride", {
      width: W,
      height: H,
      deviceScaleFactor: DSF,
      mobile: false,
    });
    await call("Page.navigate", { url: BASE + "/" });
    await sleep(4200); // загрузка + прелоадер + холодная компиляция dev

    /** Селектор кадра близорукости — через ARIA-узел ползунка, не через классы. */
    const SIM = `document.querySelector('[role="slider"][aria-label="Сила близорукости в диоптриях"]').parentElement`;

    /**
     * ⚠️ СМЕШИВАЕМЫЙ УЗЕЛ ИЩЕТСЯ ОБХОДОМ ВВЕРХ ДО `mix-blend-mode: screen`,
     * а не берётся как `img.parentElement`. Прибор, знавший «родителя»,
     * сломался от первой же правки продукта: слой обзавёлся ВНУТРЕННИМ узлом
     * под масштаб фолбэк-ветки, и «родителем» стал он. Прибор обязан искать
     * узел по СВОЙСТВУ, за которым пришёл, а не по позиции в дереве.
     */
    await ev(
      `window.__hl = () => { const i=document.querySelector('[data-halation]'); if(!i) return null;
         let n=i.parentElement; while(n && getComputedStyle(n).mixBlendMode!=='screen') n=n.parentElement;
         return n; }; 0`
    );

    // Доезд: кадр целиком во вьюпорте (Lenis успевает встать за паузу).
    for (let k = 0; k < 6; k++) {
      await ev(
        `(()=>{const el=${SIM}; const r=el.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + r.top - Math.max(24,(innerHeight-r.height)/2)); return 0;})()`
      );
      await sleep(350);
    }

    /* Ждём декодирования слоя. ⚠️ Это ОЖИДАНИЕ, а не поблажка предохранителю:
       dev-сервер генерирует оптимизированный кадр по первому запросу (секунды),
       и «не декодирован» здесь значило бы «прибор торопится», а не «эффекта
       нет». Не дождались за 20 с — предохранитель ниже роняет прогон. */
    for (let k = 0; k < 40; k++) {
      const ok = await ev(
        `(()=>{const i=document.querySelector('[data-halation]');
          return !!(i && i.complete && i.naturalWidth>0);})()`
      );
      if (ok) break;
      await sleep(500);
    }

    // --- Предохранитель 1–2: слой есть, декодирован, и он ОДИН на странице ---
    const pre = await ev(`(()=>{
      const all=[...document.querySelectorAll('[data-halation]')];
      const img=all[0]||null;
      const box=${SIM}.getBoundingClientRect();
      const cvs=${SIM}.querySelector('canvas');
      return {count:all.length,
        complete: img? (img.complete && img.naturalWidth>0):false,
        nat: img? [img.naturalWidth,img.naturalHeight]:null,
        src: img? img.currentSrc||img.src : null,
        inside: img? ${SIM}.contains(img):false,
        blend: img? getComputedStyle(window.__hl()).mixBlendMode : null,
        box:[box.left,box.top,box.width,box.height],
        gl: !!cvs, glW: cvs? cvs.width:0};})()`);

    console.log(`\nСТЕНД: ${W}×${H} @${DSF}x, dev-сборка ${BASE}`);
    if (!pre || pre.count === 0)
      die(
        "слоя халяции нет в DOM ([data-halation]). Прибор без него измерил бы " +
          "страницу без эффекта и доложил бы «пелены нет»"
      );
    if (pre.count !== 1)
      die(
        `слоёв халяции ${pre.count}, ожидался РОВНО ОДИН: света запечены только ` +
          `для улицы, у книги в помещении разливаться нечему`
      );
    if (!pre.inside) die("слой халяции лежит ВНЕ кадра симулятора — blend смешается не с тем");
    if (!pre.complete)
      die(
        `картинка слоя не декодирована (${pre.src}) — пиксели её ещё не видели, ` +
          `а Δ вышла бы нулевой по причине, не имеющей отношения к эффекту`
      );
    if (pre.blend !== "screen") die(`mix-blend-mode обёртки слоя = «${pre.blend}», ожидался «screen»`);
    console.log(
      `слой: ${pre.src}  ${pre.nat[0]}×${pre.nat[1]}  blend=${pre.blend}  ` +
        `ветка расфокуса: ${pre.gl ? `GL (канвас ${pre.glW}px)` : "CSS-фолбэк"}`
    );

    /**
     * ⚠️ СВЕРКА «ЧТО ОТДАНО» С «ЧТО НА ДИСКЕ». Выключенного кэша мало: между
     * страницей и файлом стоит оптимизатор next/image со СВОИМ кэшем на диске
     * (`.next/cache/images`), и он тоже умеет отдать прошлую версию ассета.
     * Прибор обязан доказать, что мерил ТЕКУЩИЙ слой, а не воспоминание о нём.
     * Сигнатура — доля чистого чёрного и максимум яркости после приведения
     * к одной ширине: она не чувствительна к перекодированию (JPEG→WebP),
     * но радиус разлива меняет её сразу (σ 40 → 24 сдвинул чёрное 54,6 → 62,3 %).
     */
    const sig = async (buf) => {
      const { data, info } = await sharp(buf)
        .removeAlpha()
        .resize(320)
        .raw()
        .toBuffer({ resolveWithObject: true });
      let black = 0;
      let mx = 0;
      const n = info.width * info.height;
      for (let i = 0; i < data.length; i += info.channels) {
        const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (l < 1) black++;
        if (l > mx) mx = l;
      }
      return { black: (black / n) * 100, mx };
    };
    const served = await new Promise((res, rej) => {
      const u = new URL(pre.src);
      http
        .get({ host: u.hostname, port: u.port, path: u.pathname + u.search }, (r) => {
          const bufs = [];
          r.on("data", (c) => bufs.push(c));
          r.on("end", () => res({ buf: Buffer.concat(bufs), code: r.statusCode }));
        })
        .on("error", rej);
    });
    if (served.code !== 200) die(`слой отдан с кодом ${served.code} — мерить нечего`);
    const diskPath =
      "public" + decodeURIComponent(new URL(pre.src).searchParams.get("url") || "");
    if (!fs.existsSync(diskPath)) die(`файла слоя нет на диске: ${diskPath}`);
    const [sServed, sDisk] = [await sig(served.buf), await sig(fs.readFileSync(diskPath))];
    const dBlack = Math.abs(sServed.black - sDisk.black);
    const dMax = Math.abs(sServed.mx - sDisk.mx);
    console.log(
      `сверка с диском: чёрное ${sServed.black.toFixed(2)} % против ${sDisk.black.toFixed(2)} %, ` +
        `максимум ${sServed.mx.toFixed(1)} против ${sDisk.mx.toFixed(1)} (${diskPath})`
    );
    if (dBlack > 1.5 || dMax > 6)
      die(
        `страница получила НЕ ТОТ слой, что лежит на диске (расхождение ` +
          `${dBlack.toFixed(2)} п.п. чёрного, ${dMax.toFixed(1)} по максимуму). ` +
          `Вероятнее всего кэш оптимизатора: удалить .next/cache/images и повторить`
      );

    const rows = [];
    const floorRows = [];
    for (const D of STEPS) {
      /* ⚠️ ШТОРКУ ВЕДЁМ ПЕРЕТАСКИВАНИЕМ, А НЕ КЛИКОМ В ТОЧКУ. На 1280 px правая
         часть кадра уходит под «Шкалу наводки» — хром у правой кромки вьюпорта,
         занимающий полосу во всю высоту. Клик в 0,97 ширины попадал В РЕЛЬС:
         шторка вставала на 5,5, а числа поехали бы под подписью «−6 дптр»
         (предохранитель поймал). Человеку это не мешает — он берётся за шторку
         и ТЯНЕТ, а `setPointerCapture` отдаёт все движения кадру, чей бы хром
         ни лежал сверху. Прибор делает то же самое.
         ⚠️ Перед отпусканием ПАУЗА 250 мс: инерция шага 4 учитывает бросок
         только по свежему хвосту (<120 мс), иначе рывок мыши уносил бы позицию
         в упор — и ступень опять была бы не та, что заказана. */
      const xs = await ev(
        `(()=>{const r=${SIM}.getBoundingClientRect();
          return [Math.round(r.left+r.width*0.5), Math.round(r.left+r.width*${Math.min(
            0.995,
            Math.max(0.004, D / MAXD)
          )}), Math.round(r.top+r.height*0.5)];})()`
      );
      const [xFrom, xTo, yMid] = xs;
      const at = [xTo, yMid];
      await call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: xFrom,
        y: yMid,
        button: "left",
        buttons: 1,
        clickCount: 1,
        pointerType: "mouse",
      });
      for (let k = 1; k <= 5; k++) {
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: Math.round(xFrom + ((xTo - xFrom) * k) / 5),
          y: yMid,
          button: "left",
          buttons: 1,
          pointerType: "mouse",
        });
        await sleep(60);
      }
      await sleep(250);
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: xTo,
        y: yMid,
        button: "left",
        buttons: 0,
        clickCount: 1,
        pointerType: "mouse",
      });
      await sleep(900); // пружинный доснап позиции (шаг 4) + финальный кадр GL

      // --- Предохранитель 4: ступень СПРАШИВАЕМ У СИСТЕМЫ ---
      const state = await ev(`(()=>{const h=document.querySelector('[role="slider"][aria-label="Сила близорукости в диоптриях"]');
        const el=${SIM}; const r=el.getBoundingClientRect();
        const hr=h.getBoundingClientRect();
        const hit=document.elementFromPoint(${at[0]},${at[1]});
        const lay=document.querySelector('[data-halation]');
        return {now:Number(h.getAttribute('aria-valuenow')), text:h.getAttribute('aria-valuetext'),
          box:[r.left,r.top,r.width,r.height], line:hr.left-r.left,
          op: lay? Number(getComputedStyle(window.__hl()).opacity):null,
          hit: hit? hit.tagName+'.'+(hit.className||'').toString().slice(0,60):null};})()`);
      /**
       * ⚠️ ПРОЗРАЧНОСТЬ ЧИТАЕТСЯ СО СЛОЯ, а не выводится из пикселей. Рубеж
       * «при 0 дптр слоя нет» проходил по ДВУМ причинам сразу: при положении 0
       * `clip-path` равен `inset(0 100% 0 0)`, то есть слой обрезан в ноль
       * независимо от прозрачности. Гейт читался как «прозрачность точно
       * нулевая», а доказывал лишь «показывать нечего» — появись пол
       * прозрачности (0,1), прибор бы его не заметил (нашёл `fizik`).
       * Здесь сверяется САМ закон: прозрачность = сила дефекта без множителей.
       */
      if (state.op === null) die("не нашёл узел слоя, чтобы прочесть прозрачность");
      const want = D / MAXD;
      if (Math.abs(state.op - want) > 0.01)
        die(
          `прозрачность слоя ${state.op} против силы дефекта ${want.toFixed(3)} — ` +
            `закон «прозрачность = сила дефекта, без множителей» нарушен`
        );
      if (Math.abs(state.now - D) > 1e-6)
        die(
          `заказана ступень ${D} дптр, система показывает ${state.now} — клик по доле ` +
            `ширины промахнулся, и числа относились бы к другим диоптриям.\n` +
            `   кадр [${state.box.map((v) => Math.round(v)).join(", ")}], клик (${at[0]}, ${at[1]}), ` +
            `под курсором ${state.hit}, линия шторки на ${Math.round(state.line)} px`
        );

      const on = await shot(`d${D}-on`);
      await ev(`(()=>{window.__hl().style.visibility='hidden'; return 0;})()`);
      await sleep(450);
      const off = await shot(`d${D}-off`);
      await ev(`(()=>{window.__hl().style.visibility=''; return 0;})()`);
      await sleep(250);

      // Окно замера — в ФИЗИЧЕСКИХ пикселях снимка.
      const [bl, bt, bw, bh] = state.box;
      const X0 = Math.max(0, Math.round(bl * DSF));
      const Y0 = Math.max(0, Math.round(bt * DSF));
      const X1 = Math.min(on.info.width, Math.round((bl + bw) * DSF));
      const Y1 = Math.min(on.info.height, Math.round((bt + bh) * DSF));
      if (X1 - X0 < 64 || Y1 - Y0 < 64)
        die(`окно замера выродилось (${X1 - X0}×${Y1 - Y0} px) — кадр не во вьюпорте`);
      // Шов: позиция линии шторки в физических пикселях снимка.
      const SEAM = Math.round((bl + state.line) * DSF);

      const dark = [];
      const lumOn = lumWindow(on.raw, on.info, X0, Y0, X1, Y1);
      const lumOff = lumWindow(off.raw, off.info, X0, Y0, X1, Y1);
      const wpx = X1 - X0;
      const left = [];
      const right = [];
      for (let i = 0; i < lumOn.length; i++) {
        const d = lumOn[i] - lumOff[i];
        const x = X0 + (i % wpx);
        // Полосу ±2 px вокруг шва исключаем: там субпиксельная линия-ручка,
        // и её сглаживание — не эффект, а край собственного элемента.
        if (x < SEAM - 2) left.push(d);
        else if (x > SEAM + 2) right.push(d);
        dark.push(d);
      }
      const qL = quantiles(left);
      const qR = quantiles(right.map(Math.abs));
      rows.push({ D, valueText: state.text, seam: SEAM - X0, qL, qR, wpx });

      const fmt = (q) =>
        q
          ? `мин ${q.min.toFixed(2)}  мед ${q.med.toFixed(2)}  p90 ${q.p90.toFixed(2)}  p99 ${q.p99.toFixed(2)}  макс ${q.max.toFixed(2)}`
          : "—";
      console.log(
        `\n${state.text} (прозрачность слоя ${state.op}):` +
          `\n  расфокус (слева от шва, ${qL ? qL.n : 0} px):  ${fmt(qL)}` +
          `\n  РЕЗКАЯ сторона |Δ| (${qR ? qR.n : 0} px):      ${fmt(qR)}`
      );

      /**
       * ---- ПОЛ ГРУППЫ СМЕШИВАНИЯ (регрессия, найденная `fizik`) ----
       *
       * `screen` смешивается с backdrop-ом группы, а при ПОЛНОСТЬЮ ПРОЗРАЧНОМ
       * backdrop формула композитинга даёт ИСХОДНИК — почти чёрную маску
       * светов. Пока базовое фото не нарисовано, слой ложился тёмной плитой
       * на пол-кадра (замер: 128,8 против 249,0 на резкой стороне).
       *
       * КРИТЕРИЙ БЕЗ НАЗНАЧЕННОГО ПОРОГА: **`screen` не имеет права темнить.**
       * Осветлять — его работа, темнить он может ровно одним способом — через
       * дырявый пол группы. Поэтому мерим минимум Δ, а не «похоже ли на плиту».
       *
       * Два случая, и второй обязателен: снятие `isolate` починкой НЕ является —
       * во время `imageReveal` у обёртки opacity < 1, она сама становится
       * корнем группы, и плита возвращается.
       */
      if (D === 3) {
        /* «Фону нечем быть» — прячем ВСЁ, что могло бы им стать: базовый кадр,
           слой CSS-фолбэка и канвас Kawase. ⚠️ Одного базового `<img>` не
           хватает: канвас держит УЖЕ ЗАХВАЧЕННУЮ текстуру и остаётся
           непрозрачным фоном, то есть проба мерила бы исправный случай
           и всегда проходила. */
        const hideBg = `(()=>{const ns=[...${SIM}.querySelectorAll('img:not([data-halation]), canvas')];
          ns.forEach(n=>n.style.visibility='hidden'); return ns.length;})()`;
        const showBg = `(()=>{[...${SIM}.querySelectorAll('img:not([data-halation]), canvas')]
          .forEach(n=>n.style.visibility=''); return 0;})()`;
        const dimAncestor = `(()=>{const p=${SIM}.parentElement; if(p) p.style.opacity='0.99'; return !!p;})()`;
        const undimAncestor = `(()=>{const p=${SIM}.parentElement; if(p) p.style.opacity=''; return 0;})()`;
        const dropFloor = `(()=>{${SIM}.style.backgroundColor='transparent'; return 1;})()`;
        const restoreFloor = `(()=>{${SIM}.style.backgroundColor=''; return 0;})()`;
        const hideLayer = `(()=>{window.__hl().style.visibility='hidden'; return 0;})()`;
        const showLayer = `(()=>{window.__hl().style.visibility=''; return 0;})()`;

        const caseFloor = async (label, setup, teardown, expectDark) => {
          const ok = await ev(setup);
          if (!ok) die(`не смог воспроизвести случай «${label}» — узлов нет`);
          await sleep(500);
          const withLayer = await shot(`floor-${label}-on`);
          await ev(hideLayer);
          await sleep(400);
          const without = await shot(`floor-${label}-off`);
          await ev(showLayer);
          await ev(teardown);
          await sleep(300);
          const a = lumWindow(withLayer.raw, withLayer.info, X0, Y0, SEAM - 2, Y1);
          const b = lumWindow(without.raw, without.info, X0, Y0, SEAM - 2, Y1);
          const d = [];
          for (let i = 0; i < a.length; i++) d.push(a[i] - b[i]);
          const q = quantiles(d);
          floorRows.push({ label, q, expectDark });
          console.log(
            `  «${label}»: мед ${q.med.toFixed(2)}  p01 ${q.p01.toFixed(2)}  ` +
              `мин ${q.min.toFixed(2)}  затемнено ${q.negShare.toFixed(2)} % площади`
          );
        };
        console.log(
          "\nпроба ПОЛА ГРУППЫ смешивания (screen не имеет права темнить; мера — массовая, не один пиксель):"
        );
        await caseFloor("фону-нечем-быть", hideBg, showBg, false);
        await caseFloor(
          "фону-нечем-быть+предок-полупрозрачен",
          `(()=>{const a=${hideBg}; const b=${dimAncestor}; return a&&b;})()`,
          `(()=>{${showBg}; ${undimAncestor}; return 0;})()`,
          false
        );
        /* ⚠️ ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ — гейт доказывается ПАДЕНИЕМ. Тот же
           случай, но пол группы снят руками: слой ОБЯЗАН залить полкадра
           тёмной плитой. Не залил — значит проба слепа, и её «✅» ничего
           не стоит. */
        await caseFloor(
          "контроль:пол-снят",
          `(()=>{const a=${hideBg}; const b=${dropFloor}; return a&&b;})()`,
          `(()=>{${showBg}; ${restoreFloor}; return 0;})()`,
          true
        );
      }
    }

    /* ---------------- ВЕРДИКТЫ ---------------- */
    console.log("\n──────── вердикты ────────");
    let bad = 0;

    const zero = rows.find((r) => r.D === 0);
    const zMax = Math.max(zero.qL ? zero.qL.max : 0, zero.qR ? zero.qR.max : 0);
    if (zMax === 0)
      console.log("✅ 0 дптр: слоя нет НИ ОДНИМ пикселем (Δ = 0 по всему кадру)");
    else {
      console.log(`❌ 0 дптр: слой виден, макс Δ = ${zMax.toFixed(2)} — при нуле дефекта его быть не должно`);
      bad++;
    }

    // Резкая сторона: слой обязан быть срезан clip-path. На −6 её нет вовсе.
    for (const r of rows.filter((x) => x.D > 0 && x.qR && x.qR.n > 500)) {
      if (r.qR.max === 0)
        console.log(`✅ ${r.valueText}: резкая сторона НЕ тронута (|Δ| = 0 на ${r.qR.n} px)`);
      else {
        console.log(
          `❌ ${r.valueText}: слой перелез за шов — |Δ| до ${r.qR.max.toFixed(2)} на резкой стороне`
        );
        bad++;
      }
    }

    /* `screen` осветляет; темнить он может ровно одним способом — через
       прозрачный пол группы, и это ЯВЛЕНИЕ МАССОВОЕ (плита на полкадра).
       ⚠️ Мера — медиана и доля затемнённой площади, а НЕ минимальный пиксель:
       включение слоя перерастеризует поверхность канваса, и считанные
       пиксели по кромкам уходят в минус на исправном коде (мин −8,9 при
       затемнённой доле 0,0х %). Гейт по минимуму забраковал бы годное. */
    for (const r of rows.filter((x) => x.D > 0 && x.qL)) {
      if (r.qL.med >= -0.5 && r.qL.negShare < 1) continue;
      console.log(
        `❌ ${r.valueText}: слой ТЕМНИТ кадр (медиана Δ ${r.qL.med.toFixed(2)}, ` +
          `затемнено ${r.qL.negShare.toFixed(2)} % площади) — прозрачный пол группы`
      );
      bad++;
    }
    if (!floorRows.length) die("проба пола группы не выполнялась — судить нечем");
    const control = floorRows.find((f) => f.expectDark);
    if (!control) die("отрицательного контроля пола не было — «✅» ничего не стоит");
    if (!(control.q.med <= -5 && control.q.negShare > 25))
      die(
        `ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ НЕ СРАБОТАЛ: со снятым полом слой обязан залить ` +
          `полкадра тёмной плитой, а дал медиану ${control.q.med.toFixed(2)} при ` +
          `${control.q.negShare.toFixed(2)} % затемнения. Проба слепа — её вердикты недействительны`
      );
    console.log(
      `✅ проба пола ЗРЯЧАЯ: со снятым полом плита воспроизведена (медиана ` +
        `${control.q.med.toFixed(2)}, затемнено ${control.q.negShare.toFixed(2)} % площади)`
    );
    for (const f of floorRows.filter((x) => !x.expectDark)) {
      if (f.q.med >= -0.5 && f.q.negShare < 1)
        console.log(
          `✅ пол держит «${f.label}»: слой только осветляет ` +
            `(медиана ${f.q.med.toFixed(2)}, затемнено ${f.q.negShare.toFixed(2)} %)`
        );
      else {
        console.log(
          `❌ пол ПРОТЕКАЕТ в случае «${f.label}»: медиана ${f.q.med.toFixed(2)}, ` +
            `затемнено ${f.q.negShare.toFixed(2)} % площади — тёмная плита из маски светов`
        );
        bad++;
      }
    }

    const live = rows.filter((r) => r.D > 0 && r.qL);
    const p99 = live.map((r) => r.qL.p99);
    // --- Предохранитель 3: переключение обязано что-то менять на максимуме ---
    const top = live[live.length - 1];
    if (!top || top.qL.max === 0)
      die(
        "на максимуме дефекта переключение слоя НЕ МЕНЯЕТ НИ ОДНОГО ПИКСЕЛЯ. " +
          "Это «НЕ ИЗМЕРЕНО» (слой не рисуется / blend не сработал), а не «эффект чист»"
      );
    // --- Предохранитель 5: вырожденная серия ---
    if (p99.length >= 2 && new Set(p99.map((v) => v.toFixed(3))).size === 1)
      die(
        `p99 совпал до последнего знака на всех ступенях (${p99[0].toFixed(3)}) — ` +
          `вероятнее всего мерилось одно и то же место, а не разные диоптрии`
      );
    const mono = p99.every((v, i) => i === 0 || v > p99[i - 1]);
    if (mono)
      console.log(
        `✅ сила ∝ диоптриям ДОКАЗАНА пикселями: p99 Δ растёт ${p99.map((v) => v.toFixed(2)).join(" → ")}`
      );
    else {
      console.log(`❌ сила не монотонна по диоптриям: p99 Δ = ${p99.map((v) => v.toFixed(2)).join(" → ")}`);
      bad++;
    }

    // Разлив против пелены — числа без назначенных порогов, судит человек.
    console.log("\n──────── разлив или пелена (числа, не порог) ────────");
    console.log("Пелена = слой ровно поднял всю тёмную половину: медиана ≈ p99.");
    console.log("Разлив = поднялись света и их окрестность: медиана мала, хвост высок.\n");
    console.log("  ступень          медиана Δ   p99 Δ    макс Δ   отношение p99/мед");
    for (const r of live) {
      const q = r.qL;
      const ratio = q.med > 0.005 ? (q.p99 / q.med).toFixed(1) + "×" : "мед≈0";
      console.log(
        `  ${r.valueText.padEnd(16)} ${q.med.toFixed(2).padStart(8)} ${q.p99
          .toFixed(2)
          .padStart(8)} ${q.max.toFixed(2).padStart(9)}   ${ratio.padStart(8)}`
      );
    }

    console.log(
      `\nКадры приёмки: ${shots.filter((f) => f.includes("-on")).join(", ")}` +
        (KEEP ? "" : "\n(парные «-off» — служебные, удаляю; KEEP=1 оставит)")
    );
    if (!KEEP) for (const f of shots.filter((x) => x.includes("-off"))) fs.unlinkSync(f);

    ws.socket.end();
    if (bad) {
      console.error(`\n❌ ПРОВАЛ: ${bad} структурн. проверок не прошло`);
      process.exit(1);
    }
    console.log("\n✅ структурные проверки пройдены");
  } finally {
    chrome.kill();
  }
}
main().catch((e) => die(String(e && e.stack ? e.stack : e)));

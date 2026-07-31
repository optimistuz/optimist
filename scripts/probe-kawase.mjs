/**
 * ПРИБОР КАЛИБРОВКИ ЦЕПОЧКИ DUAL-KAWASE (этап 6, полуэтап «6б»).
 *
 * ⚠️ ПОЧЕМУ ОН В РЕПОЗИТОРИИ, А НЕ В ВРЕМЕННОЙ ПАПКЕ. Вся кампания замеров
 * «6б» — честная метрика σ², гейт согласия эталонов, измеренные полы
 * ступеней — держалась на скрипте, жившем в `%TEMP%` сессии, и на отладочном
 * крючке, который в код не вошёл. Числа plan.md, на которых строится
 * расписание, оказались НЕВОСПРОИЗВОДИМЫ: прибор, который нельзя запустить
 * снова, — не прибор, а воспоминание. Поймал `dirizher` при сверке.
 *
 * ⚠️ ЧТО ЗДЕСЬ ПРИНЦИПИАЛЬНО ИНОЕ, чем в трёх провалившихся калибровках.
 * Раньше мерился АБСОЛЮТНЫЙ пол ступени и подставлялся в аналитическую
 * формулу. Абсолютный замер второго момента смещён обрезкой хвостов
 * (у третьей ступени смещение МОНОТОННО по резкости эталона, разброс 22,8 %),
 * и выйти из этой вилки абсолютным замером нельзя.
 *
 * Здесь абсолютные величины НЕ НУЖНЫ. Цель этапа — чтобы GL-ветка совпадала
 * с CSS-фолбэком, а фолбэк — честный `blur(r px)`, гауссиан с σ = r. Значит
 * мерим ОБЕ ветки одним прибором, в ОДНОМ прогоне, одним эталоном и одной
 * обрезкой, и приравниваем СЫРЫЕ числа: систематическая ошибка входит в оба
 * замера и сокращается. Свободных параметров нет вовсе — только сравнение
 * прибора с самим собой.
 *
 * ПРЕДОХРАНИТЕЛИ (каждый РОНЯЕТ прогон, а не «оговаривает» результат):
 *  1. ПОРТ КАЛИБРОВКИ ЖИВ. Без `window.__kawaseForce` прибор молча измерил бы
 *     нетронутую цепочку и честно отрапортовал числа — ровно тот отказ, за
 *     который проект уже платил трижды. Порт доказывается двумя состояниями,
 *     обязанными различаться, и одним, обязанным совпасть с резким DOM.
 *  2. PASSTHROUGH. При выключенном эффекте обе ветки обязаны показывать ту же
 *     картинку, что резкий DOM: иначе базы разные и сырые числа несравнимы.
 *  3. ГОДНОСТЬ каждого замера: плато достигнуты, полный подъём производной
 *     равен единице, обрезка не съела ядро, контраст не выродился.
 *  4. ВЫРОЖДЕННАЯ СЕРИЯ. Совпадение чисел по сетке — это «НЕ ИЗМЕРЕНО»,
 *     а не «разницы нет»: так однажды прибор мерил один и тот же угол
 *     страницы и отрапортовал «Δ = 0, непрерывно».
 *  5. МОНОТОННОСТЬ шкалы фолбэка по радиусу.
 *  6. СОГЛАСИЕ ДВУХ ЭТАЛОНОВ — на ОБРАЩЕНИИ, а не на σ²: два разных σ₀
 *     обязаны дать один ответ «какой разъезд нужен для радиуса r» в пределах
 *     5 %. Этой проверки не было ни в одной из трёх провалившихся калибровок.
 *
 * ⚠️ ПОЗИЦИЯ ШТОРКИ СНАПИТСЯ (шаг 4), поэтому непрерывный радиус задаётся
 * ТОЛЬКО удержанием кнопки (`hold`), без отпускания. Прибор, дёргающий
 * drag-с-отпусканием, померил бы лишь ступени 0,5 дптр и не увидел бы границ
 * цепочки вовсе — они лежат МЕЖДУ ступенями.
 *
 * Нужен живой `npm run dev` на :3000.
 *
 *   node scripts/probe-kawase.mjs hook   # только самопроверка порта
 *   node scripts/probe-kawase.mjs base   # контрольная таблица ДО правки
 *   node scripts/probe-kawase.mjs cal    # калибровка обращением таблицы
 *   node scripts/probe-kawase.mjs all    # всё по порядку
 *
 * Переменные: DSF (плотность, 1|2), SIM (0 — близорукость), OUTDIR,
 * SIGMAS («4,10»), LEVELS (глубина цепочки в коде), BORDERS (rBuf границ).
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import zlib from "node:zlib";
import { spawn } from "node:child_process";

const BASE = process.env.BASE || "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.PORT || 9793);
const PHASE = process.argv[2] || "all";
const OUT = process.env.OUTDIR || ".";
const DSF = Number(process.env.DSF || 1);
const SIM = Number(process.env.SIM || 0);
const LEVELS = Number(process.env.LEVELS || 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Калибровка симулятора близорукости: радиус = (позиция/100) × COEF × ширина. */
const COEF = Number(process.env.COEF || 0.013);
/**
 * Где стоит эталонный край, в долях ширины кадра — ПО ЦЕНТРУ.
 *
 * ⚠️ Было 0,75, и на больших радиусах это ломало замер: до правой кромки
 * кадра оставалось 36 px, размытие затягивало её внутрь окна, и аддитивность
 * второго момента проваливалась на −37 % при blur(26). Центр даёт по 590 px
 * запаса с каждой стороны. Хром шторки (линия, ручка, капсула, подсказка) на
 * время замера скрывается, поэтому центр кадра чист — раньше он был занят.
 */
const EDGE_FRAC = Number(process.env.EDGE_FRAC || 0.5);
/** Полуширина окна профиля, CSS-px. Должна вмещать ≥3σ плато по обе стороны. */
const HALF = Number(process.env.HALF || 400);
/**
 * Вертикальное окно профиля, в долях высоты кадра. Ниже верхней кромки
 * (её перелив при большом σ портит замер) и выше нижних угловых подписей.
 * Капсула значения попадает в этот диапазон по вертикали, но живёт у ЛЕВОГО
 * края — окно замера начинается за 600 px от неё.
 */
const Y0F = 0.3;
const Y1F = 0.46;
/**
 * Наклон эталонного края: пикселей сдвига на строку ИСХОДНОГО кадра.
 * 1/53 даёт ≈2 CSS-px разброса фазы на окне замера при рабочей геометрии —
 * этого хватает, чтобы усреднение по строкам работало дизерингом (см. edgeUri).
 */
const SLOPE = Number(process.env.SLOPE || 1 / 53);
/** Квантиль обрезки хвостов профиля. Подозреваемый в расхождении эталонов. */
const TRIMQ = Number(process.env.TRIMQ || 0.005);
/**
 * Какую метрику брать в расчёт: `full` (второй момент по всему окну) или
 * `trim` (с обрезкой хвостов).
 *
 * ⚠️ Дефолт — `full`, и это решение ЗАМЕРА, а не вкуса. Прямая проверка
 * аддитивности (σ²(blur r) = база + r², точное свойство свёртки) на одной
 * сетке радиусов: full — худшее отклонение −1,7 %, дрейф −0,9 п. п.;
 * trim 0,005 — худшее −6,0 %, дрейф −3,3 п. п., РАСТУЩИЙ с шириной. Именно
 * этот дрейф и разводил эталоны разной резкости четыре калибровки подряд.
 * Обрезка была защитой от шума — наклонный край (SLOPE) убрал шум, и вместе
 * с ним надобность в обрезке. TRIMQ остался только предохранителям
 * (признак годности и согласование носителя).
 */
const METRIC = process.env.METRIC || "full";
/**
 * НЕГАТИВНЫЙ КОНТРОЛЬ гейта согласия: множитель, портящий шкалу фолбэка
 * ВТОРОГО эталона (blur(r·INJECT) вместо blur(r) при записанном r).
 * Гейт, который не ловит впрыснутую ошибку калибровки, лживо широк —
 * прибор доказывается ПАДЕНИЕМ, а не успехом.
 */
const INJECT = Number(process.env.INJECT || 0);
/** Позиции жиклирования: ручка, капсула и подсказка уезжают ВЛЕВО, подальше
    от окна замера у 75 % ширины. */
const JIG = [0.2, 0.24];

const fail = [];
const die = (msg) => fail.push(msg);

/* ================= WebSocket (CDP без зависимостей) ================= */
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
          if (opcode === 9) {
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

/* ================= PNG ================= */
function decodePng(buffer) {
  let pos = 8,
    width = 0,
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
      colorType = data[9];
      if (data[8] !== 8 || (colorType !== 2 && colorType !== 6)) {
        throw new Error("PNG не поддержан");
      }
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
    const out = y * stride,
      prev = (y - 1) * stride;
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
  return { width, height, bpp, stride, pixels };
}

/**
 * Приводим снимок к CSS-пикселям box-усреднением dsf×dsf.
 * ⚠️ Без этого окно замера, заданное в CSS-px, уезжает по кадру: снимок
 * приходит в ФИЗИЧЕСКИХ пикселях, и на плотном экране прибор мерил угол
 * страницы, отрапортовав «Δ = 0, непрерывно».
 */
function toCss(img, dsf) {
  if (dsf === 1) return img;
  const w = Math.floor(img.width / dsf),
    h = Math.floor(img.height / dsf);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < dsf; dy++)
        for (let dx = 0; dx < dsf; dx++) {
          const o = (y * dsf + dy) * img.stride + (x * dsf + dx) * img.bpp;
          r += img.pixels[o];
          g += img.pixels[o + 1];
          b += img.pixels[o + 2];
        }
      const n = dsf * dsf,
        oo = (y * w + x) * 3;
      out[oo] = Math.round(r / n);
      out[oo + 1] = Math.round(g / n);
      out[oo + 2] = Math.round(b / n);
    }
  return { width: w, height: h, bpp: 3, stride: w * 3, pixels: out };
}

const px = (img, x, y) => {
  const o = y * img.stride + x * img.bpp;
  return [img.pixels[o], img.pixels[o + 1], img.pixels[o + 2]];
};
const luma = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];

/* ================= эталонный кадр ================= */
const erf = (z) => {
  const s = z < 0 ? -1 : 1;
  const az = Math.abs(z);
  const u = 1 / (1 + 0.3275911 * az);
  const y =
    1 -
    ((((1.061405429 * u - 1.453152027) * u + 1.421413741) * u - 0.284496736) * u +
      0.254829592) *
      u *
      Math.exp(-az * az);
  return s * y;
};
const crc32 = (buf) => {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/**
 * Эталон: вертикальный ГЛАДКИЙ край известной резкости σ₀.
 *
 * ⚠️ Резкая ступенька для этого НЕ ГОДИТСЯ: картинка плоская всюду, кроме
 * одного пикселя, и пока выборки шейдера гуляют внутри плоской области,
 * результат не меняется вовсе — разъезды 0,8 / 1,0 / 1,15 давали ОДНО И ТО
 * ЖЕ σ². Гладкий край снимает квантование.
 */
function edgeUri(sigma0, W = 1600, H = 1200) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    const o = y * (W * 3 + 1);
    raw[o] = 0;
    // ⚠️ КРАЙ НАКЛОНЁН, и это не украшение, а разрешающая способность прибора.
    // Строго вертикальный край одинаков во всех строках, поэтому усреднение
    // профиля по сотне строк НЕ ДАЁТ точности: все строки квантуются в те же
    // байты, и предел прибора — младший бит 8-битного снимка. На нём σ² вставало
    // «намертво» и шесть разных разъездов давали ОДНО И ТО ЖЕ число до третьего
    // знака — то самое «не измерено», которое легко принять за «разницы нет».
    // Наклон в ~2 CSS-px на окно замера раскладывает край по десяткам
    // субпиксельных фаз (метод наклонного края, ISO 12233): усреднение по
    // строкам становится дизерингом. Своя дисперсия наклона (Δ²/12) входит
    // ОДИНАКОВО во все замеры и сокращается при сравнении сырых чисел.
    const shift = y * SLOPE;
    for (let x = 0; x < W; x++) {
      const t = (x - shift - W * EDGE_FRAC) / sigma0;
      const v = Math.round(32 + 192 * (0.5 * (1 + erf(t / Math.SQRT2))));
      raw[o + 1 + x * 3] = v;
      raw[o + 2 + x * 3] = v;
      raw[o + 3 + x * 3] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + png.toString("base64");
}

/**
 * ТОЧЕЧНЫЙ ИСТОЧНИК — кадр для пробы на артефакт четырёх тапов.
 * Тёмное поле и одно яркое пятно в центре: размытие точки есть само ядро,
 * поэтому крест видно прямо, а не через посредника.
 */
function dotUri(radius = 3, W = 1600, H = 1200) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    const o = y * (W * 3 + 1);
    raw[o] = 0;
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // Мягкая кромка пятна: жёсткая давала бы собственные лучи алиасинга,
      // и проба ловила бы их вместо креста цепочки.
      const v = Math.round(8 + 247 * Math.exp(-(d * d) / (2 * radius * radius)));
      raw[o + 1 + x * 3] = v;
      raw[o + 2 + x * 3] = v;
      raw[o + 3 + x * 3] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return "data:image/png;base64," + png.toString("base64");
}

/* ================= метрика ================= */
/**
 * σ² ядра = ВТОРОЙ ЦЕНТРАЛЬНЫЙ МОМЕНТ ПРОИЗВОДНОЙ краевого отклика.
 * Производная края, свёрнутого с ядром, есть само ядро, поэтому это
 * дисперсия ПО ОПРЕДЕЛЕНИЮ — без предположений о форме, которые подвели
 * трижды (ширина 10–90 % перестаёт быть мерой σ, как только у отклика
 * появляется плато: наклон становится немонотонным).
 *
 * Абсолютное значение содержит вклад эталона и смещение обрезки. Здесь оно
 * и не нужно: числа сравниваются между собой.
 */
function edgeSigma2(im, inf) {
  const imW = im.width ?? Math.floor(im.stride / im.bpp);
  const cx = Math.round(inf.left + inf.w * EDGE_FRAC);
  const x0 = Math.max(0, cx - HALF);
  const x1 = Math.min(imW - 1, cx + HALF);
  const y0 = Math.round(inf.top + inf.h * Y0F);
  const y1 = Math.round(inf.top + inf.h * Y1F);
  const prof = [];
  for (let x = x0; x <= x1; x++) {
    let s = 0,
      n = 0;
    for (let y = y0; y < y1; y++) {
      s += luma(px(im, x, y));
      n++;
    }
    prof.push(s / n);
  }
  const lo = Math.min(...prof.slice(0, 10));
  const hi = Math.max(...prof.slice(-10));
  const span = hi - lo || 1;
  const norm = prof.map((v) => (v - lo) / span);
  /**
   * ⚠️ ВТОРОЙ МОМЕНТ БЕЗ ОБРЕЗКИ — по всему окну. Считается ВСЕГДА, рядом
   * с обрезанным, и вот почему это принципиально.
   *
   * Второй момент при свёртке складывается ТОЧНО: σ²(эталон ∗ ядро) =
   * σ²(эталон) + σ²(ядро), какой бы формы ни было ядро. Значит, если бы
   * метрика была честным вторым моментом, ответ «какой разъезд даёт радиус r»
   * НЕ ЗАВИСЕЛ БЫ от эталона вовсе. Единственный источник зависимости —
   * обрезка хвостов: она отрезает тем большую долю, чем шире суммарное
   * размытие, и по-разному у гауссиана и у ядра Kawase.
   *
   * Поэтому обрезка здесь не догма, а ПОДОЗРЕВАЕМЫЙ, и её вклад проверяется
   * прямым сравнением двух метрик на одних и тех же кадрах.
   */
  let sF = 0,
    m1F = 0;
  const gF = [],
    gxF = [];
  for (let i = 1; i < norm.length; i += 1) {
    gF.push(norm[i] - norm[i - 1]);
    gxF.push(i - 0.5);
  }
  for (let i = 0; i < gF.length; i += 1) {
    sF += gF[i];
    m1F += gxF[i] * gF[i];
  }
  const muF = sF ? m1F / sF : NaN;
  let m2F = 0;
  for (let i = 0; i < gF.length; i += 1) {
    const d = gxF[i] - muF;
    m2F += d * d * gF[i];
  }
  const sigma2Full = sF ? m2F / sF : NaN;
  // ⚠️ ОБРЕЗКА ХВОСТОВ. Второй момент взвешивает вклад КВАДРАТОМ расстояния:
  // шум 0,001 на 200 px даёт +40 к σ² — больше всего полезного сигнала мелкой
  // ступени. Без обрезки первая ступень при нулевом разъезде давала
  // ОТРИЦАТЕЛЬНУЮ дисперсию, чего не бывает. Обрезка вносит смещение — оно
  // сокращается тем, что сравниваются два замера с ОДНОЙ обрезкой.
  let iLo = 0;
  while (iLo < norm.length - 1 && norm[iLo] < TRIMQ) iLo += 1;
  let iHi = norm.length - 1;
  while (iHi > 0 && norm[iHi] > 1 - TRIMQ) iHi -= 1;
  iLo = Math.max(1, iLo - 1);
  iHi = Math.min(norm.length - 1, iHi + 1);
  const g = [],
    gx = [];
  for (let i = iLo; i <= iHi; i += 1) {
    g.push(norm[i] - norm[i - 1]);
    gx.push(i - 0.5);
  }
  let sum = 0,
    m1 = 0;
  for (let i = 0; i < g.length; i += 1) {
    sum += g[i];
    m1 += gx[i] * g[i];
  }
  const mu = sum ? m1 / sum : NaN;
  let m2 = 0;
  for (let i = 0; i < g.length; i += 1) {
    const d = gx[i] - mu;
    m2 += d * d * g[i];
  }
  const sigma2 = sum ? m2 / sum : NaN;
  const avg = (a) => a.reduce((s2, v) => s2 + v, 0) / a.length;
  const tail = Math.max(
    Math.abs((avg(prof.slice(0, 8)) - lo) / span),
    Math.abs((hi - avg(prof.slice(-8))) / span)
  );
  const trim = iHi - iLo;
  // ГОДНОСТЬ: плато достигнуты по обе стороны, полный подъём производной
  // равен единице, обрезка не съела ядро, контраст не выродился.
  // Не выполнено — «НЕ ИЗМЕРЕНО», а НЕ «измерено плохо».
  // ⚠️ И ЕЩЁ ОДИН ПРИЗНАК: ШИРИНА НОСИТЕЛЯ ОБЯЗАНА СОГЛАСОВЫВАТЬСЯ С ШИРИНОЙ
  // ЯДРА. У профиля одиночного края производная лежит в пределах ±3σ, то есть
  // носитель ≈ 6σ. Если обрезка оставила КУДА БОЛЬШЕ, внутрь окна попала
  // лишняя структура — вторая кромка, граница кадра, перелив свипа — и σ²
  // считается уже не по ядру. Ровно так замер blur(19) дал носитель 305 при
  // собственной ширине 19 (ожидалось ~150), а blur(34) завысил σ² на четверть.
  // Порог 8σ вместо 6σ оставляет запас на несимметричные хвосты Kawase.
  const support = trim <= 8 * Math.sqrt(Math.max(sigma2, 1e-9));
  const valid =
    tail < 0.02 &&
    sum > 0.97 &&
    sum < 1.03 &&
    sigma2 > 0 &&
    trim < prof.length - 4 &&
    span > 40 &&
    support;
  return {
    sigma2: +(METRIC === "full" ? sigma2Full : sigma2).toFixed(3),
    sigma2Trim: +sigma2.toFixed(3),
    sigma2Full: +sigma2Full.toFixed(3),
    rise: +sum.toFixed(3),
    tail: +tail.toFixed(4),
    trim,
    span: +span.toFixed(1),
    support,
    valid,
  };
}

/**
 * АНИЗОТРОПИЯ ЯДРА вокруг точечного источника — мера того самого «креста».
 *
 * Ядро dual-Kawase собрано из выборок по ДИАГОНАЛЯМ (проход DOWN) и по ОСЯМ
 * (проход UP). Пока разъезд мал, выборки сливаются и ядро почти круглое; за
 * некоторым разъездом они расходятся, и вместо размытия появляется звезда.
 * Это деградация САМОГО ЭФФЕКТА, запрещённая §3-3, — значит потолок разъезда
 * назначается ПРОБОЙ, а не вкусом.
 *
 * Меряем прямо: на окружности радиуса ρ вокруг центра сравниваем среднюю
 * яркость на осях и на диагоналях. У круглого ядра отношение равно единице.
 */
function anisotropy(im, cx, cy, sigmaPx) {
  const bil = (x, y) => {
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const fx = x - x0,
      fy = y - y0;
    const g = (xx, yy) => luma(px(im, Math.max(0, xx), Math.max(0, yy)));
    return (
      g(x0, y0) * (1 - fx) * (1 - fy) +
      g(x0 + 1, y0) * fx * (1 - fy) +
      g(x0, y0 + 1) * (1 - fx) * fy +
      g(x0 + 1, y0 + 1) * fx * fy
    );
  };
  const ring = (rho) => {
    const axis = [0, 90, 180, 270].map((a) => {
      const t = (a * Math.PI) / 180;
      return bil(cx + rho * Math.cos(t), cy + rho * Math.sin(t));
    });
    const diag = [45, 135, 225, 315].map((a) => {
      const t = (a * Math.PI) / 180;
      return bil(cx + rho * Math.cos(t), cy + rho * Math.sin(t));
    });
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return { rho: +rho.toFixed(1), axis: +mean(axis).toFixed(2), diag: +mean(diag).toFixed(2) };
  };
  // Три радиуса в единицах σ: ближе центра крест не виден, дальше 2,5σ тонет
  // в шуме дискретизации.
  const rings = [1, 1.6, 2.2].map((k) => ring(k * sigmaPx));
  let worst = 0;
  for (const r of rings) {
    const base = (r.axis + r.diag) / 2;
    if (base < 2) continue; // сигнала нет — не выдумываем анизотропию
    const rel = Math.abs(r.axis - r.diag) / base;
    if (rel > worst) worst = rel;
  }
  return { rings, worst: +worst.toFixed(4) };
}

/** Линейная интерполяция по точкам {x,y}; вне диапазона — NaN, не экстраполяция. */
const interp = (pts, x) => {
  const p = pts
    .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))
    .sort((a, b) => a.x - b.x);
  if (!p.length || x < p[0].x || x > p[p.length - 1].x) return NaN;
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i].x) {
      const t = (x - p[i - 1].x) / (p[i].x - p[i - 1].x || 1);
      return p[i - 1].y + t * (p[i].y - p[i - 1].y);
    }
  }
  return NaN;
};

/**
 * ПРЕДОХРАНИТЕЛЬ ВЫРОЖДЕННОЙ СЕРИИ. Совпадение замеров серии до последнего
 * знака — это «НЕ ИЗМЕРЕНО», а не «разницы нет»: вероятнее всего прибор
 * мерил одно и то же место. Так таблица непрерывности однажды отрапортовала
 * «Δ = 0, непрерывно» на плотном экране.
 */
function degenerate(values, what) {
  const ok = values.filter((v) => Number.isFinite(v));
  if (ok.length < 3) return;
  const uniq = new Set(ok.map((v) => v.toFixed(3)));
  if (uniq.size < Math.max(3, Math.ceil(ok.length * 0.8))) {
    die(
      `${what}: ВЫРОЖДЕННАЯ СЕРИЯ — ${uniq.size} различных значений на ${ok.length} точек. ` +
        `Это «не измерено», а не «разницы нет»`
    );
  }
}

/* ================= main ================= */
async function main() {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      "--user-data-dir=" + (process.env.TEMP || ".") + "\\optimist-kawase" + PORT,
      "--no-first-run",
      "--no-default-browser-check",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--window-size=1920,1200",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const results = { dsf: DSF, sim: SIM, phase: PHASE };
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
    const page = targets?.find((t) => t.type === "page");
    if (!page) throw new Error("Chrome не поднялся");
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
        pending.set(id, (m) => res(m.result ?? m.error));
        ws.send(JSON.stringify({ id: id++, method, params }));
      });
    const ev = async (expr) => {
      const r = await call("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r?.exceptionDetails) {
        throw new Error(
          "JS: " +
            JSON.stringify(
              r.exceptionDetails.exception?.description || r.exceptionDetails.text
            )
        );
      }
      return r?.result?.value;
    };
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: DSF,
      mobile: false,
    });

    const shot = async (name) => {
      const { data } = await call("Page.captureScreenshot", { format: "png" });
      if (name) fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
      return toCss(decodePng(Buffer.from(data, "base64")), DSF);
    };

    const SIM_SEL = "#vision .cursor-ew-resize";
    const Q = JSON.stringify(SIM_SEL);
    const simInfo = () =>
      ev(`(()=>{const s=document.querySelectorAll(${Q})[${SIM}];
      if(!s) return null; const r=s.getBoundingClientRect(); const c=s.querySelector('canvas');
      const h=s.querySelector('[role=slider]');
      return {left:r.left,top:r.top,w:r.width,h:r.height,hasCanvas:!!c,
        cw:c?c.width:0,ccw:c?c.clientWidth:0,dpr:window.devicePixelRatio,
        pos:h?parseFloat(h.style.left):NaN, now:h?h.getAttribute('aria-valuenow'):null};})()`);

    const pointAt = (frac) =>
      ev(`(()=>{const s=document.querySelectorAll(${Q})[${SIM}];const r=s.getBoundingClientRect();
        return [r.left + r.width*${frac}, r.top + r.height*0.5];})()`);

    /** Клик-перенос с ОТПУСКАНИЕМ: после него позиция садится на ступень. */
    const drag = async (frac) => {
      const [x0, y] = await pointAt(frac);
      const x = Math.max(0, x0);
      const mouse = (type, buttons, button = "left") =>
        call("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button,
          buttons,
          clickCount: 1,
          pointerType: "mouse",
        });
      await mouse("mouseMoved", 0, "none");
      await mouse("mousePressed", 1);
      await mouse("mouseMoved", 1);
      await mouse("mouseReleased", 0);
    };

    /**
     * УДЕРЖАНИЕ без отпускания — единственный способ поставить НЕПРЕРЫВНЫЙ
     * радиус: после шага 4 отпускание снапит позицию на ступень 0,5 дптр,
     * а границы цепочки лежат МЕЖДУ ступенями.
     */
    let held = false;
    const hold = async (frac) => {
      const [x0, y] = await pointAt(frac);
      const x = Math.max(0, x0);
      if (!held) {
        await call("Input.dispatchMouseEvent", {
          type: "mouseMoved", x, y, buttons: 0, button: "none", pointerType: "mouse",
        });
        await call("Input.dispatchMouseEvent", {
          type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, pointerType: "mouse",
        });
        held = true;
      }
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved", x, y, button: "left", buttons: 1, pointerType: "mouse",
      });
    };
    const release = async () => {
      if (!held) return;
      const [x, y] = await pointAt(0.2);
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased", x: Math.max(0, x), y, button: "left", buttons: 0, clickCount: 1, pointerType: "mouse",
      });
      held = false;
      await sleep(700);
    };

    /** Ждём, пока пружина доснапа встанет: позиция стабильна два чтения подряд. */
    const settle = async (tries = 14) => {
      let prev = null;
      for (let i = 0; i < tries; i += 1) {
        const p = await ev(`(()=>{const h=document.querySelectorAll(${Q})[${SIM}].querySelector('[role=slider]');
          return h?h.style.left:null;})()`);
        if (p !== null && p === prev) return p;
        prev = p;
        await sleep(150);
      }
      return prev;
    };

    const scrollToSim = async (want = 120) => {
      for (let k = 0; k < 6; k++) {
        const r = await ev(`(()=>{const el=document.querySelectorAll(${Q})[${SIM}];
          let y=0; for(let n=el;n;n=n.offsetParent) y+=n.offsetTop;
          return {abs:y, top:el.getBoundingClientRect().top};})()`);
        if (Math.abs(r.top - want) < 25) return r.top;
        await ev(`window.scrollTo(0, ${r.abs - want}); 0`);
        await sleep(700);
      }
      return ev(`document.querySelectorAll(${Q})[${SIM}].getBoundingClientRect().top`);
    };

    /**
     * Управление слоями.
     *
     * ⚠️ Слой CSS-фолбэка ЖИВЁТ В DOM ВСЕГДА (при живом GL он лишь
     * `display:none`) — поэтому обе ветки меряются в ОДНОМ прогоне, одним
     * процессом Chrome и одним растеризатором. Второй браузер с
     * `--disable-webgl` вернул бы ту самую систематику разных прогонов, ради
     * сокращения которой вся схема и построена.
     *
     * ⚠️ `scale-105` у фолбэка НЕЙТРАЛИЗУЕТСЯ на время замера: он увеличивает
     * кадр на 5 %, то есть показывает эталонный край в ДРУГОМ масштабе, чем
     * канвас, а 5 % масштаба — это 10 % дисперсии. Что нейтрализация удалась,
     * доказывает гейт passthrough, а не доверие к строчке кода.
     */
    const layers = (spec) =>
      ev(`(()=>{const s=document.querySelectorAll(${Q})[${SIM}];
      const c=s.querySelector('canvas');
      const fb=[...s.children].find(d=>d.tagName==='DIV'&&d.getAttribute('aria-hidden')==='true'&&d.querySelector('img'));
      const spec=${JSON.stringify(spec)};
      if(spec.canvas!==undefined&&c){ c.style.visibility=spec.canvas?'visible':'hidden'; c.style.clipPath='inset(0)'; }
      if(!fb) return {err:'слой фолбэка не найден'};
      if(spec.fb!==undefined){ fb.style.display=spec.fb?'block':'none'; fb.style.clipPath='inset(0)'; }
      if(spec.blur!==undefined){ fb.style.filter='blur('+spec.blur+'px)'; }
      if(spec.filter!==undefined){ fb.style.filter=spec.filter; }
      const inner=fb.firstElementChild;
      if(spec.noScale&&inner) inner.style.transform='none';
      // ⚠️ ХРОМ ШТОРКИ УБИРАЕТСЯ ИЗ КАДРА НА ВРЕМЯ ЗАМЕРА. Дисплейная капсула
      // значения (шаг 5) висит на 96 px выше центра и ЕДЕТ С ЛИНИЕЙ, а подсказка
      // и угловые подписи стоят у центра и в углах. Капсула залезала прямо
      // в окно профиля: подъём производной падал до 0,788 и все замеры честно
      // объявлялись «НЕ ИЗМЕРЕНО». Мерить надо СЛОИ ФОТО, а не интерфейс.
      let hidden=0;
      for(const el of [...s.children]){
        const keep = el.tagName==='CANVAS' || el.tagName==='IMG'
          || (el.querySelector && (el.querySelector('canvas')||el.querySelector('img')));
        if(!keep){ el.style.visibility='hidden'; hidden+=1; }
      }
      return {fbDisplay:fb.style.display, fbFilter:fb.style.filter, hidden,
        canvasVis:c?getComputedStyle(c).visibility:null,
        innerTransform:inner?getComputedStyle(inner).transform:null};})()`);

    const force = (v) =>
      ev(v ? `window.__kawaseForce=${JSON.stringify(v)};0` : `delete window.__kawaseForce;0`);

    /**
     * Скомпилированное расписание — ЕДИНСТВЕННЫЙ источник кривых для фаз
     * `match` и `seam` и для домена гейта. Зашитая в прибор копия таблицы
     * уже один раз пережила смену ядра и молча предлагала СТАРЫЕ обращения —
     * прибор, который носит собственную копию правды, врёт при первом же
     * расхождении с ней.
     */
    let schedMod = null;
    const loadSched = async () => {
      if (schedMod) return schedMod;
      try {
        schedMod = await import(
          "file://" + process.cwd().replace(/\\/g, "/") + "/.tmp-test/lib/kawase-schedule.js"
        );
      } catch {
        die("нет скомпилированного расписания: npx tsc -p tsconfig.test.json");
        schedMod = null;
      }
      return schedMod;
    };
    /** Обращение измеренной кривой ступени: радиус → разъезд (клампится краями). */
    const offForRadius = (sched, lv, r) => {
      const pts = sched.LEVEL_REQ[lv - 1].map(([o, req]) => ({ x: req, y: o }));
      if (r <= pts[0].x) return 0;
      const last = pts[pts.length - 1];
      if (r >= last.x) return last.y;
      return interp(pts, r);
    };

    let inf = null;

    /**
     * ПОДГОТОВКА ПОД ЭТАЛОН — с загрузкой страницы заново, и это не
     * перестраховка.
     *
     * ⚠️ ТЕКСТУРА СНИМАЕТСЯ С `<img>` РОВНО ОДИН РАЗ, при монтировании слоя
     * (`vision-blur.tsx`: `attach()` → `texture.needsUpdate`), а слой ленив
     * ПО ВИДИМОСТИ. Поэтому подмена кадра ОБЯЗАНА произойти ДО того, как
     * симулятор попадёт во вьюпорт: подменённый позже `<img>` меняет DOM, но
     * не текстуру, и канвас продолжает показывать прежний кадр. Первый прогон
     * этого прибора попался ровно на это — порт отвечал, а мерился уличный
     * снимок, и «σ² = −243 485» было единственным признаком.
     *
     * Отсюда же перезагрузка между эталонами: сменить σ₀ на живой странице
     * значит оставить в текстуре ПРЕДЫДУЩИЙ эталон, то есть сравнить два
     * разных эталона у фолбэка с одним и тем же у канваса. Гейт согласия на
     * таких числах не значил бы ничего.
     */
    const prepare = async (sigma0, tag, keepPhoto = false) => {
      const uri = edgeUri(sigma0);
      /**
       * ⚠️ `loading` ПРИНУДИТЕЛЬНО `eager`, и ожидание декодирования — С
       * ТАЙМАУТОМ. Базовый `<img>` секции ленив и лежит ниже сгиба: пока он
       * вне вьюпорта, браузер не начинает загрузку вовсе, и `img.decode()`
       * остаётся ВЕЧНО ПОДВЕШЕННЫМ. Ранняя подмена (обязательная, иначе
       * текстура возьмёт уличный снимок) приходится ровно на этот момент —
       * прибор молча висел, ничего не печатая. Гонка с таймаутом превращает
       * зависание в измеримый отказ.
       */
      const swap = `(async()=>{const imgs=[...document.querySelectorAll(${Q}+' img')];
        for(const im of imgs){ im.loading='eager'; im.removeAttribute('srcset'); im.removeAttribute('sizes'); im.src=${JSON.stringify(uri)}; }
        const wait=(im)=>Promise.race([im.decode().then(()=>1).catch(()=>0),
          new Promise(r=>setTimeout(()=>r(-1),3000))]);
        const st=await Promise.all(imgs.map(wait));
        return {n:imgs.length, decoded:st.filter(v=>v===1).length, timeout:st.filter(v=>v===-1).length,
          ready:imgs.filter(im=>im.complete&&im.naturalWidth>0&&im.currentSrc.startsWith('data:')).length};})()`;
      // Кнопка отпускается ДО навигации: пресс, «переживший» смену документа,
      // оставляет стейт ввода браузера в противоречии с нашим флагом.
      await release();
      await call("Page.navigate", { url: BASE + "/" });
      // ⚠️ ЗАЖАТАЯ КНОПКА НЕ ПЕРЕЖИВАЕТ НАВИГАЦИЮ, а флаг о ней переживал:
      // новый документ не получал `pointerdown`, и `hold` рассылал ему только
      // `mousemove` с `buttons:1`. Шторка не двигалась вовсе, а прибор считал,
      // что ведёт её по сетке радиусов, — и мерил ОДНУ И ТУ ЖЕ середину хода
      // под разными подписями.
      held = false;
      await sleep(4200);
      // ⚠️ ПОДМЕНА КАДРА — ТОЛЬКО ДЛЯ σ²-МЕТРИКИ. Пиксельный критерий честнее
      // мерить на НАСТОЯЩЕЙ фотографии: именно её структуру видит человек,
      // а синтетический край структуры почти не имеет.
      // РАННЯЯ подмена — симулятор ещё вне вьюпорта, слой GL не смонтирован.
      const early = keepPhoto ? { n: 1, ready: 1 } : await ev(swap);
      await scrollToSim();
      await sleep(1400);
      // ПОЗДНЯЯ — у фолбэка свой `<img>`, он монтируется с живой частью.
      const late = keepPhoto ? { n: 1, ready: 1 } : await ev(swap);
      await sleep(800);
      inf = await simInfo();
      console.log(`SIM(${tag}) ${JSON.stringify(inf)}`);
      console.log(`   подмена рано: ${JSON.stringify(early)}   поздно: ${JSON.stringify(late)}`);
      if (!inf?.hasCanvas) {
        die(`${tag}: КАНВАСА НЕТ — GL не поднялся, калибровать нечего`);
        return false;
      }
      if (!early.n || !late.n || late.ready < late.n) {
        die(`${tag}: эталон НЕ ВСТАЛ в кадр (рано ${JSON.stringify(early)}, поздно ${JSON.stringify(late)}) — мерился бы уличный снимок`);
        return false;
      }
      results.info = inf;
      return true;
    };

    let jig = 0;
    /**
     * Толчок шторки: гейт покоя пускает кадр ТОЛЬКО на смену состояния сцены,
     * поэтому после смены униформ порта надо шевельнуть позицию.
     *
     * ⚠️ Толчок делается УДЕРЖАНИЕМ, а не кликом с отпусканием. Отпускание
     * запускает инерцию и пружинный доснап (шаг 4) — это лишние 0,5–2 с
     * ожидания на каждую точку сетки И лишний риск: пока пружина едет,
     * severity меняется, и снимок мог бы застать промежуточный кадр.
     */
    const jiggle = async () => {
      jig = 1 - jig;
      await hold(JIG[jig]);
      await sleep(220);
    };

    const measure = async (name) => edgeSigma2(await shot(name), inf);

    /* =========================================================
       ФАЗА HOOK — САМОПРОВЕРКА ПОРТА КАЛИБРОВКИ.
       Без неё прибор молча измерил бы нетронутую цепочку и честно
       отрапортовал числа. Именно так проект трижды платил за «успешный»
       прогон.
       ========================================================= */
    async function phaseHook() {
      console.log("\n===== ПОРТ КАЛИБРОВКИ: самопроверка =====");
      if (!(await prepare(6, "hook"))) return false;
      await jiggle();
      inf = await simInfo();

      await force(null);
      await layers({ canvas: false, fb: false });
      await sleep(350);
      const sharp = await measure("kw-hook-sharp");
      // Эталон обязан читаться прибором ДО всякого эффекта: негодный профиль
      // на резком DOM означает, что мерится не эталон, а фотография.
      if (!sharp.valid) {
        die(`ЭТАЛОН НЕ ЧИТАЕТСЯ на резком DOM: подъём ${sharp.rise}, хвост ${sharp.tail}, ` +
          `контраст ${sharp.span}, участок ${sharp.trim}. Дальше мерить нечего`);
        return false;
      }

      await layers({ canvas: true, fb: false });
      await force({ lv: 1, offset: 0, mix: 0 });
      await jiggle();
      await layers({ canvas: true, fb: false });
      await sleep(250);
      const thru = await measure("kw-hook-mix0");

      await force({ lv: LEVELS, offset: 1.5, mix: 1 });
      await jiggle();
      await layers({ canvas: true, fb: false });
      await sleep(250);
      const deep = await measure("kw-hook-deep");
      await force(null);

      console.log(`   резкий DOM σ² ${sharp.sigma2} | порт mix=0 σ² ${thru.sigma2} | порт lv=${LEVELS},o=1.5 σ² ${deep.sigma2}`);
      results.hook = { sharp, thru, deep };

      // 1. Порт УПРАВЛЯЕТ конвейером: два состояния обязаны РЕЗКО различаться.
      // ⚠️ Условие КРАТНОЕ, а не абсолютное: абсолютный порог «десятки единиц»
      // ложно ронял прогон при `LEVELS=1`, где глубокой ступени просто нет,
      // и прибор объявлял мёртвым живой порт. Порог, зависящий от настроек
      // прогона, — это прибор, который врёт в одну из сторон.
      if (!(deep.sigma2 > thru.sigma2 * 1.5 && deep.sigma2 - thru.sigma2 > 5)) {
        die(
          `ПОРТ КАЛИБРОВКИ НЕ ОТВЕЧАЕТ: состояния {lv1,o0,mix0} и {lv${LEVELS},o1.5} дали ` +
            `σ² ${thru.sigma2} и ${deep.sigma2} — разница ${(deep.sigma2 - thru.sigma2).toFixed(1)} вместо ` +
            `десятков. Крючка window.__kawaseForce в kawase.ts нет (или он за прод-условием), ` +
            `и все числа прогона относятся к НЕТРОНУТОЙ цепочке`
        );
        return false;
      }
      // 2. Порт с mix=0 обязан вернуть РЕЗКИЙ источник — иначе он управляет
      //    не тем, чем мы думаем.
      const tol = Math.max(0.6, sharp.sigma2 * 0.05);
      if (!thru.valid || Math.abs(thru.sigma2 - sharp.sigma2) > tol) {
        die(
          `ПОРТ УПРАВЛЯЕТ НЕ ТЕМ: при mix=0 канвас обязан показать резкий источник ` +
            `(σ² ${sharp.sigma2}), а показал ${thru.sigma2} (допуск ${tol.toFixed(2)})`
        );
        return false;
      }
      console.log("   ✅ порт жив: mix=0 совпал с резким DOM, глубокая ступень отличается на " +
        (deep.sigma2 - thru.sigma2).toFixed(1));
      return true;
    }

    /* =========================================================
       ФАЗА BASE — КОНТРОЛЬНАЯ ТАБЛИЦА ДО ПРАВКИ.
       Замер ведётся в НАСТОЯЩИХ точках переключения, а не по степеням
       двойки: прибор, стучащий по 4/8/16, мерит середину ветки и границы
       не видит вовсе. Радиус ставится УДЕРЖАНИЕМ (снап позиции!).
       ========================================================= */
    async function phaseBase() {
      const borders = (process.env.BORDERS || "4.34,11.78,24.88")
        .split(",")
        .map(Number)
        .filter((v) => v > 0);
      console.log("\n===== КОНТРОЛЬНАЯ ТАБЛИЦА НЕПРЕРЫВНОСТИ (текущее дерево) =====");
      if (!(await prepare(6, "base"))) return;
      await force(null);
      await layers({ canvas: true, fb: false });
      inf = await simInfo();
      // rBuf = radius_css × allocRatio; при DSF 1 и renderScale 1 это CSS-px.
      const allocRatio = inf.cw && inf.ccw ? inf.cw / inf.ccw : DSF;
      const fracFor = (rBuf) => rBuf / (allocRatio * COEF * inf.w);
      console.log(`   ширина кадра ${inf.w} CSS-px, буфер ${inf.cw}, allocRatio ${allocRatio.toFixed(3)}`);
      const rows = [];
      for (const b of borders) {
        const pts = [];
        for (const d of [-0.25, -0.08, 0.08, 0.25]) {
          const rB = b + d;
          const frac = fracFor(rB);
          if (!(frac > 0.02 && frac < 0.95)) {
            pts.push({ rBuf: +rB.toFixed(3), sigma2: NaN, why: "вне хода шторки" });
            continue;
          }
          await hold(frac);
          await sleep(320);
          await layers({ canvas: true, fb: false });
          await sleep(160);
          const a = await simInfo();
          const m = await measure(null);
          pts.push({
            rBuf: +rB.toFixed(3),
            posRBuf: +((a.pos / 100) * allocRatio * COEF * inf.w).toFixed(3),
            aria: a.now,
            ...m,
          });
        }
        await release();
        const lo = pts.filter((p) => p.rBuf < b && Number.isFinite(p.sigma2));
        const hi = pts.filter((p) => p.rBuf > b && Number.isFinite(p.sigma2));
        const a = lo.length ? lo[lo.length - 1].sigma2 : NaN;
        const c = hi.length ? hi[0].sigma2 : NaN;
        const rel = Number.isFinite(a) && Number.isFinite(c) ? Math.abs(c - a) / Math.max(1, a) : NaN;
        rows.push({ border: b, pts, jumpRel: Number.isFinite(rel) ? +(rel * 100).toFixed(1) : null });
        console.log(`   граница rBuf≈${b}: ` + pts.map((p) => `${p.rBuf}→${Number.isFinite(p.sigma2) ? p.sigma2 : "×"}`).join("  ") +
          `   СКАЧОК ${Number.isFinite(rel) ? (rel * 100).toFixed(1) + " %" : "—"}`);
        degenerate(pts.map((p) => p.sigma2), `граница rBuf≈${b}`);
      }
      results.base = { allocRatio, rows };
    }

    /* =========================================================
       ФАЗА SWEEP — мелкий сплошной проход по радиусу.
       Отвечает на вопрос «плато у эффекта или у прибора»: если два соседних
       положения дают одинаковое σ², надо знать, чьё это свойство. Прибор,
       который не различает шаг, обязан быть разоблачён здесь, а не потом.
       ========================================================= */
    async function phaseSweep() {
      const from = Number(process.env.FROM || 3.9);
      const to = Number(process.env.TO || 5.1);
      const step = Number(process.env.STEP || 0.06);
      const keepPhoto = !!process.env.PHOTO;
      console.log(`\n===== МЕЛКИЙ ПРОХОД rBuf ${from}…${to}, шаг ${step}` +
        `, кадр: ${keepPhoto ? "НАСТОЯЩЕЕ ФОТО" : "эталонный край"} =====`);
      if (!(await prepare(6, "sweep", keepPhoto))) return;
      await force(null);
      inf = await simInfo();
      const allocRatio = inf.cw && inf.ccw ? inf.cw / inf.ccw : DSF;
      /**
       * ⚠️ ПРЕСС — ДО ПЕРЕКРОЙКИ СЛОЁВ, и это найдено бисекцией, а не
       * рассуждением. Если pointerdown происходит, когда прибор уже залез в
       * инлайн-стили симулятора (клип канваса, скрытый хром), Chrome через
       * ~2,3 с шлёт ДОВЕРЕННЫЙ pointercancel — доснап срабатывает, и все
       * последующие движения зажатой кнопки игнорируются: прибор «ведёт»
       * шторку, а мерит один кадр (два прогона подряд поймал предохранитель
       * вырожденной серии). Пресс в НЕТРОНУТОМ состоянии живёт сколько
       * угодно; перекройка слоёв после пресса безопасна.
       */
      await hold(JIG[0]);
      await sleep(250);
      await layers({ canvas: true, fb: false });
      await sleep(150);
      const rows = [];
      let prevImg = null;
      /**
       * ⚠️ ГЛАВНЫЙ КРИТЕРИЙ ЗДЕСЬ — ПИКСЕЛЬНЫЙ, а не σ².
       *
       * Закон §6-11 говорит о том, что ВИДИТ человек: два соседних положения
       * с одной подписью обязаны выглядеть одинаково. σ² — лишь посредник, и
       * посредник неполный: две картинки с ОДИНАКОВЫМ σ² и разной формой ядра
       * (пирамида без разъезда против разъехавшихся тапов) выглядят по-разному.
       * Поэтому меряем то, что и требуется: насколько кадр меняется за шаг
       * ползунка — и сравниваем шаг ЧЕРЕЗ границу с такими же шагами ВНУТРИ
       * ветки. Скачок есть тогда, когда через границу картинка меняется
       * заметно сильнее, чем за тот же шаг рядом.
       */
      const win = () => ({
        x: Math.max(0, Math.round(inf.left + inf.w * EDGE_FRAC) - HALF),
        y: Math.round(inf.top + inf.h * Y0F),
        w: 2 * HALF,
        h: Math.round(inf.h * (Y1F - Y0F)),
      });
      const meanAbs = (a, b, rect) => {
        let sum = 0,
          n = 0;
        const xEnd = Math.min(rect.x + rect.w, (a.width ?? 0) - 1);
        for (let y = rect.y; y < rect.y + rect.h; y++) {
          for (let x = rect.x; x < xEnd; x++) {
            sum += Math.abs(luma(px(a, x, y)) - luma(px(b, x, y)));
            n += 1;
          }
        }
        return n ? sum / n : NaN;
      };
      for (let r = from; r <= to + 1e-9; r += step) {
        const frac = r / (allocRatio * COEF * inf.w);
        if (!(frac > 0.02 && frac < 0.95)) continue;
        await hold(frac);
        await sleep(300);
        await layers({ canvas: true, fb: false });
        await sleep(150);
        const a = await simInfo();
        // Клип канваса читается В МОМЕНТ замера: если гонка вернула частичный
        // клип, окно у 75 % ширины показывало бы резкий DOM, а не канвас,
        // и «плато» было бы артефактом гонки, а не свойством цепочки.
        const clipNow = await ev(`(()=>{const c=document.querySelectorAll(${Q})[${SIM}].querySelector('canvas');
          return c?c.style.clipPath:null;})()`);
        // Каждое положение снимается ДВАЖДЫ: разброс повторов — вот шум
        // прибора, он ИЗМЕРЯЕТСЯ, а не назначается (критерий dirizher).
        const img = await shot(null);
        await sleep(120);
        const img2 = await shot(null);
        const rpt = +meanAbs(img, img2, win()).toFixed(3);
        const m = edgeSigma2(img, inf);
        const dPix = prevImg ? +meanAbs(img, prevImg, win()).toFixed(3) : null;
        prevImg = img;
        rows.push({ r: +r.toFixed(3), pos: a.pos, clip: clipNow, dPix, rpt, ...m });
        console.log(`   rBuf=${r.toFixed(3)} (pos ${a.pos?.toFixed?.(3)}) → σ² ${String(m.sigma2).padStart(9)}` +
          `  Δпикс за шаг ${dPix === null ? "—" : dPix.toFixed(3)}  повтор ${rpt}${m.valid ? "" : "  σ² НЕ ИЗМЕРЕНО"}`);
      }
      await release();
      results.sweep = { allocRatio, from, to, step, rows };
      degenerate(rows.map((q) => q.sigma2), `мелкий проход ${from}…${to}`);
      /**
       * ВЕРДИКТ ПО КРИТЕРИЮ dirizher — ни одного назначенного порога:
       *  1) шаг ЧЕРЕЗ границу обязан попадать В РАЗБРОС шагов ВНУТРИ ветки
       *     («граница ничем не выделяется среди обычных шагов»);
       *  2) шум — максимум разброса повторного замера одного положения;
       *  3) внутриветочные шаги, совпавшие до последнего знака, — вырождение.
       * Граница подаётся через BORDER (rBuf настоящей точки переключения
       * построенного расписания).
       */
      const border = Number(process.env.BORDER || NaN);
      const ds = rows.slice(1).map((q, i) => ({ d: q.dPix, lo: rows[i].r, hi: q.r }));
      const noiseMax = Math.max(...rows.map((q) => q.rpt));
      if (Number.isFinite(border)) {
        const cross = ds.filter((s) => s.lo < border && s.hi >= border);
        const inside = ds.filter((s) => !(s.lo < border && s.hi >= border)).map((s) => s.d);
        if (!cross.length || inside.length < 4) {
          die(`sweep: границе ${border} не хватает точек (через неё ${cross.length}, внутри веток ${inside.length})`);
        } else {
          degenerate(inside, "sweep: внутриветочные шаги");
          const worstCross = Math.max(...cross.map((s) => s.d));
          const insideMax = Math.max(...inside);
          console.log(`   ГРАНИЦА ${border}: шаг через неё ${worstCross.toFixed(3)}; внутриветочные до ${insideMax.toFixed(3)}; шум повтора до ${noiseMax.toFixed(3)}`);
          if (worstCross > insideMax + noiseMax) {
            die(`ГРАНИЦА ${border} ВЫДЕЛЯЕТСЯ: шаг через неё ${worstCross.toFixed(3)} > максимум внутриветочных ${insideMax.toFixed(3)} + шум ${noiseMax.toFixed(3)}`);
          } else {
            console.log(`   ✅ граница неотличима от рядового шага`);
          }
          results.sweep.verdict = { border, worstCross, insideMax, noiseMax };
        }
      }
    }

    /* =========================================================
       ФАЗА CROSS — ПРОБА НА АРТЕФАКТ ЧЕТЫРЁХ ТАПОВ.
       Назначает ВЕРХНЮЮ границу разъезда: за ней выборки перестают сливаться
       и вместо размытия появляется звезда. Пока потолок стоял «по вкусу»
       (OFFSET_MAX = 1), никто не знал ни его повода, ни запаса.
       ========================================================= */
    async function phaseCross() {
      const offs = (process.env.COFFS || "0.5,0.8,1,1.2,1.4,1.6,1.8,2,2.4")
        .split(",")
        .map(Number);
      console.log("\n===== ПРОБА НА КРЕСТ (точечный источник) =====");
      /**
       * ⚠️ РАЗМЕР ПЯТНА ПОДБИРАЕТСЯ ПОД СТУПЕНЬ — тот же урок, что с
       * эталонами резкости (σ₀ под масштаб). Пятно σ=3 px после ступени 4
       * растекается в сотни пикселей: пик над фоном падает до единиц, кольца
       * читают шум квантования, и «анизотропия» перестаёт быть измеренной.
       * Крупному ядру — крупное пятно (пик держится), мелкому — мелкое
       * (иначе пятно само замывает форму ядра, которую меряем).
       */
      const DOT_SIGMA = { 1: 3, 2: 3, 3: 7, 4: 14, 5: 24 };
      const rows = [];
      const LIMIT = Number(process.env.CROSS_LIMIT || 0.15);
      for (let lv = 1; lv <= LEVELS; lv += 1) {
        const uri = dotUri(DOT_SIGMA[lv] ?? 7);
        const swap = `(async()=>{const imgs=[...document.querySelectorAll(${Q}+' img')];
          for(const im of imgs){ im.loading='eager'; im.removeAttribute('srcset'); im.removeAttribute('sizes'); im.src=${JSON.stringify(uri)}; }
          const wait=(im)=>Promise.race([im.decode().then(()=>1).catch(()=>0), new Promise(r=>setTimeout(()=>r(-1),3000))]);
          await Promise.all(imgs.map(wait));
          return {n:imgs.length, ready:imgs.filter(im=>im.complete&&im.naturalWidth>0&&im.currentSrc.startsWith('data:')).length};})()`;
        // Навигация на каждую ступень: текстура снимается с <img> один раз,
        // и сменить размер пятна на живой странице нельзя.
        await release();
        await call("Page.navigate", { url: BASE + "/" });
        held = false;
        await sleep(4200);
        const early = await ev(swap);
        await scrollToSim();
        await sleep(1400);
        const late = await ev(swap);
        await sleep(800);
        inf = await simInfo();
        if (!inf?.hasCanvas || late.ready < late.n) {
          die(`проба на крест lv=${lv}: точечный кадр не встал (рано ${JSON.stringify(early)}, поздно ${JSON.stringify(late)})`);
          continue;
        }
        await layers({ canvas: true, fb: false });
        // Центр пятна: середина кадра (кроп cover симметричен).
        const cx = inf.left + inf.w / 2;
        const cy = inf.top + inf.h / 2;
        const row = [];
        for (const off of offs) {
          // ⚠️ БЕЗ ПЕРЕТАСКИВАНИЯ: кадр просит сам порт (тик в shouldRender,
          // см. vision-blur.tsx). Синтетический drag здесь однажды молча умер
          // посреди прогона — канвас застыл, и все ступени показали одну и ту
          // же «анизотропию 19,0 %» (поймал предохранитель вырожденной серии).
          await force({ lv, offset: off, mix: 1 });
          await sleep(300);
          await layers({ canvas: true, fb: false });
          await sleep(120);
          const im = await shot(process.env.CROSS_SAVE ? `kw-cross-${lv}-${off}` : null);
          // σ ядра — из собственного замера пятна: кольца обязаны следовать
          // за размытием, иначе на глубокой ступени они лежат внутри плато.
          const prof = [];
          for (let d = 0; d < 400; d += 1) prof.push(luma(px(im, Math.round(cx + d), Math.round(cy))));
          const peak = prof[0];
          const floorV = Math.min(...prof.slice(-40));
          const contrast = peak - floorV;
          // Полуспад — С СУБПИКСЕЛЕМ: целый индекс квантовал σ в две ступени
          // (3,4/4,25), и предохранитель вырожденной серии честно браковал
          // прогон, хотя канвас жил — квантовался ПРИБОР, а не эффект.
          const tHalf = floorV + contrast * 0.5;
          const iH = prof.findIndex((v) => v < tHalf);
          const half = iH > 0 ? iH - 1 + (prof[iH - 1] - tHalf) / (prof[iH - 1] - prof[iH]) : NaN;
          const sigmaPx = half > 0 ? half / 1.1774 : NaN;
          // Пятно почти растворилось — здесь ничего не измерено, и «крест
          // не виден» сказать нельзя: не видно ВООБЩЕ ничего.
          const measurable = contrast >= 8 && Number.isFinite(sigmaPx);
          const a = measurable ? anisotropy(im, cx, cy, sigmaPx) : { rings: [], worst: NaN };
          row.push({ off, sigmaPx: measurable ? +sigmaPx.toFixed(2) : null, contrast: +contrast.toFixed(1), measurable, ...a });
        }
        rows.push({ lv, dotSigma: DOT_SIGMA[lv] ?? 7, row });
        console.log(`   lv=${lv} (пятно σ=${DOT_SIGMA[lv]}): ` + row.map((q) =>
          `${q.off}→${q.measurable ? (q.worst * 100).toFixed(1) + "%" : "×"}(σ${q.sigmaPx ?? "—"} к${q.contrast})`).join("  "));
        // Вырожденная серия — «НЕ ИЗМЕРЕНО»: замороженный канвас однажды
        // выдал 19,0 % по всем ступеням и разъездам разом.
        const meas = row.filter((q) => q.measurable);
        if (meas.length < 3) {
          die(`крест lv=${lv}: измеримых точек ${meas.length} из ${row.length} — пятно σ=${DOT_SIGMA[lv]} не подходит ступени`);
        } else {
          degenerate(meas.map((q) => q.worst), `крест lv=${lv}`);
          degenerate(meas.map((q) => q.sigmaPx), `σ пятна lv=${lv}`);
        }
      }
      await force(null);
      results.cross = { offs, rows, limit: LIMIT };
      // Порог: 15 % расхождения осей и диагоналей на кольце — там звезда уже
      // читается глазом на однородном фоне. Сообщаем максимальный БЕЗОПАСНЫЙ
      // разъезд по каждой ступени; решение о числе — за дирижёром.
      let safe = Infinity;
      for (const { lv, row } of rows) {
        let last = 0;
        let seen = false;
        for (const q of row) {
          if (!q.measurable) continue;
          seen = true;
          if (q.worst <= LIMIT) last = q.off;
          else break;
        }
        console.log(`   ступень ${lv}: крест ≤ ${(LIMIT * 100).toFixed(0)} % держится до разъезда ${seen ? last : "НЕ ИЗМЕРЕНО"}`);
        if (seen && last < safe) safe = last;
      }
      results.cross.safe = safe;
      console.log(`   ⇒ БЕЗОПАСНЫЙ ПОТОЛОК РАЗЪЕЗДА (по худшей ИЗМЕРЕННОЙ ступени): ${safe}`);
    }

    /* =========================================================
       ФАЗА SEAM — ГДЕ ШИТЬ ПЕРЕХОД lv1→lv2.
       σ² на границе непрерывен ПО ПОСТРОЕНИЮ, но σ² не видит ФОРМУ ядра:
       звезда lv1 и пирамида lv2 при равной дисперсии — разные картинки, и
       пиксельная проба поймала щелчок 4,8 при рядовом шаге 0,84. Здесь
       меряется прямой A/B: |lv1@o₁(r) − lv2@o₂(r)| по сетке радиусов
       перекрытия — если у шва есть место, где формы сходятся, его выбирает
       замер, а не вкус. Третьим столбцом — честность обоих против blur(r).
       ========================================================= */
    async function phaseSeam() {
      const sched = await loadSched();
      if (!sched) return;
      /** Пара соседних ступеней: PAIR=1 → lv1/lv2, PAIR=2 → lv2/lv3… */
      const lvA = Number(process.env.PAIR || 1);
      const lvB = lvA + 1;
      const ceilTop = Number(process.env.CEIL || NaN);
      // Перекрытие: от пола старшей ступени до потолка младшей (потолок можно
      // приподнять через CEIL — argmin ищется и за кросс-потолком, чтобы
      // видеть, есть ли за ним минимум; итоговое число всё равно решают
      // dirizher-правила, а не прибор).
      const floorB = sched.levelFloor(lvB);
      const ceilA = Number.isFinite(ceilTop) ? ceilTop : sched.levelCeil(lvA);
      if (!(ceilA > floorB)) {
        die(`seam lv${lvA}/lv${lvB}: перекрытия нет (потолок ${ceilA.toFixed(2)} ≤ пол ${floorB.toFixed(2)})`);
        return;
      }
      const from = floorB + 0.02;
      const to = ceilA - 0.02;
      const stepR = Math.max((to - from) / 10, 0.02);
      console.log(`\n===== ШОВ lv${lvA}→lv${lvB}: A/B по перекрытию ${from.toFixed(2)}…${to.toFixed(2)} =====`);
      const o1 = (r) => offForRadius(sched, lvA, r);
      const o2 = (r) => offForRadius(sched, lvB, r);
      await release();
      await call("Page.navigate", { url: BASE + "/" });
      held = false;
      await sleep(4200);
      await scrollToSim();
      await sleep(1400);
      inf = await simInfo();
      if (!inf?.hasCanvas) {
        die("seam: канваса нет");
        return;
      }
      await drag(0.3);
      await settle();
      const pos = (await simInfo()).pos;
      const satCss = `saturate(${(1 - (pos / 100) * 0.15).toFixed(3)})`;
      const rect = {
        x: Math.round(inf.left + inf.w * 0.28),
        y: Math.round(inf.top + inf.h * 0.3),
        w: Math.round(inf.w * 0.44),
        h: Math.round(inf.h * 0.36),
      };
      const meanAbs = (a, b) => {
        let sum = 0,
          n = 0;
        for (let y = rect.y; y < rect.y + rect.h; y += 1) {
          for (let x = rect.x; x < rect.x + rect.w; x += 1) {
            sum += Math.abs(luma(px(a, x, y)) - luma(px(b, x, y)));
            n += 1;
          }
        }
        return sum / n;
      };
      const rows = [];
      for (let r = from; r <= to + 1e-9; r += stepR) {
        const a1 = o1(r);
        const a2 = o2(r);
        if (!Number.isFinite(a1) || !Number.isFinite(a2)) continue;
        await layers({ canvas: true, fb: false });
        await force({ lv: lvA, offset: a1, mix: 1 });
        await sleep(280);
        const im1 = await shot(null);
        await force({ lv: lvB, offset: a2, mix: 1 });
        await sleep(280);
        const im2 = await shot(null);
        await layers({ canvas: false, fb: true, filter: `blur(${r.toFixed(2)}px) ${satCss}`, noScale: true });
        await sleep(280);
        const ref = await shot(null);
        const ab = meanAbs(im1, im2);
        const d1 = meanAbs(im1, ref);
        const d2 = meanAbs(im2, ref);
        rows.push({ r: +r.toFixed(2), o1: +a1.toFixed(3), o2: +a2.toFixed(3), ab: +ab.toFixed(3), d1: +d1.toFixed(3), d2: +d2.toFixed(3) });
        console.log(`   r=${r.toFixed(2)}: lv${lvA}@${a1.toFixed(2)} против lv${lvB}@${a2.toFixed(2)} → A/B ${ab.toFixed(3)}; честность lv${lvA} ${d1.toFixed(3)}, lv${lvB} ${d2.toFixed(3)}`);
      }
      await force(null);
      results.seam = { pair: [lvA, lvB], pos, rect, rows };
      degenerate(rows.map((q) => q.ab), "seam: A/B по сетке");
      const best = rows.reduce((w, q) => (q.ab < (w?.ab ?? Infinity) ? q : w), null);
      if (best) {
        // Минимум ЕСТЬ или это плато? Плато = не из чего выбирать точку.
        const spread = Math.max(...rows.map((q) => q.ab)) - best.ab;
        const plateau = spread < Math.max(0.15 * best.ab, 0.1);
        console.log(`   ⇒ минимальный шов lv${lvA}→lv${lvB}: r=${best.r} (A/B ${best.ab}); размах ${spread.toFixed(3)}${plateau ? " — ПЛАТО, минимум не выделен" : ""}`);
        results.seam.best = { ...best, plateau };
      }
    }

    /* ФАЗА DIAGDRAG — почему умирает синтетическое перетаскивание. */
    async function phaseDiagDrag() {
      await release();
      await call("Page.navigate", { url: BASE + "/" });
      held = false;
      await sleep(4200);
      await scrollToSim();
      await sleep(1200);
      inf = await simInfo();
      // Регистрируем свидетелей: какие события завершения видит контейнер.
      await ev(`(()=>{window.__evt=[];const s=document.querySelectorAll(${Q})[${SIM}];
        for(const t of ['pointerup','pointercancel','lostpointercapture','pointerdown'])
          s.addEventListener(t,(e)=>window.__evt.push(t+':'+e.pointerId+':'+(e.isTrusted?'T':'S')+':'+Date.now()%100000));
        return 0;})()`);
      await ev(`(()=>{const s=document.querySelectorAll(${Q})[${SIM}];
        const c=s.querySelector('canvas'); if(c){c.__probeTag='alpha';}
        s.__probeTag='host'; return 0;})()`);
      const canvasId = () => ev(`(()=>{const s=document.querySelectorAll(${Q})[${SIM}];
        const c=s.querySelector('canvas');
        return {sameHost:s.__probeTag==='host', sameCanvas:c?c.__probeTag==='alpha':null,
          cw:c?c.width:0, cssW:c?c.style.width:null};})()`);
      const withShots = !!process.env.SHOTS;
      const withLayers = !!process.env.LAYERS;
      const fine = !!process.env.FINE;
      const part = process.env.FINEPART || "all";
      const wantPre = fine && (part === "all" || part === "pre");
      const wantSteps = fine && (part === "all" || part === "steps");
      const wantClip = fine && (part === "all" || part === "clip");
      console.log(`DIAGDRAG: шоты=${withShots} layers=${withLayers} мелкий=${fine} часть=${part}`);
      if (wantPre) await layers({ canvas: true, fb: false });
      for (let i = 0; i < 9; i += 1) {
        const frac = wantSteps ? 0.251 + i * 0.0078 : 0.18 + i * 0.025;
        await hold(frac);
        await sleep(300);
        if (withLayers) await layers({ canvas: true, fb: false });
        await sleep(150);
        if (wantClip) {
          await ev(`(()=>{const c=document.querySelectorAll(${Q})[${SIM}].querySelector('canvas');
            return c?c.style.clipPath:null;})()`);
        }
        if (withShots) {
          await shot(null);
          await sleep(120);
          await shot(null);
        }
        const a = await simInfo();
        const evts = await ev("JSON.stringify(window.__evt)");
        const cid = await canvasId();
        console.log(`   #${i} frac=${frac.toFixed(4)} pos=${a.pos} канвас=${JSON.stringify(cid)} события=${evts}`);
      }
      await release();
    }

    /* =========================================================
       ФАЗА MATCH — ЧЕСТНОСТЬ КАНДИДАТА НА НАСТОЯЩЕЙ ФОТОГРАФИИ.
       Решающий вопрос дыры 2,4…4,3 px: НАСКОЛЬКО кадр пары (ступень,
       разъезд) отличается от честного blur(r) фолбэка — в пикселях, на
       живом снимке, где артефакт и был бы виден человеку. σ² здесь не
       судья: крест — четырёхлучевая структура, второй момент её не видит.
       ========================================================= */
    async function phaseMatch() {
      console.log("\n===== ЧЕСТНОСТЬ ПРОТИВ ФОЛБЭКА (реальное фото) =====");
      const sched = await loadSched();
      if (!sched) return;
      /**
       * Кандидаты строятся ИЗ СКОМПИЛИРОВАННОГО расписания (обращение
       * текущей LEVEL_REQ), а не из зашитого списка: зашитые разъезды уже
       * пережили одну смену ядра и молча предлагали старое обращение.
       * Радиусы — те же, что в историческом прогоне 30 июля: столбцы
       * сравнимы между ядрами. Кандидат за пределами измеренной кривой
       * ступени не выдумывается, а пропускается с пометкой.
       */
      const CAND = [];
      const wants = [
        ...[2.0, 2.6, 3.2, 3.8, 4.3].map((r) => ({ r, lv: 1 })),
        ...[4.3, 5.0, 6.0].map((r) => ({ r, lv: 2 })),
        ...(process.env.MATCH_EXTRA || "")
          .split(";")
          .filter(Boolean)
          .map((s) => {
            const [lv, r] = s.split("@").map(Number);
            return { r, lv };
          }),
      ];
      for (const w of wants) {
        const pts = sched.LEVEL_REQ[w.lv - 1];
        const lo = pts[0][1];
        const hi = pts[pts.length - 1][1];
        if (w.r < lo - 1e-9 || w.r > hi + 1e-9) {
          console.log(`   (lv${w.lv} при r=${w.r} вне измеренной кривой ${lo.toFixed(2)}…${hi.toFixed(2)} — пропущен)`);
          continue;
        }
        CAND.push({ r: w.r, lv: w.lv, off: +offForRadius(sched, w.lv, w.r).toFixed(3) });
      }
      await release();
      await call("Page.navigate", { url: BASE + "/" });
      held = false;
      await sleep(4200);
      await scrollToSim();
      await sleep(1400);
      inf = await simInfo();
      if (!inf?.hasCanvas) {
        die("match: канваса нет");
        return;
      }
      // Позиция кладётся кликом и снапится сама (шаг 4) — severity после
      // этого стабильна, и потеря насыщенности у GL известна точно.
      await drag(0.3);
      await settle();
      const pos = (await simInfo()).pos;
      const sat = 1 - (pos / 100) * 0.15;
      const satCss = `saturate(${sat.toFixed(3)})`;
      console.log(`   позиция ${pos?.toFixed?.(2)} %, насыщенность ${sat.toFixed(3)}`);
      const rect = {
        x: Math.round(inf.left + inf.w * 0.28),
        y: Math.round(inf.top + inf.h * 0.3),
        w: Math.round(inf.w * 0.44),
        h: Math.round(inf.h * 0.36),
      };
      /**
       * Две метрики разом: средняя |Δ| и ХУДШИЙ БЛОК 16×16.
       * ⚠️ Локальная — обязательна (требование `dirizher`): крест четырёх
       * тапов — ЛОКАЛЬНЫЙ артефакт, он живёт на точечных светах, и среднее
       * по кадру утопило бы его на трёх бликах. Вердикт «кто честнее»
       * обязан устоять на ОБЕИХ метриках.
       */
      const diff2 = (a, b) => {
        let sum = 0,
          n = 0;
        const BS = 16;
        let blockWorst = 0;
        for (let by = rect.y; by + BS <= rect.y + rect.h; by += BS) {
          for (let bx = rect.x; bx + BS <= rect.x + rect.w; bx += BS) {
            let bsum = 0;
            for (let y = by; y < by + BS; y += 1) {
              for (let x = bx; x < bx + BS; x += 1) {
                const d = Math.abs(luma(px(a, x, y)) - luma(px(b, x, y)));
                sum += d;
                bsum += d;
                n += 1;
              }
            }
            const bm = bsum / (BS * BS);
            if (bm > blockWorst) blockWorst = bm;
          }
        }
        return { mean: sum / n, block: blockWorst };
      };
      const meanAbs = (a, b) => diff2(a, b).mean;
      // Пол шума прибора: два снимка ОДНОГО состояния.
      await layers({ canvas: false, fb: true, filter: `blur(3px) ${satCss}`, noScale: true });
      await sleep(350);
      const n1 = await shot(null);
      await sleep(250);
      const n2 = await shot(null);
      const noise = meanAbs(n1, n2);
      console.log(`   пол шума (два снимка одного состояния): ${noise.toFixed(3)}`);
      const rows = [];
      for (const c of CAND) {
        await layers({ canvas: false, fb: true, filter: `blur(${c.r}px) ${satCss}`, noScale: true });
        await sleep(320);
        const ref = await shot(null);
        await layers({ canvas: true, fb: false });
        await force({ lv: c.lv, offset: c.off, mix: 1 });
        await sleep(320);
        await layers({ canvas: true, fb: false });
        await sleep(120);
        const gl = await shot(process.env.MATCH_SAVE ? `kw-match-lv${c.lv}-r${c.r}` : null);
        const d = diff2(gl, ref);
        rows.push({ ...c, d: +d.mean.toFixed(3), dBlock: +d.block.toFixed(3) });
        console.log(`   r=${c.r} px, lv${c.lv} o=${c.off} → Δ против blur(${c.r}): средняя ${d.mean.toFixed(3)}, худший блок 16×16 ${d.block.toFixed(3)}`);
      }
      await force(null);
      // Пол шума 0,000 — это ДЕТЕРМИНИЗМ HEADLESS, а не фантастическая
      // точность прибора; живой GPU телефона так не обещает (зона fizik).
      results.match = { pos, noise: +noise.toFixed(3), rect, rows };
      degenerate(rows.map((q) => q.d), "match: Δ по кандидатам");
      // Вердикт по конкурирующим кандидатам одного радиуса — ОБЕИМИ метриками.
      const byR = new Map();
      for (const q of rows) {
        if (!byR.has(q.r)) byR.set(q.r, []);
        byR.get(q.r).push(q);
      }
      for (const [r, cands] of byR) {
        if (cands.length < 2) continue;
        const byMean = [...cands].sort((a, b) => a.d - b.d)[0];
        const byBlock = [...cands].sort((a, b) => a.dBlock - b.dBlock)[0];
        console.log(`   r=${r}: честнее по средней — lv${byMean.lv}@${byMean.off}; по худшему блоку — lv${byBlock.lv}@${byBlock.off}`);
        if (byMean.lv !== byBlock.lv) {
          die(`match r=${r}: метрики РАСХОДЯТСЯ в вердикте (средняя за lv${byMean.lv}, локальная за lv${byBlock.lv}) — крест реален для глаза, вилка кроссфейда, СТОП к дирижёру`);
        }
      }
    }

    /* =========================================================
       ФАЗА CAL — ОБРАЩЕНИЕ ТАБЛИЦЫ.
       ========================================================= */
    const RADII = (process.env.RADII ||
      "0.5,0.75,1,1.5,2,2.5,3,4,5,6,7,8,10,12,14,16,19,22,26,30,34")
      .split(",")
      .map(Number);
    const OFFS = (process.env.OFFS || "0,0.15,0.3,0.45,0.6,0.75,0.9,1.05,1.2,1.35,1.5")
      .split(",")
      .map(Number);

    async function calOne(sigma0, inject = 1) {
      console.log(`\n===== ЭТАЛОН σ₀ = ${sigma0} px, DSF ${DSF} =====`);
      if (!(await prepare(sigma0, `σ₀=${sigma0}`))) return null;
      await jiggle();
      inf = await simInfo();

      /* --- гейт PASSTHROUGH: три состояния, одно σ² --- */
      await force(null);
      await layers({ canvas: false, fb: false });
      await sleep(350);
      const base = await measure(`kw-s${sigma0}-base`);
      await layers({ canvas: false, fb: true, blur: 0, noScale: true });
      await sleep(350);
      const fbZero = await measure(`kw-s${sigma0}-fb0`);
      await layers({ canvas: true, fb: false });
      await force({ lv: 1, offset: 0, mix: 0 });
      await jiggle();
      await layers({ canvas: true, fb: false });
      await sleep(250);
      const glZero = await measure(`kw-s${sigma0}-gl0`);
      console.log(`PASSTHROUGH σ²: резкий DOM ${base.sigma2} | фолбэк blur(0) ${fbZero.sigma2} | канвас mix=0 ${glZero.sigma2}`);
      for (const [nm, m] of [["резкий DOM", base], ["фолбэк", fbZero], ["канвас", glZero]]) {
        if (!m.valid) {
          die(`passthrough «${nm}» НЕ ГОДЕН: подъём ${m.rise}, хвост ${m.tail}, участок ${m.trim}, контраст ${m.span}`);
        }
      }
      const tol = Math.max(0.6, base.sigma2 * 0.05);
      const dFb = Math.abs(fbZero.sigma2 - base.sigma2);
      const dGl = Math.abs(glZero.sigma2 - base.sigma2);
      console.log(`   расхождение с резким DOM: фолбэк ${dFb.toFixed(3)}, канвас ${dGl.toFixed(3)} (допуск ${tol.toFixed(3)})`);
      if (dFb > tol) {
        die(`PASSTHROUGH ФОЛБЭКА (σ₀=${sigma0}): Δσ² ${dFb.toFixed(3)} > ${tol.toFixed(3)} — ветки показывают РАЗНУЮ картинку, сырые числа сравнивать нельзя`);
      }
      if (dGl > tol) {
        die(`PASSTHROUGH КАНВАСА (σ₀=${sigma0}): Δσ² ${dGl.toFixed(3)} > ${tol.toFixed(3)} — канвас и DOM показывают РАЗНОЕ`);
      }

      /* --- шкала: сырое σ² честного blur(r) --- */
      console.log("\nШКАЛА CSS-ФОЛБЭКА (сырое σ², без вычитаний):");
      await force(null);
      await layers({ canvas: false, fb: true, noScale: true });
      const css = [];
      for (const r of RADII) {
        // При негативном контроле шкала ЭТОГО эталона рисуется испорченной
        // (blur r·inject), а записывается под честным r — ровно так выглядела
        // бы ошибка калибровки, которую гейт обязан поймать.
        await layers({ canvas: false, fb: true, blur: r * inject, noScale: true });
        await sleep(300);
        const m = await measure(null);
        css.push({ r, ...m });
        console.log(`   blur(${String(r).padStart(5)} px) → σ² ${String(m.sigma2).padStart(9)}` +
          (m.valid ? "" : "  НЕ ИЗМЕРЕНО") + `  (подъём ${m.rise}, хвост ${m.tail}, участок ${m.trim})`);
      }
      const cssOk = css.filter((c) => c.valid);
      if (cssOk.length < Math.ceil(RADII.length * 0.8)) {
        die(`шкала фолбэка (σ₀=${sigma0}): годных точек ${cssOk.length} из ${RADII.length}`);
      }
      for (let i = 1; i < cssOk.length; i++) {
        if (cssOk[i].sigma2 <= cssOk[i - 1].sigma2) {
          die(`шкала фолбэка (σ₀=${sigma0}) НЕ МОНОТОННА: blur(${cssOk[i - 1].r})→${cssOk[i - 1].sigma2}, blur(${cssOk[i].r})→${cssOk[i].sigma2}`);
          break;
        }
      }
      degenerate(cssOk.map((c) => c.sigma2), `шкала фолбэка (σ₀=${sigma0})`);

      /* --- САМОПРОВЕРКА МЕТРИКИ: АДДИТИВНОСТЬ ВТОРОГО МОМЕНТА ---
         Второй момент при свёртке складывается ТОЧНО, а CSS-фолбэк — честный
         гауссиан с σ = r. Значит сырое σ² обязано равняться базе плюс r², и
         отклонение от этого есть ПРЯМАЯ мера systematic-ошибки метрики —
         независимая от гейта согласия и от расписания.
         ⚠️ Именно здесь видно, чего стоила обрезка хвостов: с ней отклонение
         РОСЛО с шириной (−2,9 % на blur(2) → −6,0 % на blur(14)), то есть
         вносило зависимость от масштаба — ровно ту, из-за которой два эталона
         не сходились. Без обрезки оно почти постоянно (≈−2 %), и остаток
         объясняется тем, что Chrome приближает гауссиан тремя боксами. */
      let addWorst = 0;
      let addAt = null;
      const addRows = [];
      for (const c of cssOk) {
        const expect = base.sigma2 + c.r * c.r;
        const rel = (c.sigma2 - expect) / expect;
        addRows.push({ r: c.r, expect: +expect.toFixed(2), got: c.sigma2, rel: +(rel * 100).toFixed(2) });
        if (Math.abs(rel) > Math.abs(addWorst)) { addWorst = rel; addAt = c.r; }
      }
      console.log(`   АДДИТИВНОСТЬ (σ² = база + r², метрика «${METRIC}»): худшее отклонение ` +
        `${(addWorst * 100).toFixed(2)} % при blur(${addAt}); по сетке ` +
        addRows.slice(0, 8).map((a) => `${a.r}:${a.rel > 0 ? "+" : ""}${a.rel}%`).join(" "));
      // ⚠️ При впрыске ошибки аддитивность падает ПО ПОСТРОЕНИЮ — её отказ
      // здесь глушится, иначе негативный контроль доказывал бы не гейт
      // согласия, а этот предохранитель. Ловить впрыск обязан ИМЕННО ГЕЙТ.
      if (Math.abs(addWorst) > 0.08 && inject === 1) {
        die(`метрика «${METRIC}» НЕ АДДИТИВНА (σ₀=${sigma0}): отклонение ${(addWorst * 100).toFixed(2)} % при blur(${addAt}) — ` +
          `сырые числа двух ветвей сравнивать нельзя, систематика зависит от масштаба`);
      }
      const drift = addRows.length > 3
        ? addRows[addRows.length - 1].rel - addRows[0].rel
        : 0;
      console.log(`   дрейф систематики от мелкого к крупному радиусу: ${drift > 0 ? "+" : ""}${drift.toFixed(2)} п. п.`);
      results[`add_${sigma0}`] = { worst: +(addWorst * 100).toFixed(2), at: addAt, drift: +drift.toFixed(2), rows: addRows };

      /* --- цепочка: сырое σ² по сетке (уровень × разъезд) --- */
      console.log("\nЦЕПОЧКА (сырое σ², порт калибровки):");
      await layers({ canvas: true, fb: false });
      const gl = [];
      for (let lv = 1; lv <= LEVELS; lv += 1) {
        const row = [];
        for (const off of OFFS) {
          await force({ lv, offset: off, mix: 1 });
          await jiggle();
          await layers({ canvas: true, fb: false });
          await sleep(230);
          row.push({ off, ...(await measure(null)) });
        }
        gl.push({ lv, row });
        console.log(`   lv=${lv}: ` + row.map((q) => `${q.off}→${q.valid ? q.sigma2 : "×"}`).join("  "));
        degenerate(row.filter((q) => q.valid).map((q) => q.sigma2), `ступень ${lv} (σ₀=${sigma0})`);
      }
      await force(null);
      return { sigma0, base, fbZero, glZero, css, gl };
    }

    /**
     * ОБРАЩЕНИЕ: для радиуса r берётся сырое σ² фолбэка при этом r, и по
     * измеренной кривой ступени ищется разъезд, дающий ТО ЖЕ сырое σ².
     * Смещение обрезки входит в оба числа и сокращается — ни одного
     * свободного параметра, ни одной аналитической формы.
     */
    const invert = (run, r) => {
      const target = interp(
        run.css.filter((c) => c.valid).map((c) => ({ x: c.r, y: c.sigma2 })),
        r
      );
      const out = [];
      for (const { lv, row } of run.gl) {
        const ok = row.filter((q) => q.valid);
        if (ok.length < 3) {
          out.push({ lv, off: NaN, why: "мало годных точек" });
          continue;
        }
        const floorV = ok[0].sigma2;
        const ceilV = ok[ok.length - 1].sigma2;
        if (!(target >= floorV)) {
          out.push({ lv, off: NaN, why: "пол выше цели" });
          continue;
        }
        if (!(target <= ceilV)) {
          out.push({ lv, off: NaN, why: "не дотянуть" });
          continue;
        }
        out.push({ lv, off: interp(ok.map((q) => ({ x: q.sigma2, y: q.off })), target), floorV, ceilV });
      }
      return { target, out };
    };

    async function phaseCal() {
      const sigmas = (process.env.SIGMAS || "4,10").split(",").map(Number);
      const runs = [];
      if (INJECT) {
        console.log(`\n⚠️ НЕГАТИВНЫЙ КОНТРОЛЬ: шкала второго эталона испорчена множителем ${INJECT} — гейт ОБЯЗАН провалиться`);
      }
      for (let i = 0; i < sigmas.length; i += 1) {
        const r = await calOne(sigmas[i], INJECT && i === 1 ? INJECT : 1);
        if (r) runs.push(r);
      }
      results.cal = { radii: RADII, offs: OFFS, runs };
      if (runs.length < sigmas.length) {
        die(`калибровка: годных прогонов ${runs.length} из ${sigmas.length} — гейт согласия эталонов провести не на чем`);
        if (!runs.length) return;
      }

      console.log("\n===== ОБРАЩЕНИЕ ТАБЛИЦЫ =====");
      const R_REPORT = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 19, 22, 26, 30];
      const agree = [];
      const table = [];
      for (const r of R_REPORT) {
        const cells = runs.map((run) => invert(run, r));
        table.push({ r, cells });
        console.log(
          `r=${String(r).padStart(4)}  ` +
            cells
              .map((c, i) => {
                const parts = c.out.map((o) =>
                  Number.isFinite(o.off) ? `lv${o.lv}:${o.off.toFixed(3)}` : `lv${o.lv}:—`
                );
                return `σ₀=${runs[i].sigma0} [цель ${Number.isFinite(c.target) ? c.target.toFixed(1) : "—"}] ${parts.join(" ")}`;
              })
              .join("   |   ")
        );
        if (runs.length >= 2) {
          for (let k = 0; k < Math.min(cells[0].out.length, cells[1].out.length); k++) {
            const a = cells[0].out[k].off,
              b = cells[1].out[k].off;
            if (Number.isFinite(a) && Number.isFinite(b) && a > 0.05 && b > 0.05) {
              agree.push({ r, lv: cells[0].out[k].lv, a, b, rel: Math.abs(a - b) / ((a + b) / 2) });
            }
          }
        }
      }
      results.cal.table = table;

      /* ---------------------------------------------------------------
         ГЕЙТ СОГЛАСИЯ В ПРЯМУЮ СТОРОНУ: сходятся ли эталоны в том, КАКОЙ
         РАДИУС даёт пара (ступень, разъезд).

         ⚠️ Зачем рядом с обратным. Обратный гейт спрашивает «какой разъезд
         нужен для радиуса r», и у самого пола ступени этот вопрос ПЛОХО
         ОБУСЛОВЛЕН: σ² растёт как разъезд в КВАДРАТЕ, поэтому у нуля
         dσ²/do → 0, и расхождение в σ² на проценты превращается в
         расхождение в разъезде в десятки процентов. Разъезд — внутренняя
         ручка машинерии; человек видит РАДИУС. Прямая сторона спрашивает
         ровно про него и обусловлена хорошо.

         Допуск с АБСОЛЮТНЫМ полом: относительная мера у нуля бессмысленна —
         «13 % расхождения» между 1,80 и 2,05 px размытия есть четверть
         пикселя, которую не видно ни на одном экране.
         --------------------------------------------------------------- */
      if (runs.length >= 2) {
        console.log("\n===== СОГЛАСИЕ ЭТАЛОНОВ В ПРЯМУЮ СТОРОНУ (радиус, который даёт пара lv/разъезд) =====");
        const radiusOf = (run, sigma2) =>
          interp(run.css.filter((c) => c.valid).map((c) => ({ x: c.sigma2, y: c.r })), sigma2);
        const fwd = [];
        for (let k = 0; k < runs[0].gl.length; k += 1) {
          const rowA = runs[0].gl[k];
          const rowB = runs[1].gl.find((g) => g.lv === rowA.lv);
          if (!rowB) continue;
          const line = [];
          for (let i = 0; i < rowA.row.length; i += 1) {
            const a = rowA.row[i];
            const b = rowB.row.find((q) => q.off === a.off);
            if (!a?.valid || !b?.valid) continue;
            const ra = radiusOf(runs[0], a.sigma2);
            const rb = radiusOf(runs[1], b.sigma2);
            if (!Number.isFinite(ra) || !Number.isFinite(rb)) continue;
            const mean = (ra + rb) / 2;
            const dAbs = Math.abs(ra - rb);
            const tol = Math.max(0.05 * mean, 0.3);
            fwd.push({ lv: rowA.lv, off: a.off, ra, rb, dAbs, tol, ok: dAbs <= tol });
            line.push(`${a.off}→${ra.toFixed(2)}/${rb.toFixed(2)}${dAbs <= tol ? "" : " ✗"}`);
          }
          console.log(`   lv=${rowA.lv}: ` + line.join("  "));
        }
        /* ⚠️ ЭТО И ЕСТЬ ГЕЙТ (решение dirizher, 30 июля): два эталона обязаны
           сойтись в РАДИУСЕ, который даёт пара (ступень, разъезд), допуск
           max(5 %, 0,3 px). Прежний гейт на ОБРАЩЕНИИ (разъезд для радиуса r)
           требовал точности от плохо обусловленной величины: у пола ступени
           dσ²/do → 0, и проценты σ² превращались в десятки процентов разъезда.
           Обратная сторона осталась ниже — справочной диагностикой.

           ДОМЕН ГЕЙТА — МЕХАНИЧЕСКИ ИЗ ПОСТРОЕННОГО РАСПИСАНИЯ (В1): гейт
           судит пары, до которых расписанию есть дело, плюс один шаг сетки
           запаса. Список пар руками не перечисляется НИКОГДА: домен
           вычисляется прогоном скомпилированного `kawase-schedule` по всему
           рабочему диапазону обеих плотностей — изменится расписание, домен
           поедет за ним сам. Полы глубоких ступеней (чистые билинейные
           пирамиды, самые негауссовы ядра цепочки) расписание обходит, и их
           расхождение печатается СПРАВОЧНО, без вердикта. Провал В ДОМЕНЕ —
           честный СТОП, второй раз домен не сужается. */
        let domain = null;
        try {
          const sched = await import(
            "file://" + process.cwd().replace(/\\/g, "/") + "/.tmp-test/lib/kawase-schedule.js"
          );
          const R_WORK = 0.013 * 1232 * 2; // DSF-кап 2; DSF 1 — подмножество
          domain = new Map();
          for (let r = 0.01; r <= R_WORK; r += 0.005) {
            const p = sched.planChain(r, LEVELS);
            if (p.lv < 1) continue;
            const cur = domain.get(p.lv) ?? { min: Infinity, max: -Infinity };
            cur.min = Math.min(cur.min, p.offset);
            cur.max = Math.max(cur.max, p.offset);
            domain.set(p.lv, cur);
          }
          const gridStep = OFFS.length > 1 ? OFFS[1] - OFFS[0] : 0.15;
          for (const [lv, d] of domain) {
            d.min = Math.max(0, d.min - gridStep);
            d.max += gridStep;
          }
          console.log("   домен гейта (из расписания, ±шаг сетки): " +
            [...domain.entries()].map(([lv, d]) => `lv${lv}: ${d.min.toFixed(2)}…${d.max.toFixed(2)}`).join("  "));
        } catch (e) {
          console.log("   ⚠️ скомпилированного расписания нет (.tmp-test) — домен не вычислен, гейт судит ВСЕ пары");
        }
        const inDomain = (f) => {
          if (!domain) return true;
          const d = domain.get(f.lv);
          return !!d && f.off >= d.min && f.off <= d.max;
        };
        const bad = fwd.filter((f) => !f.ok && inDomain(f));
        const badOut = fwd.filter((f) => !f.ok && !inDomain(f));
        const judged = fwd.filter(inDomain);
        const worst = bad.reduce((w, f) => (f.dAbs - f.tol > (w ? w.dAbs - w.tol : -1e9) ? f : w), null);
        console.log(`   пар ${fwd.length} (в домене ${judged.length}), вне допуска в домене ${bad.length}` +
          (badOut.length ? `; вне домена расходятся ${badOut.length} (справочно: ${badOut.map((f) => `lv${f.lv} o=${f.off}: ${f.ra.toFixed(2)}/${f.rb.toFixed(2)}`).join(", ")})` : "") +
          (worst ? `; худшая в домене lv${worst.lv} o=${worst.off}: ${worst.ra.toFixed(2)} против ${worst.rb.toFixed(2)} px` : ""));
        results.cal.forward = { pairs: fwd.length, judged: judged.length, bad: bad.length, badOut: badOut.length, worst };
        if (judged.length < 8) {
          die(`гейт согласия (прямая сторона): судимых пар всего ${judged.length} — мало для вердикта`);
        } else if (bad.length) {
          die(`ГЕЙТ СОГЛАСИЯ ЭТАЛОНОВ ПРОВАЛЕН (прямая сторона, в домене расписания): ${bad.length} пар из ${judged.length}` +
            (worst ? `; худшая lv${worst.lv} o=${worst.off}: ${worst.ra.toFixed(2)} против ${worst.rb.toFixed(2)} px` : ""));
        }

        console.log("\n===== ОБРАТНАЯ СТОРОНА (справочно: разъезд для радиуса r, допуск 5 %) =====");
        if (!agree.length) {
          console.log("   сопоставимых пар нет");
        } else {
          let worstR = 0,
            worstAt = null;
          for (const a of agree) if (a.rel > worstR) { worstR = a.rel; worstAt = a; }
          const badR = agree.filter((a) => a.rel > 0.05);
          console.log(`   пар сравнено ${agree.length}, вне 5 % — ${badR.length}, худшее ${(worstR * 100).toFixed(1)} %` +
            (worstAt ? ` (r=${worstAt.r}, lv${worstAt.lv}: ${worstAt.a.toFixed(3)} против ${worstAt.b.toFixed(3)})` : ""));
          for (const b of badR.slice(0, 14)) {
            console.log(`      r=${b.r} lv${b.lv}: ${b.a.toFixed(3)} / ${b.b.toFixed(3)} — ${(b.rel * 100).toFixed(1)} %`);
          }
          results.cal.agree = { pairs: agree.length, bad: badR.length, worst: +(worstR * 100).toFixed(1) };
          // Диагностика НЕ роняет прогон: у пола ступени эта величина плохо
          // обусловлена, и её расхождение — свойство вопроса, не данных.
        }
      }
    }

    /* ---------------- порядок фаз ---------------- */
    const portOk =
      PHASE === "base" || PHASE === "sweep" || PHASE === "diagdrag" ? true : await phaseHook();
    if (PHASE === "hook") {
      // фаза сама себе вердикт
    } else if (PHASE === "sweep") {
      await phaseSweep();
    } else if (PHASE === "base") {
      await phaseBase();
    } else if (PHASE === "cal") {
      if (portOk) await phaseCal();
    } else if (PHASE === "cross") {
      if (portOk) await phaseCross();
    } else if (PHASE === "match") {
      if (portOk) await phaseMatch();
    } else if (PHASE === "diagdrag") {
      await phaseDiagDrag();
    } else if (PHASE === "seam") {
      if (portOk) await phaseSeam();
    } else {
      await phaseBase();
      if (portOk) await phaseCal();
    }

    fs.writeFileSync(`${OUT}/kawase-cal.json`, JSON.stringify(results, null, 1));
    console.log(`\nсырые числа: ${OUT}/kawase-cal.json`);
  } finally {
    chrome.kill();
  }
  if (fail.length) {
    console.log("\n⛔️ ПРОГОН ПРОВАЛЕН:");
    for (const f of fail) console.log("   · " + f);
    process.exit(1);
  }
  console.log("\n✅ все предохранители прошли");
}

main().catch((e) => {
  console.error("ПАДЕНИЕ:", e);
  process.exit(1);
});

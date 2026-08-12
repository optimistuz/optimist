/**
 * ПРИБОР РАНТАЙМА ШТОРКИ (хронометрист; введён замером шага 7 этапа 6).
 *
 * ⚠️ ПОЧЕМУ ОН В РЕПОЗИТОРИИ, А НЕ В ВРЕМЕННОЙ ПАПКЕ. На этом приборе стоят
 * ВЕРДИКТЫ КАНОНА: им закрыты три красных пункта рантайм-замера этапа 6
 * (вечный цикл шторки, 138 пересборок цепочки FBO, дребезг клапана) и снят
 * остаточный риск клапана `renderScale` из «6б». Проект уже платил за прибор
 * в `%TEMP%`: вся кампания «6б» держалась на скрипте, жившем в чужой сессии,
 * и числа plan.md оказались НЕВОСПРОИЗВОДИМЫ. Прибор, который нельзя
 * запустить снова, — не прибор, а воспоминание.
 *
 * ЧТО МЕРИТ (четыре вещи, которые иначе неотличимы друг от друга):
 *  1. ЦЕНУ СЛОЯ, ЛЕЖАЩЕГО ЧЕРЕЗ `mix-blend-mode` НАД ПОКАДРОВЫМ КАНВАСОМ.
 *     Композитор обязан перечитывать backdrop каждый кадр перетаскивания;
 *     слой выключается `visibility: hidden` на узле со `screen` — тем же
 *     способом, что в `probe-halation.mjs`.
 *  2. ЧАСТОТУ ШАГОВ КЛАПАНА `renderScale` — под жестом и в покое, по
 *     ФАКТИЧЕСКИМ сменам `canvas.width` (без запроса layout: `clientWidth`
 *     кэшируется, иначе прибор сам бы утяжелял кадр).
 *  3. ПЕРЕСБОРКИ ЦЕПОЧКИ FBO — счётчиком реальных вызовов
 *     `deleteFramebuffer`/`createFramebuffer`, а не чтением кода. Так
 *     доказана починка «пересобираем только на рост»: 0 пересборок при
 *     17–26 сменах размера буфера за прогон.
 *  4. ВЕЧНЫЙ ЦИКЛ В ПОКОЕ — отрисовки GL за 60 с без единого касания
 *     (было 2 392, стало 0).
 *
 * СТЕНД (обязателен, иначе числа несравнимы с реестром):
 *  · Chrome ГОЛОВНОЙ — нужен настоящий GPU; swiftshader соврал бы про
 *    цену шейдера и филлрейт слоя;
 *  · 390×844, `deviceScaleFactor` 3 → DPR-кап 2 у канваса, CPU 4×;
 *  · **ПРОД-сборка (`next start`), а не dev.** Прибор сверяет
 *    ВЕРСИОНИРОВАННЫЙ маршрутный чанк и падает на dev-сборке: подмена
 *    стенда невозможна по построению. По умолчанию порт 3100 — чтобы не
 *    делить `.next` с живым `npm run dev` (сборка и dev топят друг друга).
 *
 *   npx next start -p 3100        # dev ПОГАСИТЬ
 *   node scripts/probe-runtime.mjs
 *
 * ⚠️ ЖИВОЙ ТЕЛЕФОН (`ATTACH=1`) — ЭТО ДРУГОЙ СТЕНД, А НЕ ТОТ ЖЕ САМЫЙ.
 * Прибор присоединяется к уже открытой вкладке Chrome на устройстве и
 * НЕ НАВЯЗЫВАЕТ ЖЕЛЕЗО: ни метрик, ни DPR, ни CPU-троттлинга, ни тач-
 * эмуляции (иначе он померил бы гибрид, которого нет в природе, — см.
 * `scripts/lib/cdp-stand.mjs`). Плотность и вьюпорт ЧИТАЮТСЯ с телефона
 * и печатаются: у A54 DPR 2,625, и все числа нормировки цепочки зависят
 * от него. Подлинность устройства доказывается UA, вкладка обязана быть
 * на экране. Числа attach-прогона С ЭМУЛЯЦИОННЫМИ НЕ СРАВНИВАЮТСЯ
 * НАПРЯМУЮ — это разные стенды, и оба честные.
 *
 *   adb forward tcp:9821 localabstract:chrome_devtools_remote   # CDP с телефона
 *   adb reverse tcp:3100 tcp:3100                               # стенд с этой машины
 *   ATTACH=1 BASE=http://127.0.0.1:3100 node scripts/probe-runtime.mjs
 *
 * ⚠️ Свип на устройстве идёт СИНТЕТИЧЕСКИМ жестом (события в странице), и
 * это законно ровно для замера времени кадра: пять минут живого пальца
 * никто не отдаст. Но «шторка не крадёт вертикальный скролл» синтетикой
 * НЕ ДОКАЗЫВАЕТСЯ — это отдельный пункт вечера, живым пальцем.
 *
 * РЕЖИМЫ (env `MODE`, дефолт `main`) — три ветки эффекта, у каждой своя цена:
 *   main     — полный опыт: Kawase на канвасе + слой светов;
 *   reduce   — `prefers-reduced-motion`: пружины нет, значение ставится
 *              мгновенно; канвас ЖИВ (reduce гасит движение, а не эффект);
 *   fallback — WebGL отказал: канваса нет вовсе, работает CSS-ветка
 *              (потолок 22px) и слой светов со `scale-105`.
 *   Цену слоя светов (A/B) прибор меряет во ВСЕХ трёх — слой живёт в каждой.
 *
 * Переменные: BASE, PORT (CDP), MODE, ATTACH, SWEEP_MS (по 30–45 с на прогон),
 * REST_MS, CPU, DSF, W, H, SEQ («W,B,A,B,A,B,A» — W выбрасывается),
 * OUT (JSON с сырыми числами), CHROME.
 *
 * ⚠️ КАК ЧИТАТЬ ЧИСЛА — ДВА ПРАВИЛА, ВЫВЕДЕННЫЕ ЗАМЕРОМ:
 *  · МЕДИАНА ВРЕМЕНИ КАДРА НЕГОДНА. Шаг композитора стенда — 20 мс, и
 *    медиана квантуется в 20/40/60: она показывала «разницы нет» там, где
 *    среднее давало 1,6 мс. Мера — СРЕДНЕЕ и пропускная способность
 *    (кадров за фиксированное окно).
 *  · ОДНОЙ ПАРЫ A/B НЕ ХВАТАЕТ. Стенд ПРОГРЕВАЕТСЯ: четыре подряд
 *    ОДИНАКОВЫХ свипа дали 63,3 → 51,9 → 41,0 → 41,7 мс среднего — тренд
 *    22 мс при искомом эффекте в единицы. Поэтому прогрев выбрасывается,
 *    состояния ЧЕРЕДУЮТСЯ, и цена считается по СОСЕДНИМ парам: тренд
 *    входит в обе половины пары и сокращается.
 *
 * ИСХОДЫ:
 *  · «знак пар согласован» — цена слоя измерена, число действительно;
 *  · «СУДИТЬ НЕЧЕМ: пары разошлись знаком» — эффект НИЖЕ дрейфа стенда;
 *    выдаётся только ПОТОЛОК по модулю, и это не «цены нет», а «прибор
 *    её не разрешает»;
 *  · «ПРОГОН УПАЛ» — сработал предохранитель, числа недействительны.
 *
 * ПРЕДОХРАНИТЕЛИ (каждый РОНЯЕТ прогон, а не оговаривает результат):
 *  1. ЭТО ПРОД-СБОРКА: имя маршрутного чанка версионировано. ⚠️ Берётся из
 *     resource timing, а НЕ из `script[src]`: React убирает бутстрап-теги из
 *     DOM после исполнения, и поиск по DOM возвращал null на ИСПРАВНОЙ
 *     сборке — предохранитель ронял бы годный прогон.
 *  2. СЛОЙ ЕСТЬ В DOM И ДЕКОДИРОВАН, канвас поднят. Иначе прибор измерил бы
 *     страницу без эффекта и честно доложил «цены нет».
 *  3. ВЫКЛЮЧЕНИЕ СЛОЯ РЕАЛЬНО СОСТОЯЛОСЬ — сверяется computed `visibility`.
 *  4. ЖЕСТ ДОКАЗЫВАЕТСЯ ОТКЛИКОМ, а не фактом отправки события: после
 *     касания проверяется, что ручка пошла за пальцем (и ход ≥95 % за
 *     прогон). Иначе свип мерил бы ПОКОЙ под видом жеста — так и случилось
 *     на втором прогоне. ⚠️ Отклик читается ОТДЕЛЬНЫМ вызовом, спустя кадры:
 *     Motion доводит цепочку значений до inline-стиля на своём тике, и
 *     чтение в том же `evaluate` роняло годный жест.
 *  5. ПЕТЛЯ НЕ БЛОКИРУЕТ ДРАЙВЕР и печатает ФАКТИЧЕСКОЕ покрытие: rAF в
 *     headed Chrome умеет вставать у перекрытого окна, и оборванный прогон
 *     обязан быть отличим от чистого (проект это уже проходил — «деградации
 *     после прогрева нет» было выводом об ОСТАНОВЛЕННОЙ странице).
 *  6. СЧЁТЧИК ОТРИСОВОК ПАТЧИТ ОБА ПРОТОТИПА КОНТЕКСТА — и
 *     `WebGLRenderingContext`, и `WebGL2RenderingContext`. Это был
 *     ДЕФЕКТ ПРИБОРА: ogl поднимает WebGL2, и счётчик, знавший только
 *     WebGL1, честно печатал НОЛЬ при работающем канвасе. Поэтому «0
 *     отрисовок в покое» подтверждается КОНТРОЛЬНЫМ прогоном под жестом,
 *     который ОБЯЗАН насчитать отрисовки, иначе прогон падает.
 *  7. ВЫРОЖДЕННАЯ СЕРИЯ: средние всех прогонов, совпавшие до последнего
 *     знака, — это «НЕ ИЗМЕРЕНО», а не «разницы нет».
 *
 * ⚠️ DEVICE-ДОЛГ ОСТАЁТСЯ, И ПРИБОР ЕГО НЕ ЗАКРЫВАЕТ. Стенд идёт с
 * ДЕСКТОПНЫМ GPU при придушенном CPU. Полнокадровый blend с маской — это
 * ФИЛЛРЕЙТ, а его на Adreno/Mali меньше: такой стенд цену слоя может только
 * ЗАНИЗИТЬ, завысить — нет. Вердикт «60 fps достигнуты» этим прибором
 * не выдаётся ни при каких числах; нужен прогон на живом A15/A54.
 */
import fs from "node:fs";
import { openStand } from "./lib/cdp-stand.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:3100";
const PORT = Number(process.env.PORT || 9821);
const MODE = process.env.MODE || "main";
const SWEEP_MS = Number(process.env.SWEEP_MS || 45000);
const REST_MS = Number(process.env.REST_MS || 60000);
const CPU = Number(process.env.CPU || 4);
const DSF = Number(process.env.DSF || 3);
const W = Number(process.env.W || 390);
const H = Number(process.env.H || 844);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const die = (m) => {
  console.error("\n❌ ПРОГОН УПАЛ: " + m);
  process.exit(1);
};

const q = (arr) => {
  if (!arr.length) return null;
  const s = Float64Array.from(arr).sort();
  const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  let sum = 0;
  for (const v of s) sum += v;
  let over33 = 0;
  let over20 = 0;
  for (const v of s) {
    if (v > 33) over33++;
    if (v > 20) over20++;
  }
  return {
    n: s.length,
    med: at(0.5),
    mean: sum / s.length,
    p90: at(0.9),
    p99: at(0.99),
    max: s[s.length - 1],
    over33: (over33 / s.length) * 100,
    over20: (over20 / s.length) * 100,
    fps: 1000 / (sum / s.length),
  };
};

async function main() {
  if (!["main", "reduce", "fallback"].includes(MODE))
    die(`неизвестный MODE=${MODE} (main | reduce | fallback)`);
  const stand = await openStand({
    port: PORT,
    baseUrl: BASE,
    profile: process.env.TEMP + "\\optimist-p2-runtime",
    die,
    args: [
      "--window-size=1500,1000",
      // rAF в headed Chrome умеет вставать у перекрытого окна: тогда прибор
      // мерил бы ОСТАНОВЛЕННУЮ страницу (проект это уже проходил).
      // ⚠️ На устройстве этих ключей нет — там ту же дыру закрывает
      // предохранитель «вкладка на экране» (`cdp-stand.mjs`).
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
    ],
  });
  const { call, ev } = stand;
  try {
    /* ⚠️ Ветвление стенда — ОДНОЙ строкой на весь прибор: на эмуляции железо
       навязывается как прежде, на телефоне не трогается вовсе. */
    await stand.applyStand({ W, H, DSF, CPU });

    /* Режимы — это ВЫБОР ПОЛЬЗОВАТЕЛЯ и ОТКАЗ ЖЕЛЕЗА, а не подмена железа:
       оба законны и на живом устройстве. Ставятся ДО навигации. */
    if (MODE === "reduce")
      await call("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
    if (MODE === "fallback")
      await call("Page.addScriptToEvaluateOnNewDocument", {
        source: `(()=>{const g=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(t,...a){
            if(String(t).indexOf('webgl')===0||t==='experimental-webgl') return null;
            return g.call(this,t,...a);};})();`,
      });

    await call("Page.navigate", { url: BASE + "/" });
    await sleep(2500);
    await sleep(4000);

    console.log(
      stand.attach
        ? `РЕЖИМ: ${MODE}, прод ${BASE} (живое устройство)`
        : `СТЕНД: ${W}×${H} @dsf${DSF}, CPU ${CPU}×, прод ${BASE}, режим ${MODE}`
    );
    const env = await ev(
      /* ⚠️ Прод-сборка доказывается ВЕРСИОНИРОВАННЫМ маршрутным чанком, и
         имя берётся из resource timing, а НЕ из `script[src]`: React убирает
         бутстрап-теги из DOM после исполнения, и поиск по DOM возвращал null
         на исправной прод-сборке — то есть предохранитель ронял бы годный
         прогон, «доказывая» подмену стенда, которой нет. */
      `({dpr:devicePixelRatio, ua:navigator.userAgentData?navigator.userAgentData.mobile:null,
         touch:'ontouchstart' in window, hash:performance.getEntriesByType('resource')
           .map(e=>e.name.split('/').pop()).filter(x=>x.startsWith('page-'))[0]||null,
         reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
         fine: matchMedia('(pointer: fine)').matches})`
    );
    console.log(`  DPR=${env.dpr}, touch=${env.touch}, pointer:fine=${env.fine}, reduce=${env.reduce}`);
    console.log(`  маршрутный чанк: ${env.hash}`);
    if (!env.hash || !env.hash.includes("-")) die("не вижу версионированный чанк /page — это не прод-сборка");

    const SIM = `document.querySelectorAll('#vision .cursor-ew-resize')`;

    // Доезд до первого симулятора (улица).
    for (let k = 0; k < 8; k++) {
      await ev(
        `(()=>{const el=${SIM}[0]; const r=el.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + r.top - Math.max(12,(innerHeight-r.height)/2)); return 0;})()`
      );
      await sleep(400);
    }
    // Ждём подъёма машинерии, канваса и декода слоя.
    let up = null;
    for (let k = 0; k < 60; k++) {
      up = await ev(`(()=>{const el=${SIM}[0]; const c=el.querySelector('canvas');
        const i=el.querySelector('[data-halation]'); const b=el.querySelector('img:not([data-halation])');
        /* CSS-ветка расфокуса: живой (не display:none) узел с фильтром blur.
           Признак берётся с ПИКСЕЛЬНОЙ стороны (computed style), а не из
           разметки: включённость ветки решает браузер, а не наши ожидания. */
        const f=[...el.querySelectorAll('div')].find(n=>{const s=getComputedStyle(n);
          return s.display!=='none' && s.filter && s.filter.indexOf('blur')>=0;});
        return {cvs:!!c, cw:c?c.width:0, ch:c?c.height:0, ccw:c?c.clientWidth:0, cch:c?c.clientHeight:0,
          css:!!f, cssFilter: f?getComputedStyle(f).filter:null,
          halScaled: i?getComputedStyle(i.parentElement).transform!=='none':null,
          hal:!!i, halDone: i?(i.complete&&i.naturalWidth>0):false, halSrc:i?i.currentSrc:null,
          halNat:i?[i.naturalWidth,i.naturalHeight]:null,
          base:!!b, baseDone: b?(b.complete&&b.naturalWidth>0):false, baseSrc:b?b.currentSrc:null,
          baseNat:b?[b.naturalWidth,b.naturalHeight]:null};})()`);
      // В фолбэке канваса НЕ БУДЕТ никогда — ждать его значило бы ждать вечно.
      if (up && (MODE === "fallback" ? up.css : up.cvs) && up.halDone && up.baseDone) break;
      await sleep(500);
    }
    /* ⚠️ ПРЕДОХРАНИТЕЛЬ РЕЖИМА — СИММЕТРИЧНЫЙ, а не смягчённый. У каждой ветки
       свой признак, и «не тот» признак роняет прогон так же, как отсутствие
       эффекта: прибор, принявший CSS-фолбэк за GL-ветку, померил бы ДРУГОЙ
       эффект и подписался бы именем первого. Отказ WebGL, который не сработал,
       обязан быть виден сразу, а не всплыть числами в отчёте владельцу. */
    if (MODE === "fallback") {
      if (up?.cvs)
        die(
          "MODE=fallback, а канвас Kawase ЖИВ — отказ WebGL не сработал, " +
            "и прибор померил бы GL-ветку под именем фолбэка"
        );
      if (!up?.css)
        die("CSS-ветки расфокуса нет в DOM (нет узла с filter: blur) — мерить нечего");
    } else {
      if (!up?.cvs) die("канваса Kawase нет — GL не поднялся, мерить нечего");
    }
    if (MODE === "reduce" && !env.reduce)
      die("MODE=reduce, а страница не видит prefers-reduced-motion — эмуляция медиа не встала");
    if (!up.hal) die("слоя халяции нет в DOM ([data-halation]) — прибор мерил бы страницу без эффекта");
    if (!up.halDone) die(`слой халяции не декодирован (${up.halSrc})`);
    if (MODE === "fallback")
      console.log(
        `  канваса нет (отказ WebGL), CSS-ветка: filter=${up.cssFilter}, ` +
          `слой светов масштабирован как источник: ${up.halScaled ? "да (scale-105)" : "НЕТ"}`
      );
    else
      console.log(
        `  канвас ${up.cw}×${up.ch} буфера при ${up.ccw}×${up.cch} CSS → ratio ${(up.cw / up.ccw).toFixed(3)}`
      );
    console.log(`  база:  ${up.baseSrc}  nat ${up.baseNat.join("×")}`);
    console.log(`  слой:  ${up.halSrc}  nat ${up.halNat.join("×")}`);

    /* ---------- инструмент в странице ---------- */
    await ev(`(()=>{
      const el=${SIM}[0];
      window.__hlNode = (()=>{const i=el.querySelector('[data-halation]'); if(!i) return null;
        let n=i.parentElement; while(n && getComputedStyle(n).mixBlendMode!=='screen') n=n.parentElement; return n;})();
      window.__handle = el.querySelector('[role="slider"]');
      window.__cvs = el.querySelector('canvas');
      window.__P = null;
      /* ⚠️ ПЕТЛЯ НЕ БЛОКИРУЕТ ДРАЙВЕР. Прогон, где прибор ЖДЁТ обещания из
         страницы, неотличим от зависшего: rAF в headed Chrome умеет вставать
         (перекрытое окно), и тогда прибор висит молча. Здесь петля пишет
         прогресс в window.__P, а драйвер опрашивает его и печатает ФАКТИЧЕСКОЕ
         покрытие — оборванный прогон видно сразу. */
      window.__start = (ms, sweep) => { window.__P={done:false}; window.__run(ms,sweep)
        .then(r=>{ r.done=true; window.__P=r; }); return true; };
      window.__run = (ms, sweep) => new Promise((res)=>{
        const el2=${SIM}[0];
        const r=el2.getBoundingClientRect();
        const x0=r.left+2, x1=r.left+r.width-2, y=r.top+r.height*0.5;
        const dts=[]; const wch=[]; const sev=[]; const lab=new Set();
        let sMin=Infinity, sMax=-Infinity;
        /* ⚠️ В фолбэке канваса НЕТ, и клапан renderScale не существует как
           явление: список смен останется пустым — это «клапана нет», а не
           «клапан не шагал». Разница печатается в вердикте, а не теряется
           в нуле. */
        let lastW=window.__cvs? window.__cvs.width : 0;
        const t00=performance.now(); let last=t00; let i=0;
        const step=(now)=>{
          if(i++>0) dts.push(now-last);
          last=now;
          if(sweep){
            const ph=((now-t00)%4000)/4000;
            const tri= ph<0.5? ph*2 : 2-ph*2;
            const x=x0+(x1-x0)*tri;
            el2.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,pointerId:1,
              bubbles:true,isPrimary:true,pointerType:'touch',buttons:1}));
          }
          const w=window.__cvs? window.__cvs.width : 0;
          if(w!==lastW){ wch.push([Math.round(now-t00), lastW, w]); lastW=w; }
          /* Ход ручки берётся КАЖДЫЙ кадр, а не выборочно: при выборке каждый
             16-й кадр 6-секундный прогон дал «ход 76 %» на исправном свипе —
             экстремумы треугольника не попадали в выборку, и предохранитель
             ронял годный прогон. Чтение style.left — разбор строки, layout
             не трогает, цена нулевая. */
          const pnow=parseFloat(window.__handle.style.left)||0;
          if(pnow<sMin) sMin=pnow; if(pnow>sMax) sMax=pnow;
          if((i&15)===0){ sev.push(pnow);
            lab.add(window.__handle.getAttribute('aria-valuenow'));
            window.__PROG={frames:i, wall:now-t00, target:ms}; }
          if(now-t00<ms) requestAnimationFrame(step);
          else res({dts, wch, sev, span: sMax>=sMin? sMax-sMin : 0, labels:[...lab], wall:now-t00, frames:i,
                    heap: performance.memory? performance.memory.usedJSHeapSize:null});
        };
        requestAnimationFrame(step);
      });
      return !!window.__hlNode;})()`);
    const hasNode = await ev(`!!window.__hlNode`);
    if (!hasNode) die("не нашёл узел с mix-blend-mode: screen — выключать нечего");

    /** Гоняем петлю в странице, опрашивая прогресс. Стоп по таймауту — с числом. */
    const runLoop = async (ms, sweep) => {
      await ev(`window.__start(${ms}, ${sweep ? "true" : "false"})`, false);
      const deadline = Date.now() + ms * 1.8 + 20000;
      let last = 0;
      for (;;) {
        await sleep(2000);
        const p = await ev(`window.__P && window.__P.done ? 'DONE' : JSON.stringify(window.__PROG||null)`);
        if (p === "DONE") break;
        const pr = p ? JSON.parse(p) : null;
        if (pr) last = pr.wall;
        if (Date.now() > deadline)
          die(
            `петля в странице встала: набрано ${(last / 1000).toFixed(1)} с из ${(ms / 1000).toFixed(
              1
            )} с. Оборванный прогон НЕ выдаётся за чистый`
          );
      }
      return await ev(`window.__P`);
    };

    const center = async () => {
      for (let k = 0; k < 4; k++) {
        await ev(
          `(()=>{const el=${SIM}[0]; const r=el.getBoundingClientRect();
            window.scrollTo(0, window.scrollY + r.top - Math.max(12,(innerHeight-r.height)/2)); return 0;})()`
        );
        await sleep(350);
      }
    };

    /**
     * ⚠️ ЖЕСТ ДОКАЗЫВАЕТСЯ ОТКЛИКОМ, а не фактом отправки события. На полном
     * прогоне второй свип получил «ход ручки 0,0 %»: касание ушло, а
     * `pointerdown` до кадра не дошёл (страница успела доехать скроллом), и
     * прибор мерил бы ПОКОЙ под видом жеста. Теперь после касания
     * проверяется, что ручка реально пошла за пальцем.
     */
    const touchDown = async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await center();
        const p = await ev(
          `(()=>{const r=${SIM}[0].getBoundingClientRect();
            return [Math.round(r.left+r.width*0.5), Math.round(r.top+r.height*0.5)];})()`
        );
        await call("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: p[0], y: p[1], id: 1 }],
        });
        await sleep(250);
        /* ⚠️ ОТКЛИК ЧИТАЕТСЯ ОТДЕЛЬНЫМ ВЫЗОВОМ, СПУСТЯ КАДРЫ. Чтение
           `style.left` в том же `evaluate`, что и dispatch, показывало прежнее
           значение и роняло годный жест: Motion доводит цепочку значений до
           inline-стиля на своём тике, а не синхронно внутри обработчика. */
        await ev(`(()=>{const el=${SIM}[0]; const r=el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*0.8,
            clientY:r.top+r.height*0.5,pointerId:1,bubbles:true,isPrimary:true,
            pointerType:'touch',buttons:1})); return 0;})()`);
        await sleep(400);
        const probe = await ev(`(()=>({left: parseFloat(window.__handle.style.left)||0,
            hit:(()=>{const h=document.elementFromPoint(${p[0]},${p[1]});
              return h? h.tagName+'.'+String(h.className||'').slice(0,40):null;})()}))()`);
        if (probe.left > 70) return p;
        console.log(
          `  (касание ${attempt}/3 не взялось: ручка на ${probe.left.toFixed(
            1
          )} %, под пальцем ${probe.hit} — повторяю)`
        );
        await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(800);
      }
      die("жест не взялся трижды — свип мерил бы покой");
    };
    const touchUp = async (p) => {
      await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await sleep(1200);
    };

    const setLayer = async (on) => {
      await ev(`(()=>{window.__hlNode.style.visibility = ${on ? "''" : "'hidden'"}; return 0;})()`);
      await sleep(600);
      const vis = await ev(`getComputedStyle(window.__hlNode).visibility`);
      if (on && vis !== "visible") die(`слой обязан быть виден, computed visibility = ${vis}`);
      if (!on && vis !== "hidden") die(`слой обязан быть скрыт, computed visibility = ${vis}`);
      return vis;
    };

    /**
     * ⚠️ СЧЁТЧИК ПЕРЕСБОРОК ЦЕПОЧКИ FBO — прямая проверка починки второго
     * круга («пересобираем только на рост»). Прежде каждая смена разрешения
     * удаляла три FBO и выделяла три новых: 138 циклов за 5,7 мин в самый
     * нагруженный момент. Считаем ФАКТИЧЕСКИЕ вызовы GL, а не верим коду.
     * Патчим ОБА прототипа: ogl поднимает WebGL2, и счётчик, знавший только
     * WebGL1, честно печатал бы НОЛЬ (этот дефект прибора уже был).
     */
    await ev(`(()=>{
      window.__fb={del:0,make:0};
      for(const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]){
        if(!P) continue;
        for(const [m,k] of [['deleteFramebuffer','del'],['createFramebuffer','make']]){
          const o=P.prototype[m];
          if(o && !o.__patched){ const f=function(...a){ window.__fb[k]++; return o.apply(this,a); };
            f.__patched=true; P.prototype[m]=f; }
        }
      }
      return 'ok';})()`);

    const runSweep = async (label, layerOn, keep = true) => {
      const vis = await setLayer(layerOn);
      await ev(`(()=>{window.__fb.del=0; window.__fb.make=0; return 0;})()`);
      const p = await touchDown();
      const r = await runLoop(SWEEP_MS, true);
      await touchUp(p);
      r.fb = await ev(`JSON.stringify(window.__fb)`);
      const st = q(r.dts);
      const span = r.span;
      if (span < 95)
        die(
          `свип «${label}» не гонял расфокус: ход ручки ${span.toFixed(1)} % из 100 — ` +
            `мерился бы покой под видом жеста`
        );
      console.log(
        `\n[${label}] слой=${vis}  покрытие ${(r.wall / 1000).toFixed(1)} с / ${r.frames} кадров, ` +
          `ход ручки ${span.toFixed(1)} %, подписей пройдено ${r.labels.length}` +
          `\n  СРЕДНЕЕ ${st.mean.toFixed(2)} мс  медиана ${st.med.toFixed(1)}  p90 ${st.p90.toFixed(
            1
          )}  p99 ${st.p99.toFixed(1)}  макс ${st.max.toFixed(0)}` +
          `\n  пересборок цепочки FBO: ${r.fb}` +
          `\n  >33 мс ${st.over33.toFixed(1)} %  >20 мс ${st.over20.toFixed(1)} %  fps(средн) ${st.fps.toFixed(
            1
          )}` +
          `\n  шагов клапана: ${
            MODE === "fallback"
              ? "клапана НЕТ (канваса нет, renderScale не существует в этой ветке)"
              : `${r.wch.length}${
                  r.wch.length ? " → " + r.wch.map((c) => `${c[0]}мс:${c[1]}→${c[2]}`).join(", ") : ""
                }`
          }` +
          `\n  heap ${r.heap == null ? "недоступен (нет performance.memory)" : (r.heap / 1048576).toFixed(1) + " MiB"}`
      );
      return { st, wch: r.wch, wall: r.wall, frames: r.frames, heap: r.heap };
    };

    /* ---------- ЧЕРЕДУЮЩАЯСЯ СЕРИЯ ----------
       ⚠️ ДВА ПРОГОНА A И B СРАВНИВАТЬ НЕЛЬЗЯ. Стенд ПРОГРЕВАЕТСЯ: подряд
       идущие одинаковые свипы дали 63,3 → 51,9 → 41,0 → 41,7 мс среднего,
       то есть монотонный тренд величиной 22 мс при искомом эффекте в единицы
       миллисекунд. Первая же «цена слоя», взятая из пары A1−B, была бы
       разогревом стенда. Поэтому: прогрев выбрасывается, дальше состояния
       ЧЕРЕДУЮТСЯ, и цена считается по СОСЕДНИМ парам (тренд входит в обе
       половины пары и сокращается).
       ⚠️ Медиана здесь бесполезна: шаг композитора стенда 20 мс, и медиана
       квантуется в 20/40/60. Мера — СРЕДНЕЕ время кадра и пропускная
       способность (кадров за фиксированное время). */
    const SEQ = (process.env.SEQ || "W,B,A,B,A,B,A").split(",");
    const runs = [];
    for (let i = 0; i < SEQ.length; i++) {
      const kind = SEQ[i];
      if (kind === "W") {
        console.log("\n(прогрев — в статистику НЕ идёт)");
        await runSweep("W  прогрев", true, false);
        continue;
      }
      const r = await runSweep(
        `${i} ${kind === "A" ? "A слой ЖИВ    " : "B слой ВЫКЛЮЧЕН"}`,
        kind === "A"
      );
      runs.push({ kind, ...r });
    }
    await setLayer(true);

    /* ---------- покой: вечный цикл и клапан ---------- */
    await ev(`(()=>{
      window.__draws=0;
      for(const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]){
        if(!P) continue;
        for(const m of ['drawArrays','drawElements']){
          const o=P.prototype[m];
          if(o && !o.__patched){ const f=function(...a){ window.__draws++; return o.apply(this,a); };
            f.__patched=true; P.prototype[m]=f; }
        }
      }
      return 'ok';})()`);
    const restR = await runLoop(REST_MS, false);
    const draws = await ev(`window.__draws`);
    const restSt = q(restR.dts);
    console.log(
      `\n[ПОКОЙ ${(restR.wall / 1000).toFixed(1)} с, ни одного касания] отрисовок GL ${draws} ` +
        `(${(draws / (restR.wall / 1000)).toFixed(2)}/с), шагов клапана ${restR.wch.length}` +
        `\n  медиана кадра ${restSt.med.toFixed(1)} мс, >20 мс ${restSt.over20.toFixed(1)} %`
    );

    /* ---------- контроль патча счётчика: под жестом он ОБЯЗАН считать ----------
       ⚠️ В ФОЛБЭКЕ КОНТРОЛЯ НЕ СУЩЕСТВУЕТ, и это не поблажка. GL там отключён
       намеренно, отрисовок нет ни в покое, ни под жестом — значит «0 в покое»
       в этой ветке НИЧЕГО не доказывает про вечный цикл и не выдаётся за
       доказательство. Контроль, который в принципе не может отличить исправное
       от сломанного, обязан сказать «судить нечем», а не проходить. */
    if (MODE === "fallback") {
      console.log(
        `  КОНТРОЛЬ счётчика: СУДИТЬ НЕЧЕМ — в фолбэке GL отключён, отрисовок нет ` +
          `по построению (в покое насчитано ${draws}); «вечного цикла нет» этим прогоном НЕ доказано`
      );
    } else {
      const p = await touchDown();
      await ev(`window.__draws=0`);
      const ctl = await runLoop(4000, true);
      const ctlDraws = await ev(`window.__draws`);
      await touchUp(p);
      console.log(
        `  КОНТРОЛЬ счётчика: 3 с под жестом → ${ctlDraws} отрисовок ` +
          `(${(ctlDraws / (ctl.frames || 1)).toFixed(1)} на кадр)`
      );
      if (ctlDraws === 0)
        die(
          "счётчик отрисовок показал НОЛЬ под живым жестом — патч не работает, " +
            "и «0 в покое» ничего не доказывает (тот же дефект: патчили WebGL1, а ogl берёт WebGL2)"
        );
    }

    /* ---------- память: инвентарь отданных ассетов ---------- */
    // Доезд до второго симулятора, чтобы поднялись ОБА канваса.
    for (let k = 0; k < 8; k++) {
      await ev(
        `(()=>{const el=${SIM}[1]; const r=el.getBoundingClientRect();
          window.scrollTo(0, window.scrollY + r.top - Math.max(12,(innerHeight-r.height)/2)); return 0;})()`
      );
      await sleep(400);
    }
    await sleep(2500);
    const inv = await ev(`(()=>{
      const imgs=[...document.querySelectorAll('img')].map(i=>({
        src:i.currentSrc||i.src, nat:[i.naturalWidth,i.naturalHeight],
        hal:i.hasAttribute('data-halation'), done:i.complete&&i.naturalWidth>0,
        box:[Math.round(i.getBoundingClientRect().width),Math.round(i.getBoundingClientRect().height)]}));
      const cvs=[...document.querySelectorAll('#vision canvas')].map(c=>({
        w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight}));
      return {imgs, cvs, heap: performance.memory? performance.memory.usedJSHeapSize:null,
        dpr:devicePixelRatio};})()`);
    console.log(`\n──── ИНВЕНТАРЬ ИЗОБРАЖЕНИЙ (${inv.imgs.length} шт, DPR ${inv.dpr}) ────`);
    fs.writeFileSync(
      // Сырые числа — в gitignore-папку выхлопа приборов, не в корень репозитория.
      process.env.OUT || (fs.mkdirSync("tmp-frames", { recursive: true }), "tmp-frames/probe-runtime.json"),
      JSON.stringify({ inv, runs: runs.map(r=>({kind:r.kind, st:r.st, frames:r.frames, wch:r.wch, fb:r.fb})), rest: restSt, draws }, null, 1)
    );
    const seen = new Map();
    for (const im of inv.imgs) {
      const k = im.src;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    for (const im of inv.imgs) {
      console.log(
        `  ${im.hal ? "ХАЛЯЦИЯ " : "        "}${String(im.nat.join("×")).padEnd(11)} ` +
          `бокс ${String(im.box.join("×")).padEnd(9)} ${im.done ? "✓" : "…"} ${
            seen.get(im.src) > 1 ? `(${seen.get(im.src)}× тот же URL) ` : ""
          }${decodeURIComponent(im.src).replace(BASE, "")}`
      );
    }
    console.log(`  канвасы #vision: ${inv.cvs.map((c) => `${c.w}×${c.h} буфер / ${c.cw}×${c.ch} CSS`).join("  |  ")}`);
    console.log(
      `  heap ${inv.heap == null ? "недоступен" : (inv.heap / 1048576).toFixed(1) + " MiB"}`
    );

    /* ---------- вердикты по кадру ---------- */
    console.log(
      `\n──────── ЦЕНА СЛОЯ ХАЛЯЦИИ ПО ВРЕМЕНИ КАДРА (режим ${MODE}, ` +
        `${stand.attach ? "ЖИВОЕ УСТРОЙСТВО" : "эмуляция"}) ────────`
    );
    console.log("  прогон  состояние   средн, мс   кадров   >20 мс");
    for (const r of runs)
      console.log(
        `  ${String(runs.indexOf(r) + 1).padStart(6)}  ${r.kind === "A" ? "слой жив " : "слой выкл"}` +
          `${r.st.mean.toFixed(2).padStart(11)}${String(r.frames).padStart(9)}` +
          `${r.st.over20.toFixed(1).padStart(9)} %`
      );
    const means = runs.map((r) => r.st.mean);
    if (new Set(means.map((v) => v.toFixed(4))).size === 1)
      die("средние всех прогонов совпали до последнего знака — это «не измерено», а не «разницы нет»");
    // СОСЕДНИЕ ПАРЫ: разность A − B, знак нормируем на порядок в паре.
    const pairs = [];
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1];
      const b = runs[i];
      if (a.kind === b.kind) continue;
      const d = a.kind === "A" ? a.st.mean - b.st.mean : b.st.mean - a.st.mean;
      pairs.push(d);
    }
    if (pairs.length < 2) die("соседних пар A/B меньше двух — судить нечем");
    const pm = pairs.reduce((s, v) => s + v, 0) / pairs.length;
    const sd = Math.sqrt(pairs.reduce((s, v) => s + (v - pm) ** 2, 0) / (pairs.length - 1));
    console.log(
      `\n  соседние пары (A−B), мс: ${pairs.map((v) => v.toFixed(2)).join("  ")}` +
        `\n  среднее по парам ${pm.toFixed(2)} мс, разброс σ ${sd.toFixed(2)} мс, пар ${pairs.length}`
    );
    const same = pairs.every((v) => v > 0) || pairs.every((v) => v < 0);
    if (!same)
      console.log(
        `  🟠 СУДИТЬ НЕЧЕМ: пары разошлись ЗНАКОМ — эффект слоя меньше дрейфа стенда, ` +
          `числа цены заявлять нельзя. Верхняя оценка по модулю: ${Math.max(
            ...pairs.map(Math.abs)
          ).toFixed(2)} мс.`
      );
    else
      console.log(
        `  ✅ знак пар согласован: слой стоит ${pm.toFixed(2)} ± ${sd.toFixed(2)} мс/кадр ` +
          `(${((pm / (means.reduce((s, v) => s + v, 0) / means.length)) * 100).toFixed(1)} % кадра)`
      );

    if (stand.attach) {
      const bad = stand.forbiddenUsed();
      if (bad.length) die(`прибор подменял железо на устройстве: ${bad.join(", ")}`);
      console.log(
        `\n  железо телефона за весь прогон не подменялось ни разу ` +
          `(запрещённых вызовов: 0 из ${stand.calls.length} обращений CDP)`
      );
    }
  } finally {
    stand.close();
  }
}
main().catch((e) => die(String(e && e.stack ? e.stack : e)));

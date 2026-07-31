/**
 * DUAL-KAWASE BLUR (этап 6) — честный расфокус до −6 дптр без пофреймового
 * CSS-blur большого радиуса.
 *
 * ⚠️ ПОЧЕМУ ИМЕННО ЭТО. Цена гауссова размытия растёт с радиусом: 30px на
 * весь кадр телефон не тянет. У dual-Kawase цена почти НЕ зависит от
 * радиуса — он получается не большим ядром, а цепочкой уменьшений и
 * увеличений: каждый проход берёт ровно 4 выборки, а радиус набирается
 * тем, как далеко разъезжаются смещения и сколько ступеней в цепочке.
 * Работа при −6 дптр и при −1 дптр отличается на единицы процентов.
 *
 * ⚠️ FBO живут в ПОЛОВИНЕ разрешения канваса: размытому не нужна резкость,
 * а это сразу вчетверо меньше фрагментов. Дальше поверх работает общий
 * клапан renderScale (`gl-canvas.tsx`) — у шторки он может опускаться
 * низко: мыло в СИМУЛЯТОРЕ РАСФОКУСА не читается как брак, в отличие от
 * волосяной графики чертежа.
 */
import { Mesh, Program, RenderTarget, Triangle, type Texture } from "ogl";
import { planChain } from "@/lib/kawase-schedule";

const VERT = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

/**
 * Уменьшающий проход: 4 диагональные выборки + центральная.
 * Классическое ядро dual-Kawase (Marius Bjørge, ARM) — оно и даёт
 * «почти бесплатный радиус».
 */
/**
 * ⚠️ COVER-ОТОБРАЖЕНИЕ. Фото под канвасом лежит с `object-fit: cover`, то
 * есть ОБРЕЗАНО, а шейдер натягивал бы полный кадр — канвас и DOM показывали
 * бы РАЗНОЕ изображение, и шов врал бы (нашёл `fizik`: на выключенном
 * эффекте расхождение доходило до 97,8 единиц, каузальная проба с
 * `object-fit: fill` роняла его до 0,30).
 *
 * `uCover = vec4(scaleX, scaleY, shiftX, shiftY)`; для проходов, читающих
 * FBO (а не исходное фото), подаётся тождество (1,1,0,0).
 *
 * ⚠️ ОТОБРАЖАЕТСЯ ПОЗИЦИЯ ВЫБОРКИ ЦЕЛИКОМ — `cover(vUv + o)`, а НЕ `cover(vUv) + o`.
 * Разъезд `o` живёт в uv приёмника; прибавить его после отображения значит
 * промахнуться по радиусу ровно на долю обрезки (15–28 %), и глазами это
 * не видно.
 */
const COVER_FN = `
uniform vec4 uCover;
vec2 cover(vec2 uv) { return uv * uCover.xy + uCover.zw; }
`;

const DOWN = `
precision highp float;
uniform sampler2D tMap;
// ⚠️ Тексел ПРИЁМНИКА, а не источника. Приёмник вдвое мельче, значит
// фактический разъезд вдвое больше номинала — калибровку это не ломает,
// но считающий радиус по прежнему комментарию ошибся бы вдвое (нашёл физик).
uniform vec2 uTexel;
uniform float uOffset; // разъезд выборок — им и правится радиус
varying vec2 vUv;
${COVER_FN}
void main() {
  vec2 o = uTexel * uOffset;
  vec4 sum = texture2D(tMap, cover(vUv)) * 4.0;
  sum += texture2D(tMap, cover(vUv - o));
  sum += texture2D(tMap, cover(vUv + o));
  sum += texture2D(tMap, cover(vUv + vec2(o.x, -o.y)));
  sum += texture2D(tMap, cover(vUv - vec2(o.x, -o.y)));
  gl_FragColor = sum / 8.0;
}
`;

/** Увеличивающий проход: 8 выборок по «бабочке» — он и сглаживает ступени. */
const UP = `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;
uniform float uOffset;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uOffset;
  vec4 sum = texture2D(tMap, vUv + vec2(-o.x * 2.0, 0.0));
  sum += texture2D(tMap, vUv + vec2(-o.x, o.y)) * 2.0;
  sum += texture2D(tMap, vUv + vec2(0.0, o.y * 2.0));
  sum += texture2D(tMap, vUv + o) * 2.0;
  sum += texture2D(tMap, vUv + vec2(o.x * 2.0, 0.0));
  sum += texture2D(tMap, vUv + vec2(o.x, -o.y)) * 2.0;
  sum += texture2D(tMap, vUv + vec2(0.0, -o.y * 2.0));
  sum += texture2D(tMap, vUv - o) * 2.0;
  gl_FragColor = sum / 12.0;
}
`;

/**
 * Финальный вывод на экран. Отдельным проходом, потому что здесь живёт
 * потеря насыщенности: расфокусированный глаз видит мир не только мягче,
 * но и чуть бледнее — это часть честности симулятора, а не украшение.
 */
/**
 * Финальный вывод. Здесь же живут две вещи, без которых эффект врал бы:
 *
 * 1. ПОТЕРЯ НАСЫЩЕННОСТИ — расфокусированный глаз видит мир не только мягче,
 *    но и чуть бледнее. Часть честности симулятора, а не украшение.
 * 2. ПОДМЕШИВАНИЕ РЕЗКОГО ИСТОЧНИКА на малых радиусах (`uMix`). У цепочки есть
 *    собственный ПОЛ размытия: билинейное чтение текстур размывает кадр даже
 *    при нулевом разъезде. Слабее пола цепочка не умеет, и без подмешивания
 *    между «резко» и полом не было промежуточных состояний — один шаг съедал
 *    62 % диапазона резкости ВНУТРИ одной подписанной ступени, где на капсуле
 *    по обе стороны написано «−1 дптр» (нашёл `fizik`). Порог рампы — этот же
 *    пол, выраженный в радиусе (`minRadius` в `lib/kawase-schedule.ts`),
 *    а не константа: константа означала бы разное на разных плотностях.
 *
 * ⚠️ Рампа МОНОТОННАЯ от нуля, а НЕ по дробной части `log2`. Дробная часть на
 * границе перескочила бы с 1 на 0 и вернула бы резкий источник — новый обрыв,
 * хуже исходного (поправка `dirizher`).
 */
const OUT = `
precision highp float;
uniform sampler2D tMap;   // результат цепочки (или сам источник при lv = 0)
uniform sampler2D tSrc;   // исходное фото — для подмешивания на малых радиусах
uniform vec4 uCoverSrc;   // cover для tSrc
uniform float uSaturate;
uniform float uMix;       // 0 — только резкий источник, 1 — только цепочка
varying vec2 vUv;
${COVER_FN}
void main() {
  vec4 blurred = texture2D(tMap, cover(vUv));
  vec4 sharp = texture2D(tSrc, vUv * uCoverSrc.xy + uCoverSrc.zw);
  vec4 c = mix(sharp, blurred, uMix);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(vec3(l), c.rgb, uSaturate), c.a);
}
`;

export type KawaseOptions = {
  /** Сколько ступеней уменьшения. Больше — шире доступный радиус. */
  levels?: number;
  /** Доля разрешения канваса, в которой живут FBO. */
  scale?: number;
};

export type Kawase = {
  /**
   * Пересобрать цепочку под новый размер канваса.
   *
   * @param width  ширина БУФЕРА (CSS-px × pixelRatio)
   * @param height высота буфера
   * @param cssWidth ширина канваса в CSS-пикселях. ⚠️ ОБЯЗАТЕЛЬНА: без неё
   *   `render` не сможет перевести радиус из CSS-пикселей в тексели, и
   *   размытие поедет за плотностью экрана (см. `render`). Отсутствие —
   *   громкий отказ, а не тихое `pixelRatio = 1`: молчаливый дефолт дал бы
   *   картинку без ошибок в консоли и с потерянной правдой.
   */
  resize(width: number, height: number, cssWidth: number): void;
  /**
   * Нарисовать кадр.
   * @param source  исходная текстура (фото секции)
   * @param radius  радиус расфокуса в CSS-ПИКСЕЛЯХ (не текселях и не
   *                пикселях буфера) — та же единица, в которой считает
   *                калибровка `vision-sim-types.ts` и CSS-фолбэк
   * @param saturate 1 — без потери, 0 — серое
   * @param cover   [scaleX, scaleY, shiftX, shiftY] — отображение uv под
   *                `object-fit: cover` того `<img>`, что лежит под канвасом.
   *                Без него канвас показывал бы ДРУГОЕ кадрирование.
   */
  render(
    source: Texture,
    radius: number,
    saturate: number,
    cover?: readonly [number, number, number, number]
  ): void;
  dispose(): void;
};

/**
 * ⚠️ ПОРТ КАЛИБРОВКИ (только dev). Позволяет прибору задать ступень и разъезд
 * РУКАМИ, в обход расписания.
 *
 * Зачем он в исходнике, а не патчем на время замера. Расписание цепочки
 * калибруется СРАВНЕНИЕМ С CSS-ФОЛБЭКОМ на одном приборе: чтобы построить
 * таблицу «какое размытие даёт ступень lv при разъезде o», нужно уметь
 * задавать пару (lv, o) НЕЗАВИСИМО от расписания — иначе меряется только то,
 * что расписание уже выдаёт, и ошибку в нём таким замером не увидеть.
 * Три калибровки подряд не сошлись именно потому, что числа под ними никто
 * не мог перепроверить: крючок жил патчем в чужой временной папке и умирал
 * вместе с сессией. Прибор, который нельзя запустить снова, — не прибор.
 *
 * ⚠️ В прод-сборке блока НЕТ ФИЗИЧЕСКИ: `process.env.NODE_ENV` подставляется
 * литералом на сборке, и минификатор вырезает мёртвую ветку целиком. Проверять
 * это надо ЗАМЕРОМ веса чанка, а не доверием к минификатору.
 */
declare global {
  interface Window {
    __kawaseForce?: { lv: number; offset: number; mix?: number };
  }
}

export function createKawase(
  gl: ConstructorParameters<typeof RenderTarget>[0],
  opts: KawaseOptions = {}
): Kawase {
  const levels = Math.max(1, opts.levels ?? 3);
  const scale = opts.scale ?? 0.5;

  const geometry = new Triangle(gl);
  const down = new Program(gl, {
    vertex: VERT,
    fragment: DOWN,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tMap: { value: null },
      uTexel: { value: [0, 0] },
      uOffset: { value: 1 },
      uCover: { value: [1, 1, 0, 0] },
    },
  });
  const up = new Program(gl, {
    vertex: VERT,
    fragment: UP,
    depthTest: false,
    depthWrite: false,
    uniforms: { tMap: { value: null }, uTexel: { value: [0, 0] }, uOffset: { value: 1 } },
  });
  const out = new Program(gl, {
    vertex: VERT,
    fragment: OUT,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    uniforms: {
      tMap: { value: null },
      tSrc: { value: null },
      uCover: { value: [1, 1, 0, 0] },
      uCoverSrc: { value: [1, 1, 0, 0] },
      uSaturate: { value: 1 },
      uMix: { value: 1 },
    },
  });

  const meshDown = new Mesh(gl, { geometry, program: down });
  const meshUp = new Mesh(gl, { geometry, program: up });
  const meshOut = new Mesh(gl, { geometry, program: out });

  let targets: RenderTarget[] = [];
  /**
   * ⚠️ ПАРНЫЙ FBO НУЛЕВОГО УРОВНЯ — для UP-прохода ступени 1.
   *
   * У глубины 1 не было НИ ОДНОГО UP-прохода (DOWN → OUT), и её ядро
   * оставалось голой звездой четырёх тапов. Это давало сразу ТРИ измеренных
   * симптома: щелчок ФОРМЫ на стыке lv1→lv2 (Δпикс 4,8 при рядовых 0,84 —
   * σ² непрерывен, картинка нет), кросс-артефакт с разъезда 0,8 (у ступеней
   * с UP — с 1,4–1,6) и застрявшую честность против blur(r) (~5,1 при
   * хорошеющем lv2). Решение `dirizher`: ступень 1 получает UP-проход —
   * DOWN(src→t0) → UP(t0→t0′) → OUT, ядро переходит в ту же семью, что
   * lv2+. UP не может писать в t0, который сам читает, — нужен парный
   * приёмник того же размера.
   */
  let target0b: RenderTarget | null = null;
  let width = 0;
  let height = 0;
  /** Текущая ширина канваса в CSS-пикселях (в отличие от `width` — буфера). */
  let cssWidth = 0;

  /**
   * ⚠️ НОРМИРОВКА РАДИУСА: сколько пикселей БУФЕРА приходится на один
   * CSS-пиксель. Считается КАЖДЫЙ раз заново из двух живых чисел, а не
   * кэшируется: `width` — размер, под который цепочка РАЗМЕЩЕНА (она
   * пересобирается только на рост), а `cssWidth` меняется на каждом ресайзе
   * контейнера. Взять вместо этого `renderer.dpr` нельзя: после шага клапана
   * вниз буфер уменьшился, а уровни остались прежними, и связь «тексел
   * уровня i = 2^(i+2) пикселей буфера» держится только относительно
   * РАЗМЕЩЁННОГО размера.
   */
  const allocRatio = () => (cssWidth > 0 ? width / cssWidth : 0);

  /**
   * ⚠️ ГЛУБИНА И РАЗЪЕЗД СЧИТАЮТСЯ НЕ ЗДЕСЬ, а в `lib/kawase-schedule.ts` —
   * чистой функцией, закреплённой юнит-тестами (`npm run test:lib`).
   *
   * Так сделано потому, что именно здесь симулятор дважды соврал молча:
   * разъезд считался формулой ОДНОГО прохода (а их `2·lv−1`), и уровень
   * выбирался степенью двойки, без оглядки на то, способен ли он вообще
   * дать нужное размытие. Обе поломки невидимы глазами — маскируются самим
   * размытием, — и ловились только замером в Chrome, который дорог, зависит
   * от кадра и однажды соврал сам. В чистой функции то же самое доказывается
   * арифметикой: непрерывность на границах следует ПО ПОСТРОЕНИЮ.
   */

  const dropTargets = () => {
    for (const t of [...targets, ...(target0b ? [target0b] : [])]) {
      // Освобождаем явно: цепочка пересобирается на каждый ресайз, и
      // забытые FBO копятся в видеопамяти молча.
      try {
        gl.deleteFramebuffer(t.buffer);
        gl.deleteTexture(t.texture.texture);
      } catch {
        /* контекст мог уже умереть */
      }
    }
    targets = [];
    target0b = null;
  };

  function resize(w: number, h: number, cw: number) {
    if (!(cw > 0)) {
      throw new Error(
        "kawase.resize: нужна ширина канваса в CSS-пикселях — без неё радиус " +
          "нечем перевести в тексели, и размытие поедет за плотностью экрана"
      );
    }
    // ⚠️ CSS-ширина обновляется ДО раннего выхода: цепочка не пересобирается
    // на уменьшение, но нормировка обязана следовать за контейнером, иначе
    // после сужения окна радиус считался бы по прежней ширине.
    cssWidth = cw;
    // ⚠️ ПЕРЕСОБИРАЕМ ТОЛЬКО НА РОСТ. Клапан меняет размер канваса на ходу, и
    // цепочка пересоздавалась на КАЖДУЮ смену — «удалить три FBO и выделить
    // три новых» в самый нагруженный момент, 138 раз за 5,7 минуты (нашёл
    // `hronometrist`). Уменьшение переживаем молча: работа идёт в uv 0…1,
    // поэтому буфер БОЛЬШЕ нужного на геометрию не влияет — только на
    // немного лишнюю память, и это несравнимо дешевле цикла выделений.
    // `width/height` — размер, под который ВЫДЕЛЕНО (не последний запрос):
    // затирать его при уменьшении нельзя, иначе возврат к прежнему размеру
    // снова пересоберёт цепочку.
    if (targets.length && w <= width && h <= height) return;
    width = Math.max(width, w);
    height = Math.max(height, h);
    dropTargets();
    for (let i = 0; i < levels; i += 1) {
      const div = Math.pow(2, i + 1);
      targets.push(
        new RenderTarget(gl, {
          width: Math.max(1, Math.round((width * scale) / div)),
          height: Math.max(1, Math.round((height * scale) / div)),
          depth: false,
        })
      );
    }
    // Парный приёмник нулевого уровня — см. объявление `target0b`.
    target0b = new RenderTarget(gl, {
      width: Math.max(1, Math.round((width * scale) / 2)),
      height: Math.max(1, Math.round((height * scale) / 2)),
      depth: false,
    });
  }

  function render(
    source: Texture,
    radius: number,
    saturate: number,
    cover: readonly [number, number, number, number] = [1, 1, 0, 0]
  ) {
    if (!targets.length || !source) return;
    const IDENTITY = [1, 1, 0, 0];

    /**
     * ⚠️ ГЛУБИНА ЦЕПОЧКИ ЗАВИСИТ ОТ РАДИУСА, а не фиксирована. Каждая
     * ступень примерно удваивает размытие, поэтому цепочка постоянной
     * длины мутит кадр ДАЖЕ ПРИ НУЛЕ ДИОПТРИЙ — а при нуле левая половина
     * обязана быть резкой в точности как правая, иначе симулятор врёт
     * о зрении в его исходной точке. При нулевом радиусе ступеней нет
     * вовсе: источник идёт прямо на выход.
     *
     * Дальше `uOffset` дотягивает величину НЕПРЕРЫВНО между ступенями —
     * без него на переходах цепочки был бы щелчок, ровно тот, от которого
     * этап уходит.
     */
    // ⚠️ Цепочка включается СРАЗУ при ненулевом радиусе (нижняя граница 1),
    // а не с radius = 2. Прежний порог оставлял мёртвую зону: первые ~12,5 %
    // хода шторки не делали ничего, хотя глаз при −0,75 дптр уже видит потерю
    // контраста. И рампа `uMix` обязана начинаться ТАМ ЖЕ, где включается
    // цепочка, иначе обрыв просто переезжает (поправка `dirizher`).
    /**
     * ⚠️ РАДИУС ПРИХОДИТ В CSS-ПИКСЕЛЯХ, А ЦЕПОЧКА ЖИВЁТ В ПИКСЕЛЯХ БУФЕРА.
     * Без перевода множители сокращались в `radius / pixelRatio`, и видимое
     * ядро оказывалось обратно пропорционально плотности экрана: на DPR 2
     * (а это и есть эталонные A15/A54) шторка размывала ВДВОЕ слабее
     * обещанного — честные −6 дптр выглядели как −3, и GL-ветка расходилась
     * с CSS-фолбэком в те же разы. Замер `fizik`: ширина ядра 30,38 против
     * 14,93 px на одном и том же радиусе, отношение 2,04; у CSS-фолбэка,
     * взятого контролем, отношение 0,995–1,007.
     */
    let plan = planChain(radius * allocRatio(), targets.length);
    if (process.env.NODE_ENV !== "production") {
      const f = typeof window !== "undefined" ? window.__kawaseForce : undefined;
      if (f && f.lv >= 1) {
        // Ступень зажимается доступной глубиной: запрошенная сверх `levels`
        // молча рисовала бы ДРУГУЮ ступень, и таблица калибровки соврала бы
        // ровно там, где её труднее всего проверить.
        plan = {
          lv: Math.min(Math.round(f.lv), targets.length),
          offset: f.offset,
          mix: f.mix ?? 1,
          saturated: false,
        };
      }
    }
    const lv = plan.lv;
    // Рампа подмешивания резкого источника: цепочка не умеет размывать слабее
    // собственного пола, и этот интервал закрывается смешиванием. Порог —
    // не константа «4 px», а тот же пол, выраженный в радиусе.
    const mixV = plan.mix;

    let src: Texture = source;
    if (lv > 0) {
      const offset = plan.offset;

      for (let i = 0; i < lv; i += 1) {
        const rt = targets[i];
        down.uniforms.tMap.value = src;
        down.uniforms.uTexel.value = [1 / rt.width, 1 / rt.height];
        down.uniforms.uOffset.value = offset;
        // Cover применяется ТОЛЬКО к исходному фото — на первом проходе.
        // Дальше источник это FBO, он уже обрезан.
        down.uniforms.uCover.value = i === 0 ? [...cover] : IDENTITY;
        gl.renderer.render({ scene: meshDown, target: rt, clear: true });
        src = rt.texture;
      }
      // И обратно вверх — здесь ступени и сглаживаются.
      for (let i = lv - 2; i >= 0; i -= 1) {
        const rt = targets[i];
        up.uniforms.tMap.value = src;
        up.uniforms.uTexel.value = [1 / rt.width, 1 / rt.height];
        up.uniforms.uOffset.value = offset;
        gl.renderer.render({ scene: meshUp, target: rt, clear: true });
        src = rt.texture;
      }
      // ⚠️ Ступень 1 — UP в ПАРНЫЙ приёмник (см. `target0b`): без него её
      // ядро оставалось голой звездой, и картинка щёлкала ФОРМОЙ на стыке
      // lv1→lv2 при непрерывном σ² (решение `dirizher`, 30 июля). Разъезд —
      // тот же `offset`, что у DOWN: другой был бы новым свободным параметром.
      if (lv === 1 && target0b) {
        up.uniforms.tMap.value = src;
        up.uniforms.uTexel.value = [1 / target0b.width, 1 / target0b.height];
        up.uniforms.uOffset.value = offset;
        gl.renderer.render({ scene: meshUp, target: target0b, clear: true });
        src = target0b.texture;
      }
    }

    out.uniforms.tMap.value = src;
    // При lv = 0 в tMap лежит само фото — его надо обрезать; при lv > 0 там
    // FBO, уже обрезанный на первом проходе.
    out.uniforms.uCover.value = lv === 0 ? [...cover] : IDENTITY;
    out.uniforms.tSrc.value = source;
    out.uniforms.uCoverSrc.value = [...cover];
    out.uniforms.uMix.value = mixV;
    out.uniforms.uSaturate.value = saturate;
    gl.renderer.render({ scene: meshOut });
  }

  return {
    resize,
    render,
    dispose: dropTargets,
  };
}

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
 * 2. ПОДМЕШИВАНИЕ РЕЗКОГО ИСТОЧНИКА на малых радиусах (`uMix`). Первая ступень
 *    цепочки роняет источник сразу в четверть разрешения, поэтому минимальное
 *    ненулевое размытие ≈4 px при радиусе 2: между «резко» и «4 px» не было
 *    промежуточных состояний, и один шаг съедал 62 % диапазона резкости —
 *    ВНУТРИ одной подписанной ступени, где на капсуле по обе стороны написано
 *    «−1 дптр» (нашёл `fizik`). Рампа `radius/4` закрывает этот интервал.
 *
 * ⚠️ Рампа МОНОТОННАЯ от нуля, а НЕ по дробной части `log2`. Дробная часть на
 * границе `r → 4` перескочила бы с 1 на 0 и вернула бы резкий источник — новый
 * обрыв, хуже исходного (поправка `dirizher`).
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
  /** Пересобрать цепочку под новый размер канваса (CSS-px × pixelRatio). */
  resize(width: number, height: number): void;
  /**
   * Нарисовать кадр.
   * @param source  исходная текстура (фото секции)
   * @param radius  радиус расфокуса в пикселях ИСХОДНИКА (не тексела)
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
  let width = 0;
  let height = 0;

  const dropTargets = () => {
    for (const t of targets) {
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
  };

  function resize(w: number, h: number) {
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
    const lv =
      radius > 0
        ? Math.max(1, Math.min(targets.length, Math.ceil(Math.log2(Math.max(1, radius / 2)))))
        : 0;
    // Монотонная рампа от нуля: источник подмешивается только в 0…4 px и
    // больше не возвращается никогда.
    const mixV = Math.max(0, Math.min(1, radius / 4));

    let src: Texture = source;
    if (lv > 0) {
      const base = Math.pow(2, lv) * 2;
      const offset = Math.max(0.4, Math.min(3, radius / base));

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

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
const DOWN = `
precision highp float;
uniform sampler2D tMap;
uniform vec2 uTexel;   // размер тексела ИСТОЧНИКА
uniform float uOffset; // разъезд выборок — им и правится радиус
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uOffset;
  vec4 sum = texture2D(tMap, vUv) * 4.0;
  sum += texture2D(tMap, vUv - o);
  sum += texture2D(tMap, vUv + o);
  sum += texture2D(tMap, vUv + vec2(o.x, -o.y));
  sum += texture2D(tMap, vUv - vec2(o.x, -o.y));
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
const OUT = `
precision highp float;
uniform sampler2D tMap;
uniform float uSaturate;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tMap, vUv);
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
   */
  render(source: Texture, radius: number, saturate: number): void;
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
    uniforms: { tMap: { value: null }, uTexel: { value: [0, 0] }, uOffset: { value: 1 } },
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
    uniforms: { tMap: { value: null }, uSaturate: { value: 1 } },
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
    if (w === width && h === height && targets.length) return;
    width = w;
    height = h;
    dropTargets();
    for (let i = 0; i < levels; i += 1) {
      const div = Math.pow(2, i + 1);
      targets.push(
        new RenderTarget(gl, {
          width: Math.max(1, Math.round(w * scale / div)),
          height: Math.max(1, Math.round(h * scale / div)),
          depth: false,
        })
      );
    }
  }

  function render(source: Texture, radius: number, saturate: number) {
    if (!targets.length || !source) return;

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
    const lv = Math.max(
      0,
      Math.min(targets.length, Math.ceil(Math.log2(Math.max(1, radius / 2))))
    );

    let src: Texture = source;
    if (lv > 0) {
      const base = Math.pow(2, lv) * 2;
      const offset = Math.max(0.4, Math.min(3, radius / base));

      for (let i = 0; i < lv; i += 1) {
        const rt = targets[i];
        down.uniforms.tMap.value = src;
        down.uniforms.uTexel.value = [1 / rt.width, 1 / rt.height];
        down.uniforms.uOffset.value = offset;
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
    out.uniforms.uSaturate.value = saturate;
    gl.renderer.render({ scene: meshOut });
  }

  return {
    resize,
    render,
    dispose: dropTargets,
  };
}

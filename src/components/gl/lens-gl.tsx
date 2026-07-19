"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Mesh, Program, Texture, Triangle } from "ogl";
import { GLCanvas, type GLScene, type GLSetupArgs } from "@/components/gl/gl-canvas";
import type { LensSource, LensState } from "@/components/gl/lens-types";
import { svgToCanvas } from "@/components/gl/svg-texture";

/* ------------------------------------------------------------------
   ЧЕСТНАЯ ЛИНЗА (этап 5, шаги 2–4) — рефракция, а не «увеличенная копия».

   Отличие от CSS-лупы, которую она заменяет: там фон просто масштабировался
   (плоская картинка крупнее), здесь стекло ПРЕЛОМЛЯЕТ — увеличение растёт к
   центру (бочкообразная дисторсия), а у кромки появляется дисперсия: каналы
   R и B расходятся по радиусу, как на краю настоящей линзы. Отсюда и
   ощущение стекла, лежащего на фото, а не наложенного круга.

   ⚠️ ТЕКСТУРА — ТОЛЬКО ФОТО КАРТОЧКИ (plan.md, этап 5 шаг 2). Живой DOM в
   текстуру не тянем (html2canvas в рантайме запрещён каноном), FloatFrame —
   тем более: multiply-оправа в WebGL-текстуре превратилась бы в белый
   прямоугольник, а канвас над ней запрещён прямым «чего не делать».

   ⚠️ Гравировка диоптрий — SVG-обод DOM-ом (шаг 3), не в шейдере: он резче
   на любом renderScale и проще в приёмке.
   ------------------------------------------------------------------ */

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
 * Дисперсия задана в ПИКСЕЛЯХ и переводится в UV прямо в шейдере: канон
 * держит бюджет «≤2px по кромке», и порог, записанный в долях текстуры,
 * молча менял бы величину вместе с размером карточки.
 */
const FRAG = `
precision highp float;

uniform sampler2D tMap;
uniform vec2 uCenter;      // центр линзы, UV
uniform vec2 uSize;        // размер карточки, CSS-px
uniform float uRadius;     // радиус линзы, CSS-px
uniform float uZoom;       // увеличение в центре
uniform float uOpacity;    // проявление линзы
uniform float uDispersion; // разведение каналов у кромки, CSS-px

varying vec2 vUv;

void main() {
  // Работаем в пикселях: круг обязан остаться кругом на неквадратной карточке.
  vec2 px = vUv * uSize;
  vec2 cpx = uCenter * uSize;
  vec2 d = px - cpx;
  float dist = length(d);

  if (dist > uRadius) discard;

  float r = dist / uRadius;            // 0 в центре, 1 у кромки
  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);

  // Бочкообразная рефракция: в центре увеличение полное, к кромке спадает —
  // так ведёт себя выпуклое стекло, и именно это отличает линзу от зума.
  float k = 1.0 / uZoom;
  float bulge = mix(1.0, 1.28, pow(r, 2.2));   // край «оттягивает» картинку
  vec2 samplePx = cpx + d * k * bulge;

  // Дисперсия — только у кромки (r^3), в центре её нет: в середине стекла
  // лучи идут почти по оси, и разводить каналы там было бы враньём.
  //
  // ⚠️ ДЕЛИМ НА УВЕЛИЧЕНИЕ. Смещение задаётся в пикселях ИСХОДНИКА, а линза
  // его увеличивает: без деления бюджет «≤2px на экране» превращался в 2,3px
  // при zoom 1,85 и 3,25px при 2,6 — то есть нарушался всегда (нашёл физик).
  // Теперь uDispersion читается буквально: столько пикселей НА ЭКРАНЕ.
  float disp = (uDispersion / uZoom) * pow(r, 3.0);
  vec2 offset = dir * disp;

  vec2 uvR = (samplePx + offset) / uSize;
  vec2 uvG = samplePx / uSize;
  vec2 uvB = (samplePx - offset) / uSize;

  float rr = texture2D(tMap, uvR).r;
  vec4 g = texture2D(tMap, uvG);
  float bb = texture2D(tMap, uvB).b;

  vec3 color = vec3(rr, g.g, bb);

  // Мягкая внутренняя кромка — 1,5 px сглаживания, чтобы круг не «пилил».
  float edge = smoothstep(uRadius, uRadius - 1.5, dist);

  gl_FragColor = vec4(color, edge * uOpacity * g.a);
}
`;

/**
 * Дисперсия у кромки, ПИКСЕЛИ НА ЭКРАНЕ (шейдер делит на увеличение).
 * Бюджет канона — ≤2px, «субтильная».
 *
 * ⚠️ ЗНАЧЕНИЕ ЗАВИСИТ ОТ ИСТОЧНИКА, и это не вкусовщина. На фотографии
 * расхождение каналов тонет в собственных полутонах кадра, а на ВОЛОСЯНОЙ
 * графике чертежа — одиночная чёрная линия в 1px на светлом листе — тот же
 * сдвиг читается цветной каймой и выглядит браком печати, а не стеклом.
 * Замечено на живом кадре: арифметически бюджет соблюдался в обоих случаях,
 * глазами — нет.
 */
const DISPERSION_PHOTO = 1.6;
const DISPERSION_SVG = 0.8;

/** Программа линзы — одна на оба источника текстуры. */
function makeProgram(
  gl: GLSetupArgs["gl"],
  texture: Texture,
  dispersion: number
) {
  return new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tMap: { value: texture },
      uCenter: { value: [0.5, 0.5] },
      uSize: { value: [1, 1] },
      uRadius: { value: 98 },
      uZoom: { value: 1.85 },
      uOpacity: { value: 0 },
      uDispersion: { value: dispersion },
    },
  });
}

/** Кадр линзы — тоже общий: разница между источниками только в текстуре. */
function makeDraw(
  renderer: GLSetupArgs["renderer"],
  program: Program,
  mesh: Mesh,
  stateRef: React.MutableRefObject<LensState>
): GLScene["draw"] {
  return ({ width, height }) => {
    const s = stateRef.current;
    // Линза не проявлена — не тратим кадр вовсе.
    if (s.opacity <= 0.001) {
      renderer.gl.clearColor(0, 0, 0, 0);
      renderer.gl.clear(renderer.gl.COLOR_BUFFER_BIT);
      return;
    }
    program.uniforms.uCenter.value = [s.cx, s.cy];
    program.uniforms.uSize.value = [width, height];
    program.uniforms.uRadius.value = s.radius;
    program.uniforms.uZoom.value = s.zoom;
    program.uniforms.uOpacity.value = s.opacity;
    renderer.render({ scene: mesh });
  };
}

export function LensGL({
  source,
  stateRef,
  onFail,
  refreshKey,
}: {
  /** Что показывает стекло: фото карточки или снимок чертежа. */
  source: LensSource;
  /** Состояние линзы пишет ХОЗЯИН (курсор/палец) — без React-ре-рендеров. */
  stateRef: React.MutableRefObject<LensState>;
  onFail?: () => void;
  /** Смена значения пересобирает снимок SVG (выбор детали). */
  refreshKey?: string | number;
}) {
  const programRef = useRef<Program | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  /** Пересъёмка снимка чертежа. Живёт, пока жива сцена SVG-ветки. */
  const shootRef = useRef<(() => void) | null>(null);

  // Идентичность источника: смена ПЕРЕСОБИРАЕТ сцену, поэтому в зависимость
  // идёт стабильный ключ, а не сам объект (он новый на каждый рендер).
  const key = useMemo(
    () => (source.kind === "photo" ? `photo:${source.src}` : "svg"),
    [source]
  );

  const setup = useCallback(
    ({ renderer, gl }: GLSetupArgs): GLScene => {
      const texture = new Texture(gl, {
        generateMipmaps: false, // фото не уменьшается — мипы только память едят
      });
      const current = sourceRef.current;

      // ---- Чертёж Мастерской: офскрин-снимок живого SVG (шаг 7) ----
      if (current.kind === "svg") {
        let cancelled = false;
        const shoot = () => {
          const r = current.el.getBoundingClientRect();
          svgToCanvas(current.el, r.width, r.height, 1).then((canvas) => {
            if (cancelled) return;
            if (!canvas) {
              failRef.current?.(); // снимок не удался — честный фолбэк
              return;
            }
            texture.image = canvas;
            texture.needsUpdate = true;
          });
        };
        shoot();
        shootRef.current = shoot;

        // Чертёж — волосяные линии: дисперсия вдвое тише, чем на фото.
        const program = makeProgram(gl, texture, DISPERSION_SVG);
        programRef.current = program;
        const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
        return {
          draw: makeDraw(renderer, program, mesh, stateRef),
          dispose: () => {
            cancelled = true;
            programRef.current = null;
            shootRef.current = null;
          },
        };
      }

      // ⚠️ БЕРЁМ УЖЕ ДЕКОДИРОВАННЫЙ КАДР КАРТОЧКИ, а не качаем свой.
      // Карточка отдаётся через `next/image` (`/_next/image?url=…&w=…`, WebP),
      // а текстура тянула сырой `.jpg` — ДРУГОЙ URL: +123 КБ сети и +6 МБ
      // декода на каждую карточку, и всё это по жесту пользователя
      // (нашёл `hronometrist`). Тот же элемент — ноль лишней сети и та же
      // картинка, что человек видит вокруг стекла.
      const card = gl.canvas instanceof HTMLCanvasElement ? gl.canvas.closest("a") : null;
      const rendered = card?.querySelector("img") ?? null;

      let img: HTMLImageElement;
      if (rendered && rendered.complete && rendered.naturalWidth > 0) {
        img = rendered;
        texture.image = img;
        texture.needsUpdate = true;
      } else {
        // Кадр карточки ещё не дошёл (или его нет) — грузим сами, но тем же
        // адресом, каким его отдаёт разметка, если он известен.
        img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => {
          texture.image = img;
          texture.needsUpdate = true;
        };
        img.onerror = () => failRef.current?.();
        img.src = rendered?.currentSrc || rendered?.src || current.src;
      }

      const geometry = new Triangle(gl); // полноэкранный треугольник дешевле квада
      const program = makeProgram(gl, texture, DISPERSION_PHOTO);
      programRef.current = program;

      const mesh = new Mesh(gl, { geometry, program });

      return {
        draw: makeDraw(renderer, program, mesh, stateRef),
        dispose: () => {
          programRef.current = null;
          // Колбэки снимаем только со СВОЕГО изображения: элемент карточки
          // нам не принадлежит, и трогать его обработчики нельзя.
          if (img !== rendered) {
            img.onload = null;
            img.onerror = null;
          }
        },
      };
    },
    // `key` в теле не читается (источник берётся из ref, чтобы объект-пропс
    // не пересобирал сцену каждый рендер) — но он ОБЯЗАН быть в зависимостях:
    // смена источника должна пересобрать сцену целиком, иначе стекло покажет
    // прежнюю текстуру. Правило этого не видит; убрать зависимость — сломать.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, stateRef]
  );

  useEffect(() => () => void (programRef.current = null), []);

  // Выбрали другую деталь — чертёж изменился, снимок устарел. Пересъёмка идёт
  // ПО СОБЫТИЮ, а не каждый кадр: сериализация SVG слишком дорога для петли
  // (plan.md, этап 5 шаг 7 — снимок «статичен»).
  useEffect(() => {
    shootRef.current?.();
  }, [refreshKey]);

  return (
    <GLCanvas
      setup={setup}
      // Линза растворена — кадр не нужен вовсе (ни layout, ни GL).
      shouldRender={() => stateRef.current.opacity > 0.001}
      onContextLost={onFail}
      className="pointer-events-none absolute inset-0 z-20"
      // Пол выше общего 0,5: линза — крупный оптический эффект во весь
      // экран внимания, и мыло в ней читается как брак стекла, а не как
      // экономия (контракт клапана, plan.md §8).
      minScale={0.7}
    />
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Mesh, Program, Texture, Triangle } from "ogl";
import { GLCanvas, type GLScene, type GLSetupArgs } from "@/components/gl/gl-canvas";
import type { LensState } from "@/components/gl/lens-types";

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
  float disp = uDispersion * pow(r, 3.0);
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

export function LensGL({
  src,
  stateRef,
  onFail,
}: {
  src: string;
  /** Состояние линзы пишет ХОЗЯИН (курсор/палец) — без React-ре-рендеров. */
  stateRef: React.MutableRefObject<LensState>;
  onFail?: () => void;
}) {
  const programRef = useRef<Program | null>(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  // Фото карточки — единственный источник текстуры.
  const image = useMemo(() => src, [src]);

  const setup = useCallback(
    ({ renderer, gl }: GLSetupArgs): GLScene => {
      const texture = new Texture(gl, {
        generateMipmaps: false, // фото не уменьшается — мипы только память едят
      });

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        texture.image = img;
        texture.needsUpdate = true;
      };
      img.onerror = () => failRef.current?.();
      img.src = image;

      const geometry = new Triangle(gl); // полноэкранный треугольник дешевле квада
      const program = new Program(gl, {
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
          // ≤2px — эстетический бюджет дисперсии (CLAUDE.md, этап 5).
          uDispersion: { value: 1.6 },
        },
      });
      programRef.current = program;

      const mesh = new Mesh(gl, { geometry, program });

      return {
        draw: ({ width, height }) => {
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
        },
        dispose: () => {
          programRef.current = null;
          img.onload = null;
          img.onerror = null;
        },
      };
    },
    [image, stateRef]
  );

  useEffect(() => () => void (programRef.current = null), []);

  return (
    <GLCanvas
      setup={setup}
      onContextLost={onFail}
      className="pointer-events-none absolute inset-0 z-20"
      // Пол выше общего 0,5: линза — крупный оптический эффект во весь
      // экран внимания, и мыло в ней читается как брак стекла, а не как
      // экономия (контракт клапана, plan.md §8).
      minScale={0.7}
    />
  );
}

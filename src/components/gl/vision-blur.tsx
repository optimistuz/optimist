"use client";

import { useCallback, useEffect, useRef } from "react";
import { Texture } from "ogl";
import type { MotionValue } from "motion/react";
import { GLCanvas, type GLScene, type GLSetupArgs } from "@/components/gl/gl-canvas";
import { createKawase, type Kawase } from "@/components/gl/kawase";

/* ------------------------------------------------------------------
   СЛОЙ «БЕЗ КОРРЕКЦИИ» НА KAWASE (этап 6, шаг 2). Ленивый: грузится
   только когда шторка симулятора подходит к экрану.

   ⚠️ ПОЧЕМУ НЕ CSS-BLUR. Честные −6 дптр — это ~26–30px размытия на весь
   кадр. Пофреймовый CSS-blur такого радиуса средний Android не тянет, и
   прежний код от него ушёл ступенями: размытие пересчитывалось на
   границах 0,5 дптр и догонялось переходом 180 мс. Kawase снимает эту
   вилку: цена почти не зависит от радиуса, поэтому расфокус может быть
   и честным, и непрерывным одновременно.

   ⚠️ КАНВАС — ВНУТРИ overflow-hidden КОНТЕЙНЕРА и `absolute`, не `fixed`.
   `clip-path` шторки и маска глубины кладутся на САМ канвас (`canvasStyle`),
   поэтому скругление контейнера и обрезка работают сами, а лишнего слоя
   не возникает.

   ⚠️ ТЕКСТУРА — уже отрисованный `<img>` секции, а не своя загрузка:
   street.jpg весит 597 КБ, и второй декод удвоил бы память картинки
   на «/» (предупредил `dirizher` на брифе).
   ------------------------------------------------------------------ */

export function VisionBlur({
  hostRef,
  severity,
  clip,
  blurCoeff,
  satLoss,
  canvasStyle,
  onFail,
}: {
  /**
   * Контейнер симулятора. Изображение ищется внутри него — так `Photo`
   * (общий компонент всего сайта) не обрастает пропом ради одного места,
   * и критический путь «/» не платит за это ни байта.
   */
  hostRef: React.RefObject<HTMLElement | null>;
  /** 0…1 — сила расфокуса, НЕПРЕРЫВНАЯ (MotionValue, не состояние React). */
  severity: MotionValue<number>;
  /** Калибровка: радиус = severity × blurCoeff × ширина кадра. */
  blurCoeff: number;
  /** Потеря насыщенности на максимуме. */
  satLoss: number;
  /**
   * Обрезка шторки. ⚠️ Пишется в канвас ИМПЕРАТИВНО из петли: прогонять её
   * через состояние React значило бы перерисовывать дерево 60 раз в секунду
   * — ровно то, от чего этот этап уходит.
   */
  clip?: MotionValue<string>;
  canvasStyle?: React.CSSProperties;
  onFail?: () => void;
}) {
  const kawaseRef = useRef<Kawase | null>(null);
  const setMinRef = useRef<((v: number) => void) | null>(null);
  const lastFloorRef = useRef(0);
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const lastClipRef = useRef("");

  const setup = useCallback(
    ({ renderer, gl }: GLSetupArgs): GLScene => {
      const texture = new Texture(gl, { generateMipmaps: false });
      const kawase = createKawase(gl, { levels: 3, scale: 0.5 });
      kawaseRef.current = kawase;

      // Ждём, пока фото секции реально декодировано: пустая текстура дала бы
      // чёрный слой под шторкой вместо размытого кадра.
      const attach = () => {
        const img = hostRef.current?.querySelector("img") ?? null;
        if (!img) return;
        const use = () => {
          texture.image = img;
          texture.needsUpdate = true;
        };
        if (img.complete && img.naturalWidth > 0) use();
        else img.addEventListener("load", use, { once: true });
      };
      attach();

      return {
        resize: (w, h) => {
          const ratio = renderer.dpr || 1;
          kawase.resize(Math.round(w * ratio), Math.round(h * ratio));
        },
        draw: ({ width }) => {
          if (!texture.image) return;
          const s = severity.get();

          // Обрезка шторки — прямо в стиль канваса, только при смене строки.
          if (clipRef.current) {
            const next = clipRef.current.get();
            if (next !== lastClipRef.current) {
              lastClipRef.current = next;
              (gl.canvas as HTMLCanvasElement).style.clipPath = next;
            }
          }

          // ⚠️ ПОЛ КЛАПАНА ЗАВИСИТ ОТ СИЛЫ РАСФОКУСА. Слой уже размыт —
          // снижать невидимое разрешение честно (0,5). Слой почти резкий —
          // тот же пол замылил бы САМ ЭФФЕКТ (запрет §3-3) и провалил бы
          // приёмку шва: слева мыло, справа резкий DOM. Порог — 1,5 дптр
          // в долях максимума. Меняем ТОЛЬКО через setMin: реактивный проп
          // пересоздавал бы GL-контекст посреди перетаскивания.
          const floor = s >= 0.25 ? 0.5 : 0.7;
          if (floor !== lastFloorRef.current) {
            lastFloorRef.current = floor;
            setMinRef.current?.(floor);
          }

          const radius = s * blurCoeff * width;
          kawase.render(texture, radius, 1 - s * satLoss);
        },
        dispose: () => {
          kawase.dispose();
          kawaseRef.current = null;
        },
      };
    },
    [hostRef, severity, blurCoeff, satLoss]
  );

  useEffect(() => () => void (kawaseRef.current = null), []);

  return (
    <GLCanvas
      setup={setup}
      className="pointer-events-none absolute inset-0"
      canvasStyle={canvasStyle}
      minScale={0.7}
      onValve={({ setMin }) => (setMinRef.current = setMin)}
      onContextLost={onFail}
    />
  );
}

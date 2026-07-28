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
  maxDiopters,
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
  /** Максимум дефекта по модулю — чтобы порог пола считался в ДИОПТРИЯХ. */
  maxDiopters: number;
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
  /**
   * ⚠️ ТЕКСТУРА ПРИЕХАЛА ПОЗЖЕ — тоже «есть что рисовать». Фото декодируется
   * асинхронно, и при медленной сети `load` наступает, когда шторку уже никто
   * не трогает. Гейт покоя пускает кадр только на смену расфокуса или
   * положения — без этого флага слой оставался бы пустым до первого касания,
   * то есть «без коррекции» показывало бы резкий DOM.
   */
  const texDirtyRef = useRef(false);

  const setup = useCallback(
    ({ renderer, gl }: GLSetupArgs): GLScene => {
      const texture = new Texture(gl, { generateMipmaps: false });
      /**
       * ⚠️ ПЯТЬ СТУПЕНЕЙ, А НЕ ТРИ. Трёх хватало, пока радиус мерился в
       * пикселях буфера неявно и на плотном экране был вдвое слабее
       * обещанного. После нормировки (см. `kawase.render`) верхняя треть хода
       * на DPR 2 требует четвёртой ступени: `rBuf` доходит до 32, а глубина
       * упиралась в 3 — цепочка молча переставала расти, и «честные −6 дптр»
       * на ЭТАЛОННОМ ТЕЛЕФОНЕ упирались в потолок, которого канон у GL-ветки
       * не признаёт. Пятая — запас: ступень стоит один FBO шириной ~1/64
       * буфера (десятки пикселей) и НЕ рисуется, пока радиус до неё не дорос,
       * а «ровно впритык» — это то же молчаливое усечение, только отложенное.
       */
      const kawase = createKawase(gl, { levels: 5, scale: 0.5 });
      kawaseRef.current = kawase;

      /**
       * ⚠️ COVER-ОТОБРАЖЕНИЕ uv. `<img>` под канвасом лежит с
       * `object-fit: cover`, то есть ОБРЕЗАН, а шейдер натянул бы полный
       * кадр — канвас и DOM показывали бы разное изображение, и шов врал бы
       * (нашёл `fizik`). Считаем ту же обрезку, что делает браузер.
       *
       * Пересчитывать нужно и на `resize`, и на `load`: до декодирования
       * `naturalWidth` ещё нет.
       */
      let cover: [number, number, number, number] = [1, 1, 0, 0];
      const recalcCover = (boxW: number, boxH: number) => {
        const img = texture.image as HTMLImageElement | undefined;
        const iw = img?.naturalWidth ?? 0;
        const ih = img?.naturalHeight ?? 0;
        if (!iw || !ih || !boxW || !boxH) return;
        const imgA = iw / ih;
        const boxA = boxW / boxH;
        if (imgA > boxA) {
          // Фото шире кадра — режем по горизонтали.
          const s = boxA / imgA;
          cover = [s, 1, (1 - s) / 2, 0];
        } else {
          // Фото уже кадра — режем по вертикали.
          const s = imgA / boxA;
          cover = [1, s, 0, (1 - s) / 2];
        }
      };
      let lastBox: [number, number] = [0, 0];

      // Ждём, пока фото секции реально декодировано: пустая текстура дала бы
      // чёрный слой под шторкой вместо размытого кадра.
      const attach = () => {
        const img = hostRef.current?.querySelector("img") ?? null;
        // ⚠️ Изображения нет вовсе — слот пуст, и на его месте Placeholder
        // (`vision-sim` это прямо предусматривает через `photoLabel`).
        // Без этого канвас оставался прозрачным, CSS-фолбэк был скрыт как
        // «GL жив», и шторка молча переставала показывать что-либо слева —
        // без единой ошибки в консоли (нашёл `fizik`). Честно падаем.
        if (!img) {
          failRef.current?.();
          return;
        }
        const use = () => {
          texture.image = img;
          texture.needsUpdate = true;
          // Размеры фото стали известны только сейчас — обрезку считаем здесь.
          recalcCover(lastBox[0], lastBox[1]);
          texDirtyRef.current = true;
        };
        if (img.complete && img.naturalWidth > 0) use();
        else img.addEventListener("load", use, { once: true });
      };
      attach();

      return {
        resize: (w, h) => {
          const ratio = renderer.dpr || 1;
          // Третьим аргументом — CSS-ширина: только зная её, цепочка может
          // перевести радиус из CSS-пикселей в свои тексели. Считать это
          // отношение здесь по `renderer.dpr` нельзя — цепочка пересобирается
          // только на рост и после шага клапана вниз живёт в прежнем размере.
          kawase.resize(Math.round(w * ratio), Math.round(h * ratio), w);
          lastBox = [w, h];
          recalcCover(w, h);
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
          // ⚠️ Порог в ДИОПТРИЯХ, а не в доле. Доля 0,25 давала обещанные
          // 1,5 дптр только на улице (максимум 6); на книге (максимум 3) пол
          // падал уже при 0,75 дптр — код и канон расходились с поведением
          // второго симулятора (нашёл `fizik`).
          //
          // ⚠️ И ГИСТЕРЕЗИС. Один порог давал дребезг: клапан поднимает scale
          // МГНОВЕННО, а опускает шагами по 3 с, поэтому у границы пол
          // переключался 0,4 раза в секунду — 138 смен за 5,7 минуты, и
          // каждая пересобирала цепочку FBO в самый нагруженный момент
          // (нашёл `hronometrist`). Вниз — с 1,5 дптр, обратно — только
          // ниже 1,2: между ними состояние держится.
          const d = s * maxDiopters;
          const floor = d >= 1.5 ? 0.5 : d < 1.2 ? 0.7 : lastFloorRef.current || 0.7;
          if (floor !== lastFloorRef.current) {
            lastFloorRef.current = floor;
            setMinRef.current?.(floor);
          }

          const radius = s * blurCoeff * width;
          kawase.render(texture, radius, 1 - s * satLoss, cover);
        },
        dispose: () => {
          kawase.dispose();
          kawaseRef.current = null;
        },
      };
    },
    [hostRef, severity, blurCoeff, maxDiopters, satLoss]
  );

  useEffect(() => () => void (kawaseRef.current = null), []);

  /**
   * ⚠️ ГЕЙТ ПОКОЯ. Без него шторка рисовала 39,9 кадра В СЕКУНДУ, когда её
   * никто не трогает: петля каждый кадр дёргала layout, кормила клапан и
   * гоняла Kawase по НЕИЗМЕНИВШЕЙСЯ картинке — третья вечная анимация при
   * бюджете «ровно ДВЕ» (нашёл `hronometrist`: 2 392 отрисовки за 60 с
   * покоя; клапан от этого шагал вниз в чистом покое). У линзы такой гейт
   * был с самого начала, у шторки я его просто не передал.
   *
   * Рисуем, пока меняется расфокус или положение шторки, плюс ОДИН кадр
   * после остановки — иначе последнее движение осталось бы недорисованным.
   */
  const restRef = useRef({ s: -1, clip: "", settled: false });
  const shouldRender = useCallback(() => {
    const st = restRef.current;
    // Текстура доехала — рисуем, чем бы ни занимался пользователь.
    if (texDirtyRef.current) {
      texDirtyRef.current = false;
      st.settled = false;
      return true;
    }
    const s = severity.get();
    const clipNow = clip?.get() ?? "";
    if (s !== st.s || clipNow !== st.clip) {
      st.s = s;
      st.clip = clipNow;
      st.settled = false;
      return true;
    }
    if (!st.settled) {
      st.settled = true; // финальный кадр — и покой
      return true;
    }
    return false;
  }, [severity, clip]);

  return (
    <GLCanvas
      setup={setup}
      shouldRender={shouldRender}
      className="pointer-events-none absolute inset-0"
      canvasStyle={canvasStyle}
      minScale={0.7}
      onValve={({ setMin }) => (setMinRef.current = setMin)}
      onContextLost={onFail}
    />
  );
}

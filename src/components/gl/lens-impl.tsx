"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useTicker } from "@/components/smooth-scroll";
import type { LensState, PointerProbe } from "@/components/gl/lens-types";

/* ------------------------------------------------------------------
   ЛИНЗА — вся логика (этап 5, шаги 4–6). Грузится ЛЕНИВО, по первому
   наведению или касанию карточки (`ui/lens-loupe.tsx` — триггер).

   ТРИ ВЕТКИ:
   1. WebGL есть → честная линза с рефракцией (`lens-gl.tsx`).
   2. WebGL нет / контекст потерян / текстура не дошла → прежняя CSS-лупа.
      Фолбэк — рабочий эффект, а не заглушка.
   3. `reduce` сюда вообще не доходит: триггер не рендерит ничего.

   ⚠️ НИ ОДНОГО React-ре-рендера на движение указателя. Триггер пишет
   координаты в `probe`, здесь они читаются в ЕДИНОМ тикере (закон №4) и
   уезжают прямо в стили и в uniforms. Состояние React меняется только на
   смене ветки (gl ↔ css) — то есть почти никогда.

   ⚠️ Долгое нажатие считается ПО ВРЕМЕНИ в петле, а не таймером: жест
   начался ещё в триггере, до загрузки этого модуля, и таймер здесь
   опоздал бы ровно на время загрузки чанка.
   ------------------------------------------------------------------ */

const LensGL = dynamic(
  () => import("@/components/gl/lens-gl").then((m) => m.LensGL),
  { ssr: false }
);

const SIZE = 196; // px — диаметр линзы
const ZOOM_MIN = 1.85;
const ZOOM_MAX = 2.6;
const LONG_PRESS_MS = 350;
/** Палец не должен закрывать то, что рассматривает. */
const TOUCH_LIFT = 64; // px вверх от точки касания
/** Сдвиг пальца, отменяющий долгое нажатие: скролл важнее линзы. */
const MOVE_CANCEL = 10; // px
/** Скорость проявления/растворения (доля за кадр при 60 fps). */
const FADE = 0.18;

/** Есть ли WebGL вообще. Один раз на страницу — проба дорогая. */
let webglSupported: boolean | null = null;
function detectWebGL(): boolean {
  if (webglSupported !== null) return webglSupported;
  try {
    const c = document.createElement("canvas");
    const ctx =
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl");
    webglSupported = !!ctx;
    // ⚠️ Отпускаем контекст СРАЗУ. Проба его не рисует, но браузер держит
    // ограниченное число живых WebGL-контекстов на вкладку, и забытый
    // «пробный» отнимал бы место у самой линзы и у шторки этапа 6
    // (нашёл `fizik`: после двух карточек на странице жило 3 контекста).
    if (ctx && "getExtension" in ctx) {
      (ctx as WebGLRenderingContext)
        .getExtension("WEBGL_lose_context")
        ?.loseContext();
    }
  } catch {
    webglSupported = false;
  }
  return webglSupported;
}

export function LensImpl({
  src,
  probe,
}: {
  src: string;
  probe: React.MutableRefObject<PointerProbe>;
}) {
  const [gl, setGl] = useState<boolean | null>(null);
  const ticker = useTicker();

  const hostRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cssRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef<LensState>({
    cx: 0.5,
    cy: 0.5,
    radius: SIZE / 2,
    zoom: ZOOM_MIN,
    opacity: 0,
  });

  useEffect(() => setGl(detectWebGL()), []);

  // ---- Зум колесом (десктоп) ----
  useEffect(() => {
    const surface = hostRef.current?.parentElement; // поверхность жестов — триггер
    if (!surface) return;
    const onWheel = (e: WheelEvent) => {
      const s = stateRef.current;
      if (s.opacity <= 0.01) return; // линзы нет — не мешаем скроллу

      // ⚠️ НА ПРЕДЕЛЕ ЗУМА КОЛЕСО ВОЗВРАЩАЕТСЯ СТРАНИЦЕ. Карточки крупные,
      // и «залипший» скролл под курсором — худшее, что можно сделать с
      // прокруткой. Докрутил линзу до упора и крутишь дальше в ту же
      // сторону — листается страница, как и ожидает человек.
      const atMax = s.zoom >= ZOOM_MAX - 0.001 && e.deltaY < 0;
      const atMin = s.zoom <= ZOOM_MIN + 0.001 && e.deltaY > 0;
      if (atMax || atMin) return;

      // preventDefault точечно и ТОЛЬКО при живой линзе; ради этого слушатель
      // и не passive — но лишь на этом элементе, а не на документе.
      e.preventDefault();
      s.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s.zoom - e.deltaY * 0.0016));
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, []);

  // ---- Петля: читаем указатель, ведём линзу ----
  useEffect(() => {
    if (!ticker) return;
    const host = hostRef.current;
    if (!host) return;

    const surface = host.parentElement;
    let pressActive = false;
    let lenisBlocked = false;

    const tick = () => {
      const p = probe.current;
      const s = stateRef.current;

      // Долгое нажатие: считаем по времени, а не таймером (см. шапку).
      if (p.touch) {
        if (p.down && p.drift <= MOVE_CANCEL) {
          if (performance.now() - p.downAt >= LONG_PRESS_MS) pressActive = true;
        } else {
          pressActive = false;
        }
      }

      const wanted = p.touch ? pressActive : p.inside;

      // ⚠️ РАННИЙ ВЫХОД ДО getBoundingClientRect. Линзы нет и не просят —
      // работы тоже нет. Без этой отсечки тик, однажды подписавшись, навсегда
      // дёргал принудительный layout КАЖДЫЙ кадр, по одному на каждую
      // тронутую карточку (нашёл `fizik`): компонент не размонтируется, а
      // `armed` не сбрасывается.
      if (!wanted && s.opacity === 0) return;

      const rect = surface?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return;
      // Проявление/растворение — плавно, чтобы линза «наводилась», а не мигала.
      s.opacity += ((wanted ? 1 : 0) - s.opacity) * FADE;
      if (s.opacity < 0.004) s.opacity = 0;
      if (!wanted && s.opacity === 0) s.zoom = ZOOM_MIN; // следующий заход с базы

      const lift = p.touch ? TOUCH_LIFT : 0;
      const x = p.x - rect.left;
      const y = p.y - rect.top - lift;
      s.cx = x / rect.width;
      s.cy = y / rect.height;

      // ⚠️ ОТБИРАЕМ КОЛЕСО У LENIS, ПОКА ЛИНЗА ЖИВА. Одного `preventDefault`
      // мало: Lenis слушает `wheel` на window с `passive:false` и НЕ смотрит
      // на `defaultPrevented` — он крутил свой виртуальный скролл, курсор
      // уезжал с карточки, линза гасла, и зум колесом не работал вовсе
      // (нашёл `fizik`: шесть колёсиков прокручивали страницу ровно так же,
      // как над пустым фоном). Штатный механизм Lenis — этот атрибут; ставим
      // его ТОЛЬКО на живой линзе, иначе скролл залип бы над карточками.
      const live = s.opacity > 0.01;
      if (surface && live !== lenisBlocked) {
        lenisBlocked = live;
        if (live) surface.setAttribute("data-lenis-prevent-wheel", "");
        else surface.removeAttribute("data-lenis-prevent-wheel");
      }

      const ring = ringRef.current;
      if (ring) {
        ring.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`;
        ring.style.opacity = String(s.opacity);
      }
      const css = cssRef.current;
      if (css) {
        const z = s.zoom;
        css.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`;
        css.style.opacity = String(s.opacity);
        css.style.backgroundSize = `${rect.width * z}px ${rect.height * z}px`;
        css.style.backgroundPosition = `${-(x * z - SIZE / 2)}px ${-(y * z - SIZE / 2)}px`;
      }
    };

    ticker.addTick(tick);
    return () => {
      ticker.removeTick(tick);
      // Атрибут не имеет права пережить компонент: иначе Lenis навсегда
      // отдаст колесо над этой карточкой браузеру.
      surface?.removeAttribute("data-lenis-prevent-wheel");
    };
  }, [ticker, probe]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {gl === true ? (
        <LensGL src={src} stateRef={stateRef} onFail={() => setGl(false)} />
      ) : gl === false ? (
        /* Фолбэк: плоское увеличение без рефракции — но рабочее. */
        <div
          ref={cssRef}
          className="pointer-events-none absolute left-0 top-0 rounded-full border border-white/60 will-change-transform"
          style={{
            width: SIZE,
            height: SIZE,
            opacity: 0,
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            boxShadow:
              "0 16px 44px -14px rgba(13,13,13,0.55), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(13,13,13,0.06)",
          }}
        />
      ) : null}

      {/* ГРАВИРОВКА (шаг 3) — DOM-обод поверх канваса, СОСЕД, не обёртка.
          Кольцо и риски — SVG, а не шейдер: резки при любом renderScale
          и проверяются глазами в приёмке. */}
      <div
        ref={ringRef}
        className="pointer-events-none absolute left-0 top-0 will-change-transform"
        style={{ width: SIZE, height: SIZE, opacity: 0 }}
      >
        <svg viewBox="0 0 196 196" className="h-full w-full" fill="none">
          <circle cx="98" cy="98" r="97" stroke="rgba(255,255,255,0.6)" />
          <circle cx="98" cy="98" r="94" stroke="rgba(13,13,13,0.10)" />
          {/* Риски по кромке — как на ободе у оптика. Четверти, не частокол. */}
          {[0, 90, 180, 270].map((deg) => (
            <line
              key={deg}
              x1="98"
              y1="4"
              x2="98"
              y2="12"
              stroke="rgba(13,13,13,0.28)"
              strokeWidth="1"
              transform={`rotate(${deg} 98 98)`}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

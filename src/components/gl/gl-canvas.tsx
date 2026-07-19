"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Renderer } from "ogl";
import { useTicker } from "@/components/smooth-scroll";
import { createFrameOveruse, createRenderScale } from "@/lib/render-scale";

/* ------------------------------------------------------------------
   ОБЩИЙ ogl-КАНВАС (этап 5, шаг 1). Инфраструктура на два подписных
   эффекта: линза этапа 5 и Kawase-шторка этапа 6 — второй её
   ПЕРЕИСПОЛЬЗУЕТ, а не пишет свою.

   Что берёт на себя:
   - создание Renderer и его уборку (включая освобождение контекста);
   - DPR-кап 2 × renderScale (закон движка №3);
   - регистрацию в ЕДИНОМ тикере через `addRender` (закон №4) — рисование
     идёт ПОСЛЕ эффектов, чтобы кадр не отставал;
   - паузу вне вьюпорта (IO) и в скрытой вкладке (правило вечного движения);
   - ленивый подъём: контекст создаётся, только когда секция-хозяин
     подошла к экрану (IO rootMargin 100%), а не при маунте;
   - `webglcontextlost` → честный переход в фолбэк-режим.

   ⚠️ КОНТРАКТ КЛАПАНА (plan.md §8, закреплён render-scale.test.ts).
   Закон — ЗАМКНУТОСТЬ КОНТУРА: датчик обязан двигаться от того, чем клапан
   управляет. Здесь работа уходит на GPU асинхронно, поэтому замер вокруг
   `draw()` видел бы только выдачу GL-команд — доли миллисекунды, и клапан
   не шагал БЫ НИКОГДА (так и было: 30 fps при scale 1,0). Датчик —
   ПЕРЕРАСХОД над измеренным шагом экрана (`createFrameOveruse`): здоровый
   кадр даёт РОВНО НОЛЬ, поэтому саморазгон структурно невозможен.
   Сырой `dt` сюда подавать НЕЛЬЗЯ — он задан герцовкой, а не нагрузкой.

   ⚠️ Пол разрешения — ПРОП, а не константа: §3-3 запрещает деградировать
   сам ЭФФЕКТ, и у каждого канваса своя граница, за которой падает уже не
   невидимое разрешение, а картинка (у оверлея примерки это 0,85).
   ------------------------------------------------------------------ */

export type GLDrawArgs = {
  /** Время кадра из единого тикера, мс. */
  time: number;
  /** Ширина буфера в CSS-пикселях. */
  width: number;
  /** Высота буфера в CSS-пикселях. */
  height: number;
};

export type GLSetupArgs = {
  renderer: Renderer;
  /** Контекст берём ТИПОМ ИЗ ogl: свой «WebGLRenderingContext &…» не сходится
      с тем, что ждут конструкторы Program/Texture/Triangle. */
  gl: Renderer["gl"];
};

/** Что вернул setup: как рисовать кадр и как убрать за собой. */
export type GLScene = {
  draw: (args: GLDrawArgs) => void;
  dispose?: () => void;
  /** Вызывается при изменении размера буфера (пересборка FBO и т.п.). */
  resize?: (width: number, height: number) => void;
};

export function GLCanvas({
  setup,
  className = "",
  minScale = 0.5,
  active = true,
  shouldRender,
  onContextLost,
}: {
  /** Сборка сцены. Вызывается ОДИН раз, когда контекст поднят. */
  setup: (args: GLSetupArgs) => GLScene;
  className?: string;
  /** Нижний предел renderScale для этого канваса (см. контракт выше). */
  minScale?: number;
  /** Внешний выключатель: false — канвас спит (не рисует). */
  active?: boolean;
  /**
   * Есть ли что рисовать ПРЯМО СЕЙЧАС. Читается каждый кадр и обязан быть
   * дешёвым (проверка числа в ref, не запрос к DOM).
   *
   * ⚠️ Без него петля трогала layout (`host.clientWidth` в `ensureSize`) и
   * чистила кадр даже при полностью растворённом эффекте — по разу на
   * каждый живой канвас (нашёл `hronometrist`).
   */
  shouldRender?: () => boolean;
  /** Контекст потерян или WebGL недоступен — хозяин уходит в фолбэк. */
  onContextLost?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ticker = useTicker();

  // Контекст поднимаем ЛЕНИВО: пока секция далеко, ogl не нужен вовсе.
  const [near, setNear] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Стабильные ссылки на колбэки: их смена не должна пересоздавать контекст.
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const lostRef = useRef(onContextLost);
  lostRef.current = onContextLost;
  const renderGateRef = useRef(shouldRender);
  renderGateRef.current = shouldRender;

  const markLost = useCallback(() => {
    lostRef.current?.();
  }, []);

  // ---- Ленивый подъём: секция подошла к экрану ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true); // без IO поднимаем сразу — лучше эффект, чем ничего
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setNear(true);
          io.disconnect(); // подняли один раз — дальше следит пауза ниже
        }
      },
      { rootMargin: "100%" }
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  // ---- Контекст, тикер, паузы ----
  useEffect(() => {
    if (!near || !ticker) return;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false, // дороже, чем даёт: сглаживание делает сам шейдер
        dpr: 1, // размером управляем сами, через клапан
      });
    } catch {
      markLost(); // WebGL недоступен — хозяин показывает CSS-фолбэк
      return;
    }

    const gl = renderer.gl as GLSetupArgs["gl"];

    let scene: GLScene | null = null;
    try {
      scene = setupRef.current({ renderer, gl });
    } catch {
      markLost();
      return;
    }

    // Порог этого датчика — НЕ общий. Перерасход квантуется вертикальной
    // синхронизацией: он почти всегда либо 0, либо целый шаг кадра, и EMA
    // перерасхода ≈ шаг × доля потерянных кадров. Порог 8 означал бы
    // «половина кадров потеряна» — слишком поздно; 4 — примерно четверть
    // (plan.md §8, условие 3).
    const rs = createRenderScale({ min: minScale, slowMs: 4 });
    rs.attach();

    let inView = true;
    let lost = false;
    let bw = 0;
    let bh = 0;

    // ---- Датчик: перерасход над ШАГОМ ЭКРАНА (lib/render-scale.ts) ----
    // Замер вокруг `scene.draw()` показывал доли миллисекунды: это выдача
    // GL-команд, а настоящая цена платится на GPU асинхронно, за окном
    // замера. Клапан видел ~0,2 мс при пороге 8 и не шагал НИКОГДА, пока
    // линза шла на 30 fps (нашёл `hronometrist`).
    const overuse = createFrameOveruse();
    let lastFrame = 0;
    let drewLast = false;

    const onLost = (e: Event) => {
      e.preventDefault(); // без этого контекст не восстановится никогда
      lost = true;
      markLost();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              inView = entries[0]?.isIntersecting ?? true;
              // Простой вне кадра — не повод считать устройство медленным.
              if (inView) rs.reset();
            },
            { threshold: 0.01 }
          )
        : null;
    if (io) io.observe(host);

    // ⚠️ РАЗМЕРОМ ВЛАДЕЕТ ТОЛЬКО RENDERER. Соблазн выставить `canvas.width` и
    // `gl.viewport` руками разбивает кадр: `Renderer.render()` КАЖДЫМ кадром
    // переустанавливает viewport в `this.width * this.dpr`
    // (node_modules/ogl/src/core/Renderer.js:359) и затирает ручной вызов.
    // Итог на DPR 2 — стекло рисуется в нижнюю-левую четверть канваса, вдвое
    // мельче обода, то есть на КАЖДОМ реальном телефоне и ретине; при шаге
    // клапана вниз оно, наоборот, разъезжается наружу. Поймал `fizik`
    // замером `gl.getParameter(gl.VIEWPORT)` против `canvas.width` — моя
    // собственная проба этого не видела, потому что headless идёт с DPR 1.
    let lastW = -1;
    let lastH = -1;
    let lastRatio = -1;
    const ensureSize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const ratio = rs.pixelRatio();
      if (w !== lastW || h !== lastH || ratio !== lastRatio) {
        renderer.dpr = ratio; // клапан живёт ЗДЕСЬ, а не в ручном viewport
        renderer.setSize(w, h); // сам выставит буфер, стиль и viewport
        scene?.resize?.(w, h);
        lastW = w;
        lastH = h;
        lastRatio = ratio;
      }
      bw = w;
      bh = h;
    };
    ensureSize();

    const render = (time: number) => {
      // Любой пропуск кадра обнуляет признак: следующий интервал будет
      // содержать паузу, а не работу.
      if (lost || !activeRef.current || !inView) {
        drewLast = false;
        return;
      }
      if (typeof document !== "undefined" && document.hidden) {
        drewLast = false;
        return;
      }
      // Рисовать нечего — не трогаем ни layout, ни GL. Проверка стоит ДО
      // `ensureSize`, иначе гейт бессмысленен: layout читался бы всё равно.
      if (renderGateRef.current && !renderGateRef.current()) {
        drewLast = false;
        return;
      }

      // Датчик считается ТОЛЬКО по двум подряд НАРИСОВАННЫМ кадрам: интервал
      // через пропуск — это пауза, а не нагрузка.
      if (drewLast) {
        rs.sample(overuse.push(time - lastFrame), time);
      } else {
        overuse.gap();
      }
      lastFrame = time;
      drewLast = true;

      ensureSize();
      scene?.draw({ time, width: bw, height: bh });
    };

    ticker.addRender(render);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => ensureSize())
        : null;
    if (ro) ro.observe(host);

    return () => {
      ticker.removeRender(render);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      rs.detach();
      scene?.dispose?.();
      // Освобождаем контекст явно: браузер держит ограниченное число живых
      // WebGL-контекстов на вкладку, и «забытый» канвас отнимает его у
      // следующего эффекта (этап 6 поднимет свой на той же странице).
      try {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* расширения может не быть — не беда */
      }
    };
  }, [near, ticker, minScale, markLost]);

  return (
    <div ref={hostRef} className={className} aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="pointer-events-none block h-full w-full"
      />
    </div>
  );
}

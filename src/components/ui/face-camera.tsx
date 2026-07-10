"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FrameOverlay } from "@/components/ui/frame-overlay";
import { FaceScan } from "@/components/ui/face-scan";
import { FaceResult } from "@/components/ui/face-result";
import { getFaceLandmarker } from "@/lib/face-landmarker";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  createEstimator,
  featuresFromLandmarks,
  frameQuality,
  type Decision,
  type Pt,
  type Quality,
  type Shape,
} from "@/lib/face-shape";
import { overlayForFace, type FrameKind } from "@/lib/fit-recommend";
import { writeFit } from "@/lib/fit-storage";
import { cn } from "@/lib/cn";
import { faceFit } from "@/content/home";

const FRAME_KINDS: FrameKind[] = [
  "round",
  "oval",
  "rectangle",
  "square",
  "clubmaster",
  "aviator",
  "catEye",
  "geometric",
];

/* ------------------------------------------------------------------
   Камера подбора по лицу + детекция и НАУЧНАЯ классификация (Блоки 2–3).

   getUserMedia (фронталка) → зеркальное <video>. Петля rAF +
   detectForVideo идёт ТОЛЬКО при видимой вкладке и секции во вьюпорте
   (visibilitychange-пауза + IntersectionObserver). Накапливаются только
   «чистые» фронтальные кадры (отбраковка наклона/поворота/мелкого лица),
   решение — по медиане окна (lib/face-shape). Подсказки повышают долю
   чистых кадров.

   Оверлей-чертёж (Блок 4), кино-скан (Блок 5) и полный экран результата
   (Блок 6) добавляются поверх этого же <video>; здесь — каркас петли и
   временный минимальный результат.

   Приватность: cleanup останавливает треки; estimator.reset() обнуляет
   окно; ландмарки и последний кадр живут только в памяти.
   ------------------------------------------------------------------ */

type Phase = "requesting" | "streaming" | "denied" | "unsupported";
type SubPhase = "analyzing" | "result";

/* Сходимость классификации (стабильность результата у одного человека):
   сначала наполняем окно медианы (WINDOW), затем требуем, чтобы один и тот
   же primary держался STABLE_NEEDED кадров подряд И был «уверенным» (зазор
   ≥ порога) — только тогда фиксируем. Пограничные лица (близкие score)
   не фиксируются рано: сканируются до HARD_MAX и честно отдаются смесью.
   Так повторный замер даёт тот же ответ, а не случайный из двух соседних. */
const WINDOW = 64; // = размер окна оценщика (медиана отношений)
const STABLE_NEEDED = 30; // кадров подряд с тем же primary (~1 с)
const HARD_MAX = 220; // потолок чистых кадров (~7 с) → отдать как есть
// Стоп-движение: в выборку идут только кадры с НЕПОДВИЖНОЙ головой —
// смещение опорных точек (зрачки+нос) между кадрами относительно
// межзрачкового. Движущиеся кадры «смазывают» отношения формы и тянут
// результат то в одну сторону, то в другую → разный ответ у одного лица.
const MOTION_MAX = 0.05; // доля ipd за кадр (~30 fps); выше — «держите ровно»

/** Опорные точки для оценки неподвижности (в px кадра) + межзрачковое. */
function keyPoints(lm: Pt[], w: number, h: number) {
  const has = lm.length >= 478;
  const eL = has ? lm[468] : lm[33];
  const eR = has ? lm[473] : lm[263];
  const nose = lm[1];
  if (!eL || !eR || !nose) return null;
  const px = (p: Pt) => ({ x: p.x * w, y: p.y * h });
  const a = px(eL);
  const b = px(eR);
  const ipd = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  return { pts: [a, b, px(nose)], ipd };
}

const HINT: Record<Quality, string> = {
  ok: faceFit.hints.none,
  noface: faceFit.hints.center,
  closer: faceFit.hints.closer,
  straight: faceFit.hints.straight,
  center: faceFit.hints.center,
};

export function FaceCamera({
  reduce,
  onUseQuiz,
  onStop,
}: {
  reduce: boolean;
  onUseQuiz: () => void;
  onStop: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceLandmarker | null>(null);

  const [phase, setPhase] = useState<Phase>("requesting");
  const [modelReady, setModelReady] = useState(false);
  const [subphase, setSubphase] = useState<SubPhase>("analyzing");
  const [progress, setProgress] = useState(0);
  const [hint, setHint] = useState<string>("");
  const [decision, setDecision] = useState<Decision | null>(null);
  // Камера «на паузе» после долгого ухода секции из вьюпорта (приватность).
  const [standby, setStandby] = useState(false);
  const standbyRef = useRef(false);
  standbyRef.current = standby;
  // Силуэт-примерка оверлея. До решения — нейтральный «клабмастер» (идёт
  // большинству); после решения — рекомендованный; чипсы дают ручную смену.
  const [frameKind, setFrameKind] = useState<FrameKind>("clubmaster");
  const frameTouchedRef = useRef(false); // пользователь сменил силуэт вручную
  // Ручная правка формы лица (чипсы результата). null — берём из решения.
  const [manualFace, setManualFace] = useState<Shape | null>(null);

  // Мутабельное состояние петли — в рефах, чтобы эффект не пересоздавался.
  const estimatorRef = useRef(createEstimator());
  // Сходимость решения (стабильность результата): держим последний primary и
  // сколько кадров подряд он держится; плюс общий счётчик чистых кадров.
  const lastPrimaryRef = useRef<Shape | null>(null);
  const stableCountRef = useRef(0);
  const cleanCountRef = useRef(0);
  // Предыдущие опорные точки — для стоп-движения (неподвижность головы).
  const prevKeyRef = useRef<{ pts: { x: number; y: number }[]; ipd: number } | null>(
    null
  );
  const subphaseRef = useRef<SubPhase>("analyzing");
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  // Последний разбор кадра — для оверлея-чертежа (Блок 4) и скана (Блок 5).
  const latestRef = useRef<{ lm: Pt[] | null; w: number; h: number }>({
    lm: null,
    w: 0,
    h: 0,
  });

  // ---- Остановка потока (приватность): треки + отвязка + чистка кадра ----
  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* уже остановлен */
        }
      });
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* noop */
      }
      v.srcObject = null;
    }
    // Буквальное «стирается после подбора»: окно усреднения и ландмарки.
    estimatorRef.current.reset();
    lastPrimaryRef.current = null;
    stableCountRef.current = 0;
    cleanCountRef.current = 0;
    prevKeyRef.current = null;
    latestRef.current = { lm: null, w: 0, h: 0 };
  }, []);

  // ---- Старт камеры ----
  const start = useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setPhase("unsupported");
      return;
    }
    setPhase("requesting");
    try {
      // Ниже разрешение на слабых/узких устройствах (Блок 7.3): телефону
      // достаточно 480px — меньше работы детектору, ~24–30 fps хватает.
      const small =
        typeof window !== "undefined" &&
        (window.innerWidth < 640 ||
          window.matchMedia?.("(pointer: coarse)").matches);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: small ? 480 : 640 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      v.srcObject = stream;
      try {
        await v.play();
      } catch {
        /* подхватится при возврате во вкладку */
      }
      setPhase("streaming");
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name: string }).name)
          : "";
      if (name === "NotFoundError" || name === "OverconstrainedError")
        setPhase("unsupported");
      else setPhase("denied");
    }
  }, []);

  useEffect(() => {
    start();
    return () => stopStream();
  }, [start, stopStream]);

  // ---- Ленивая загрузка модели (только после клика «Включить камеру») ----
  useEffect(() => {
    let alive = true;
    getFaceLandmarker()
      .then((lm) => {
        if (!alive) return;
        detectorRef.current = lm;
        setModelReady(true);
      })
      .catch(() => {
        // Модель не загрузилась → деградация в квиз (без тупика, Блок 7.2).
        if (alive) setPhase("unsupported");
      });
    return () => {
      alive = false;
    };
  }, []);

  // ---- Петля детекции: только streaming + модель готова ----
  useEffect(() => {
    if (phase !== "streaming" || !modelReady) return;

    let raf = 0;
    let lastTs = -1;
    let lastDetect = 0;
    let active = true;
    let inView = true;
    const DETECT_INTERVAL = 33; // ~30 fps: детекция дорогая, чаще не нужно

    const visible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    const io =
      typeof IntersectionObserver !== "undefined" && wrapRef.current
        ? new IntersectionObserver(
            (entries) => {
              inView = entries[0]?.isIntersecting ?? true;
            },
            { threshold: 0.1 }
          )
        : null;
    if (io && wrapRef.current) io.observe(wrapRef.current);

    const tick = () => {
      if (!active) return;
      raf = requestAnimationFrame(tick);

      const v = videoRef.current;
      const detector = detectorRef.current;
      // Пауза вне вьюпорта / в скрытой вкладке (правило вечного движения).
      if (!v || !detector || !visible() || !inView || v.readyState < 2) return;

      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return;

      // Троттлинг детекции до ~30 fps (rAF может быть 60–120 Гц).
      const nowMs = performance.now();
      if (nowMs - lastDetect < DETECT_INTERVAL) return;
      lastDetect = nowMs;

      let ts = nowMs;
      if (ts <= lastTs) ts = lastTs + 1; // detectForVideo: строго растущий ts
      lastTs = ts;

      let lm: Pt[] | null = null;
      try {
        const res = detector.detectForVideo(v, ts);
        lm = res?.faceLandmarks?.[0] ?? null;
      } catch {
        return; // временный сбой кадра — пропускаем
      }

      latestRef.current = { lm, w, h };

      const q = frameQuality(lm, w, h);

      // Стоп-движение: даже фронтальный кадр идёт в выборку только если
      // голова стоит. Смещение опорных точек между детекциями (доля ipd).
      let moving = false;
      if (q === "ok" && lm) {
        const k = keyPoints(lm, w, h);
        const prev = prevKeyRef.current;
        if (k && prev) {
          let d = 0;
          for (let i = 0; i < 3; i++)
            d += Math.hypot(k.pts[i].x - prev.pts[i].x, k.pts[i].y - prev.pts[i].y);
          if (d / 3 / k.ipd > MOTION_MAX) moving = true;
        }
        prevKeyRef.current = k;
      } else {
        prevKeyRef.current = null;
      }

      setHint(q === "ok" && moving ? faceFit.hints.steady : HINT[q]);

      if (subphaseRef.current === "analyzing" && q === "ok" && !moving && lm) {
        const est = estimatorRef.current;
        est.add(featuresFromLandmarks(lm, w, h));
        cleanCountRef.current += 1;
        const collected = est.count();

        if (collected < WINDOW) {
          // Фаза 1 — наполнение окна медианы (прогресс до ~45%).
          stableCountRef.current = 0;
          setProgress(0.45 * (collected / WINDOW));
        } else {
          // Фаза 2 — ждём, пока решение УСТОИТСЯ (один primary подряд + уверенность).
          const d = est.decide();
          if (d) {
            if (lastPrimaryRef.current === d.primary) stableCountRef.current += 1;
            else {
              lastPrimaryRef.current = d.primary;
              stableCountRef.current = 0;
            }
            const convFrac = Math.min(1, stableCountRef.current / STABLE_NEEDED);
            const timeFrac = Math.min(
              1,
              (cleanCountRef.current - WINDOW) / (HARD_MAX - WINDOW)
            );
            // Уверенное решение ведёт прогресс сходимостью; пограничное —
            // временем (доходит до 100% только к HARD_MAX, потом отдаём смесью).
            const lead = d.confident
              ? convFrac
              : Math.max(convFrac * 0.7, timeFrac);
            setProgress(Math.min(1, 0.45 + 0.55 * lead));

            const converged =
              stableCountRef.current >= STABLE_NEEDED && d.confident;
            if (converged || cleanCountRef.current >= HARD_MAX) {
              setDecision(d);
              // Силуэт по умолчанию — рекомендованный для формы (если пользователь
              // ещё не выбрал свой). Смена даёт «наведение» кроссфейдом.
              if (!frameTouchedRef.current) setFrameKind(overlayForFace(d.primary));
              subphaseRef.current = "result";
              setSubphase("result");
              // «Наведение на резкость» кадра — одноразовый blur 8→0 (5.2),
              // выразитель концепции, не цикл. reduced-motion: без него.
              const vEl = videoRef.current;
              if (vEl && !reduceRef.current) {
                vEl.style.transition = "none";
                vEl.style.filter = "blur(8px)";
                requestAnimationFrame(() => {
                  const v2 = videoRef.current;
                  if (!v2) return;
                  v2.style.transition = "filter 600ms ease";
                  v2.style.filter = "blur(0px)";
                });
              }
            }
          }
        }
      }
      // В subphase "result" петля продолжает обновлять latestRef (оверлей-
      // чертёж следит за лицом), но окно усреднения не копит.
    };

    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
    };
  }, [phase, modelReady]);

  // ---- Камера ГАСНЕТ при долгом уходе секции из вьюпорта (Блок 7.1/7.3) ----
  // Краткая прокрутка мимо лишь ставит детекцию на паузу (выше); длительное
  // отсутствие (>STANDBY_MS) останавливает треки. Возврат секции в кадр
  // поднимает камеру сам.
  useEffect(() => {
    if (phase !== "streaming") return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const STANDBY_MS = 8000;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? true;
        if (!vis) {
          if (!timer)
            timer = window.setTimeout(() => {
              timer = 0;
              stopStream(); // треки + окно усреднения + ландмарки — буквально
              setStandby(true);
            }, STANDBY_MS);
        } else {
          if (timer) {
            window.clearTimeout(timer);
            timer = 0;
          }
          if (standbyRef.current) {
            setStandby(false);
            start(); // повторный getUserMedia (разрешение уже выдано в сессии)
          }
        }
      },
      { threshold: 0.05 }
    );
    io.observe(el);
    return () => {
      if (timer) window.clearTimeout(timer);
      io.disconnect();
    };
  }, [phase, start, stopStream]);

  const handleResume = () => {
    setStandby(false);
    start();
  };

  const handleStop = () => {
    stopStream();
    onStop();
  };

  const restart = () => {
    estimatorRef.current.reset();
    lastPrimaryRef.current = null;
    stableCountRef.current = 0;
    cleanCountRef.current = 0;
    prevKeyRef.current = null;
    setProgress(0);
    setDecision(null);
    setManualFace(null);
    frameTouchedRef.current = false;
    setFrameKind("clubmaster");
    subphaseRef.current = "analyzing";
    setSubphase("analyzing");
  };

  // Силуэт, который клиент РЕАЛЬНО покрутил на лице, — единственное, что камера
  // отдаёт наружу (§«Граница утечки»). Это его выбор, не биометрия. Форма записи
  // просыпается сразу: writeFit диспатчит `optimist-fit-updated`.
  const chooseFrame = (k: FrameKind) => {
    frameTouchedRef.current = true;
    setFrameKind(k);
    writeFit({ silhouette: k, source: "camera" });
  };

  // Эффективная форма: ручная правда важнее автоопределения.
  const effectiveFace: Shape | null = manualFace ?? decision?.primary ?? null;

  const pickFace = (s: Shape) => {
    setManualFace(s);
    // Силуэт по умолчанию подстраивается под новую форму (если не выбран вручную).
    if (!frameTouchedRef.current) setFrameKind(overlayForFace(s));
  };

  // ⚠️ Камерная классификация (face, secondary, производная от неё рекомендация)
  // в localStorage НЕ пишется и в заявку НЕ уходит — граница утечки §«Примерка
  // и камера». Она живёт только в памяти вкладки и умирает вместе с ней.
  // Наружу идёт единственное: силуэт, выбранный руками (см. chooseFrame).
  // Силуэт по умолчанию выведен из формы лица (overlayForFace) и потому
  // раскрыл бы классификацию косвенно — его не записываем.

  // ---- Экраны отказа / неподдерживается → выход в квиз всегда есть ----
  if (phase === "denied" || phase === "unsupported") {
    const c = faceFit.camera;
    const title = phase === "denied" ? c.deniedTitle : c.unsupportedTitle;
    const body = phase === "denied" ? c.deniedBody : c.unsupportedBody;
    return (
      <div className="mx-auto max-w-xl text-center">
        <h3 className="font-serif text-2xl font-light leading-snug text-ink">
          {title}
        </h3>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-graphite sm:text-base">
          {body}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Button onClick={onUseQuiz}>{c.toQuiz}</Button>
          {phase === "denied" && (
            <button
              type="button"
              onClick={start}
              className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {c.retry}
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {c.backToChoose}
          </button>
        </div>
      </div>
    );
  }

  // ---- Запрос / поток ----
  const pct = Math.round(progress * 100);

  return (
    <div className="mx-auto max-w-3xl">
      <div
        ref={wrapRef}
        className="relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-lg border border-line bg-ink/[0.04] sm:aspect-[4/3]"
      >
        {/* Зеркало (scaleX −1): ландмарки в исходных координатах кадра,
            оверлей-чертёж (Блок 4) рисуется в той же зеркальной системе.
            object-contain (letterbox): оверлей считает реальный
            отображаемый прямоугольник. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-contain"
        />

        {/* Оверлей-чертёж оправы (Блок 4) — следит за лицом. */}
        {phase === "streaming" && modelReady && !standby && (
          <FrameOverlay kind={frameKind} latestRef={latestRef} reduce={reduce} />
        )}

        {/* Кино-скан (Блок 5) — только во время анализа; завершается
            наведением на резкость и снимается на результате. */}
        {phase === "streaming" &&
          modelReady &&
          !standby &&
          subphase === "analyzing" && (
            <FaceScan
              latestRef={latestRef}
              reduce={reduce}
              waiting={hint !== ""}
            />
          )}

        {/* Камера на паузе (ушли из вьюпорта надолго) */}
        {standby && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-paper/80 p-6 text-center">
            <p className="text-sm font-medium text-ink">
              {faceFit.camera.standby}
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-graphite">
              {faceFit.camera.standbyHint}
            </p>
            <Button variant="secondary" onClick={handleResume}>
              {faceFit.camera.resume}
            </Button>
          </div>
        )}

        {(phase === "requesting" || !modelReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-paper/60">
            <p className="px-6 text-center text-sm leading-relaxed text-graphite">
              {phase === "requesting"
                ? faceFit.camera.requesting
                : faceFit.camera.loadingModel}
            </p>
          </div>
        )}

        {/* Подсказка по качеству кадра — внизу видео */}
        {phase === "streaming" &&
          modelReady &&
          hint &&
          subphase === "analyzing" && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
              <span className="rounded-full bg-ink/65 px-3 py-1 text-xs font-medium tracking-wide text-paper">
                {hint}
              </span>
            </div>
          )}
      </div>

      {/* Чипсы силуэта-примерки (Блок 4.2) — фокус-идиома выбора. Меняют
          чертёж на лице кроссфейдом 200 мс. */}
      {phase === "streaming" && modelReady && (
        <div
          role="radiogroup"
          aria-label="Силуэт оправы для примерки"
          className="mt-5 flex flex-wrap justify-center gap-2"
        >
          {FRAME_KINDS.map((k) => {
            const sel = frameKind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => chooseFrame(k)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  sel
                    ? "border-brand text-ink"
                    : "border-line text-graphite hover:border-ink/40 hover:text-ink"
                )}
              >
                {faceFit.frames[k]}
              </button>
            );
          })}
        </div>
      )}

      {/* Прогресс анализа (привязан к реальному накоплению чистых кадров) */}
      {phase === "streaming" && modelReady && subphase === "analyzing" && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-graphite tabular-nums">
            <span>{faceFit.scan.analyzing}</span>
            <span>{pct}%</span>
          </div>
          <div
            className="mt-2 h-px w-full bg-line"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-px bg-brand transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Результат подбора + ручная правка + связка с формой (Блок 6) */}
      {subphase === "result" && decision && effectiveFace && (
        <FaceResult
          face={effectiveFace}
          secondary={decision.secondary}
          mixture={decision.mixture}
          confident={decision.confident}
          manual={manualFace !== null}
          reduce={reduce}
          onPickFace={pickFace}
        />
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {subphase === "result" && (
          <button
            type="button"
            onClick={restart}
            className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {faceFit.result.again}
          </button>
        )}
        <Button variant="secondary" onClick={handleStop}>
          {faceFit.camera.stop}
        </Button>
        <button
          type="button"
          onClick={onUseQuiz}
          className="text-sm tracking-wide text-graphite underline decoration-line underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {faceFit.camera.toQuiz}
        </button>
      </div>
    </div>
  );
}

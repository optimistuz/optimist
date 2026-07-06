"use client";

import { useEffect, useRef } from "react";
import { motionValue, useTransform, type MotionValue } from "motion/react";
import { useScrollVelocity } from "@/components/smooth-scroll";

/**
 * useGaze — единый шлюз ВВОДА (закон движка №5, CLAUDE.md). Все эффекты берут
 * «вектор взгляда» и скорость отсюда; собственные matchMedia/pointer-слушатели
 * они не заводят.
 *
 * Источники, сведённые в ОДИН глобальный слушатель на весь сайт (не по одному
 * на компонент):
 *  - точный указатель и тач — Pointer Events (pointermove покрывает и мышь, и
 *    палец; pointerType различает их);
 *  - Android — deviceorientation (детект как во float-frame: DeviceOrientation
 *    есть, requestPermission НЕ функция — без диалогов; iOS молча без гиро);
 *  - velocity — прокси СУЩЕСТВУЮЩЕЙ шины Lenis (useScrollVelocity, px/кадр).
 *    Motion useVelocity (px/сек) сюда НЕ подмешивается — сломал бы калибровку
 *    motion-focus [−30,0,30] и VELOCITY_K маркизы.
 *
 * Слушатели вешаются ЛЕНИВО: пока нет ни одного подписчика (subscribers === 0),
 * ни один listener не висит — на этапе 1 потребителей ещё нет, значит нулевая
 * цена и нулевой видимый дифф. Первый useGaze активирует шлюз, последний —
 * снимает. Значение шарится синглтоном (эквивалент «одного слушателя, многих
 * подписчиков» без провайдера в дереве).
 *
 * API: useGaze(ref?) → { x, y, velocity, active }.
 *  - без ref: x/y нормализованы к центру ВЬЮПОРТА (−1…1);
 *  - с ref: x/y нормализованы к центру ЭЛЕМЕНТА (−1…1);
 *  - active: 1 пока идёт ввод; для тача после отпускания → 0, но x/y ОСТАЮТСЯ
 *    (что делать «после отпускания», решает потребитель).
 */
export interface Gaze {
  x: MotionValue<number>;
  y: MotionValue<number>;
  velocity: MotionValue<number>;
  active: MotionValue<number>;
}

// ---- Синглтон общего состояния (создаётся один раз на модуль) ----
const absX = motionValue(0); // абсолютные координаты указателя, px
const absY = motionValue(0);
const vpX = motionValue(0); // нормализация к вьюпорту, −1…1
const vpY = motionValue(0);
const activeMV = motionValue(0);

let subscribers = 0;
let attached = false;
let isAndroid = false;

function setFromClient(cx: number, cy: number) {
  absX.set(cx);
  absY.set(cy);
  vpX.set((cx / window.innerWidth) * 2 - 1);
  vpY.set((cy / window.innerHeight) * 2 - 1);
}

function onPointerMove(e: PointerEvent) {
  setFromClient(e.clientX, e.clientY);
  if (e.pointerType !== "touch") activeMV.set(1); // мышь/перо: наведение = актив
}
function onPointerDown(e: PointerEvent) {
  setFromClient(e.clientX, e.clientY);
  activeMV.set(1);
}
function onPointerUp(e: PointerEvent) {
  if (e.pointerType === "touch") activeMV.set(0); // тач отпущен: значения остаются
}
function onOrient(e: DeviceOrientationEvent) {
  // gamma −90…90 (лево-право), beta −180…180 (наклон вперёд-назад) → −1…1
  const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 45));
  const gy = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 45) / 45));
  vpX.set(gx);
  vpY.set(gy);
  activeMV.set(1);
}

function attach() {
  if (attached) return;
  attached = true;
  const DOE = (
    window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }
  ).DeviceOrientationEvent;
  isAndroid = typeof DOE !== "undefined" && typeof DOE.requestPermission !== "function";
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });
  if (isAndroid) window.addEventListener("deviceorientation", onOrient);
}
function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  if (isAndroid) window.removeEventListener("deviceorientation", onOrient);
  activeMV.set(0);
}

export function useGaze(ref?: React.RefObject<HTMLElement | null>): Gaze {
  const velocity = useScrollVelocity();

  // Подписка на глобальный шлюз: первый монтирующийся вешает слушатели,
  // последний размонтирующийся — снимает.
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) attach();
    return () => {
      subscribers -= 1;
      if (subscribers === 0) detach();
    };
  }, []);

  // Относительно центра ЭЛЕМЕНТА (ленивое чтение rect в момент трансформа —
  // считается только пока указатель движется и потребитель жив).
  const relX = useTransform([absX, absY], ([cx]: number[]) => {
    const r = ref?.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return ((cx - (r.left + r.width / 2)) / (r.width / 2));
  });
  const relY = useTransform([absX, absY], ([, cy]: number[]) => {
    const r = ref?.current?.getBoundingClientRect();
    if (!r || r.height === 0) return 0;
    return ((cy - (r.top + r.height / 2)) / (r.height / 2));
  });

  // Один и тот же ref на всех рендерах — хук стабилен (ref не меняется).
  const useRel = useRef(!!ref).current;
  return {
    x: useRel ? relX : vpX,
    y: useRel ? relY : vpY,
    velocity,
    active: activeMV,
  };
}

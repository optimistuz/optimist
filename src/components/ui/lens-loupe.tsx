"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------
   Лупа-линза — подписной оптический эффект «рассмотреть оправу» (санкция
   CLAUDE.md: «Lens-лупа ИЛИ Focus Cards» — один на блок). Наведение на
   кадр даёт круглую линзу, что следует за курсором и увеличивает фото
   (как лупа оптика над оправой). Чёткое кольцо + блик + контактная тень.

   Накладывается оверлеем ВНУТРИ карточки-ссылки: слушает pointermove
   (pointer-events на оверлее), но клики всплывают к родительскому <a>
   (pointermove не делает preventDefault) — навигация цела, как и
   group-hover карточки (ховер ловится на самом <a>). Перф: позиция
   линзы пишется прямо в style через rAF, без React-ре-рендеров.

   Только desktop/pointer:fine; reduced-motion и тач — оверлей не
   рендерится (карточка работает как прежде).
   ------------------------------------------------------------------ */

const SIZE = 196; // px — диаметр линзы
const ZOOM = 1.85; // увеличение

export function LensLoupe({ src }: { src: string }) {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setEnabled(fine.matches && !reduce.matches);
    apply();
    fine.addEventListener("change", apply);
    reduce.addEventListener("change", apply);
    return () => {
      fine.removeEventListener("change", apply);
      reduce.removeEventListener("change", apply);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  if (!enabled) return null;

  const onMove = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    const loupe = loupeRef.current;
    if (!wrap || !loupe) return;
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      loupe.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`;
      loupe.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
      loupe.style.backgroundPosition = `${-(x * ZOOM - SIZE / 2)}px ${-(y * ZOOM - SIZE / 2)}px`;
    });
  };

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="absolute inset-0 z-20"
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onPointerMove={onMove}
    >
      <div
        ref={loupeRef}
        className="pointer-events-none absolute left-0 top-0 rounded-full border border-white/60 transition-opacity duration-200 ease-soft will-change-transform"
        style={{
          width: SIZE,
          height: SIZE,
          opacity: active ? 1 : 0,
          backgroundImage: `url(${src})`,
          backgroundRepeat: "no-repeat",
          boxShadow:
            "0 16px 44px -14px rgba(13,13,13,0.55), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(13,13,13,0.06)",
        }}
      />
    </div>
  );
}

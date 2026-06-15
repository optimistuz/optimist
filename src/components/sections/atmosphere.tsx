"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { FocalPlane } from "@/components/ui/focal-plane";
import { Photo } from "@/components/ui/photo";
import { PHOTOS } from "@/content/photos";
import { atmosphere } from "@/content/home";

/**
 * «Атмосфера» — полноэкранная фотография салона без заголовка.
 * Интерьер «дышит» по скроллу: внутренний слой плавно отъезжает
 * (scale 1.15 → 1.0, y −4% → 4%, transform-only — без перерисовок).
 * Слот пуст → секция не рендерится вовсе. Reduced-motion: статичное фото.
 */
export default function Atmosphere() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduceAfterMount();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1.15, 1]);
  const y = useTransform(scrollYProgress, [0, 1], ["-4%", "4%"]);

  if (!PHOTOS.interior) return null;

  return (
    <section
      ref={ref}
      aria-label="Атмосфера салона"
      // Тёмное полноэкранное фото — «Шкала наводки» над ним светлеет
      data-rail-invert=""
      className="relative h-[60vh] overflow-hidden lg:h-[75vh]"
    >
      <motion.div
        style={reduce ? undefined : { scale, y }}
        className="absolute inset-0"
      >
        {/* Фокальная плоскость — отдельный слой внутри transform-слоя */}
        <FocalPlane className="absolute inset-0">
          <Photo
            slot="interior"
            alt="Интерьер салона оптики «Оптимист»: стена с оправами в тёплом свете"
            sizes="100vw"
          />
        </FocalPlane>
      </motion.div>

      {/* Кинематографичная эмердженция: тёмный кадр поднимается из светлой
          секции сверху и растворяется в белой снизу — мягкий «фокус-переход»
          вместо резкого стыка. Над фото, под подписью. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-20 bg-gradient-to-b from-offwhite to-transparent sm:h-28"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-20 bg-gradient-to-t from-paper to-transparent sm:h-28"
      />

      {/* Подпись-капсула на премиальном тёмном стекле */}
      <span className="glass-dark glass-sheen absolute bottom-6 left-6 z-10 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-paper sm:bottom-8 sm:left-8">
        {atmosphere.caption}
      </span>
    </section>
  );
}

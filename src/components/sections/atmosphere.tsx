"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduceAfterMount } from "@/lib/use-reduce-after-mount";
import { Photo } from "@/components/ui/photo";
import { PHOTOS } from "@/content/photos";
import { atmosphere } from "@/content/home";

/**
 * «Атмосфера» — полноэкранная фотография салона без заголовка.
 *
 * НАСТОЯЩАЯ ГРИП (этап 3), глубина БЕЗ анимации фильтра:
 *  - под резким interior.jpg лежит слой-двойник interior-blur.jpg (запечён на
 *    этапе 0) как ambient bokeh — статичный, aria-hidden, БЕЗ priority (не
 *    влияет на LCP);
 *  - резкий слой мягко РАСТВОРЯЕТСЯ у верх/низ-кромок СТАТИЧНОЙ маской
 *    (mask-image, НЕ фильтр) — сквозь него проступает размытая база: фокус в
 *    центре кадра, боке к кромкам;
 *  - два слоя едут по скроллу с чуть РАЗНЫМИ скоростями (y коэф ~1 и ~0.92) —
 *    боке-кромки параллаксят относительно резкого центра, давая глубину.
 * Полноэкранное фото живым фильтром НЕ блюрится (§3): прежний FocalPlane
 * (live-blur) снят — тяжёлый расфокус запечён в ассет.
 *
 * Слот пуст → секция не рендерится. Reduced-motion: статичный кадр (без
 * скролл-параллакса; статичная маска-боке — не движение — остаётся).
 */

// Резкий слой держится в центре, тает к кромкам — открывает размытую базу.
const DOF_MASK =
  "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)";
const maskCss = {
  WebkitMaskImage: DOF_MASK,
  maskImage: DOF_MASK,
} as const;

export default function Atmosphere() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduceAfterMount();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const scale = useTransform(scrollYProgress, [0, 1], [1.15, 1]);
  const yFront = useTransform(scrollYProgress, [0, 1], ["-4%", "4%"]); // коэф 1
  const yBack = useTransform(scrollYProgress, [0, 1], ["-3.7%", "3.7%"]); // коэф ~0.92

  if (!PHOTOS.interior) return null;

  return (
    <section
      ref={ref}
      aria-label="Атмосфера салона"
      // Тёмное полноэкранное фото — «Шкала наводки» над ним светлеет
      data-rail-invert=""
      className="relative h-[60vh] overflow-hidden lg:h-[75vh]"
    >
      {/* Ambient bokeh: запечённый размытый двойник, чуть медленнее по скроллу.
          Без priority → не влияет на LCP; aria-hidden — декоративная глубина. */}
      <motion.div
        aria-hidden
        style={reduce ? undefined : { scale, y: yBack }}
        className="absolute inset-0"
      >
        <Image
          src="/photos/interior-blur.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
      </motion.div>

      {/* Резкий кадр поверх, растворяется у кромок статичной маской (боке
          проступает по краям). Живого фильтра НЕТ — расфокус запечён в базу. */}
      <motion.div
        style={reduce ? maskCss : { scale, y: yFront, ...maskCss }}
        className="absolute inset-0"
      >
        <Photo
          slot="interior"
          alt="Интерьер салона оптики «Оптимист»: стена с оправами в тёплом свете"
          sizes="100vw"
        />
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

"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
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
  const reduce = useReducedMotion();
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
      className="relative h-[60vh] overflow-hidden lg:h-[75vh]"
    >
      <motion.div
        style={reduce ? undefined : { scale, y }}
        className="absolute inset-0"
      >
        <Photo
          slot="interior"
          alt="Интерьер салона оптики «Оптимист»: стена с оправами в тёплом свете"
          sizes="100vw"
        />
      </motion.div>

      {/* Подпись-капсула: стиль единый с капсулами слайдера «Зрение» */}
      <span className="absolute bottom-6 left-6 z-10 rounded-full bg-ink/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-paper backdrop-blur-sm sm:bottom-8 sm:left-8">
        {atmosphere.caption}
      </span>
    </section>
  );
}

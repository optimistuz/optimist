"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { PHOTOS, type PhotoSlot } from "@/content/photos";
import { Placeholder } from "@/components/ui/placeholder";

/**
 * Единственная точка вставки фотографий на сайте.
 * По имени слота берёт файл из карты PHOTOS; если слот пуст —
 * graceful-деградация в Placeholder с подписью.
 * Рендерится внутри родителя с position: relative (Image fill).
 *
 * Сетевое появление: пока файл грузится — подложка paper, по onLoad
 * (или сразу, если изображение уже в кэше — проверка complete)
 * мягкий fade 500 мс. Это про сеть; imageReveal — про скролл,
 * они не конфликтуют (разные триггеры и слои).
 */
export function Photo({
  slot,
  alt,
  sizes,
  priority = false,
  className,
  label,
}: {
  slot: PhotoSlot;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Подпись для Placeholder, если слот пуст (по умолчанию — alt). */
  label?: string;
}) {
  const src = PHOTOS[slot];
  const [loaded, setLoaded] = useState(false);

  if (!src) {
    return <Placeholder label={label ?? alt} className={className} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      ref={(img) => {
        // Кэшированные изображения: onLoad может не успеть — complete
        if (img?.complete) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
      className={cn(
        "bg-paper object-cover transition-opacity duration-500",
        loaded ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}

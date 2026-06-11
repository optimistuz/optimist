import Image from "next/image";
import { cn } from "@/lib/cn";
import { PHOTOS, type PhotoSlot } from "@/content/photos";
import { Placeholder } from "@/components/ui/placeholder";

/**
 * Единственная точка вставки фотографий на сайте.
 * По имени слота берёт файл из карты PHOTOS; если слот пуст —
 * graceful-деградация в Placeholder с подписью.
 * Рендерится внутри родителя с position: relative (Image fill).
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
      className={cn("object-cover", className)}
    />
  );
}

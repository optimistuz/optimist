/**
 * render-scale — страховка канвасов (закон движка №3, CLAUDE.md).
 *
 * Деградирует НЕВИДИМОЕ внутреннее разрешение канваса (renderScale), а НИКОГДА
 * сам эффект. Решение по EMA времени кадра с гистерезисом: если кадры стабильно
 * тяжёлые (EMA > порога) дольше окна удержания — шаг вниз; восстановление
 * медленнее (двойное окно). Итоговое разрешение = min(DPR, 2) × scale.
 *
 * Модуль без React и без потребителей на этапе 1: канвасы (ogl-линза, Kawase-
 * шторка) появятся на этапах 5–6 и вызовут sample() в едином тикере, attach()
 * повесит сброс по visibilitychange. Пока никто не создаёт инстанс — цена ноль.
 */
export const MAX_DPR = 2;

export interface RenderScaleOptions {
  /** Нижний предел scale (не деградируем ниже). */
  min?: number;
  /** Шаг деградации/восстановления. */
  step?: number;
  /** Порог «медленного» кадра, мс (19 ≈ 52 fps). */
  slowMs?: number;
  /** Сколько мс подряд держать медленно, чтобы шагнуть вниз. */
  holdMs?: number;
}

export interface RenderScale {
  /** Вызывать каждый кадр: dt — время кадра (мс), now — метка времени (мс). */
  sample(dt: number, now: number): number;
  /** Сбросить временные аккумуляторы (scale «липкий», не сбрасывается). */
  reset(): void;
  /** Повесить сброс по visibilitychange (вызывает потребитель-канвас). */
  attach(): void;
  detach(): void;
  readonly scale: number;
  /** Итоговый pixelRatio канваса: min(DPR, 2) × scale. */
  pixelRatio(): number;
}

export function createRenderScale(opts: RenderScaleOptions = {}): RenderScale {
  const min = opts.min ?? 0.5;
  const step = opts.step ?? 0.15;
  const slowMs = opts.slowMs ?? 19; // ~52 fps
  const holdMs = opts.holdMs ?? 3000; // 3 с подряд
  const fastMs = slowMs * 0.75; // «комфортно быстро»
  const recoverMs = holdMs * 2; // восстановление медленнее деградации

  let ema = 1000 / 60;
  let scale = 1;
  let slowSince = 0;
  let fastSince = 0;

  const round = (n: number) => Math.round(n * 100) / 100;

  function reset() {
    ema = 1000 / 60;
    slowSince = 0;
    fastSince = 0;
    // scale НЕ сбрасываем — деградация «липкая» до честного восстановления
  }

  const onVis = () => {
    // Вкладку свернули → кадры-выбросы; на возврате чистим аккумуляторы,
    // чтобы простой не выдал ложную деградацию.
    if (typeof document !== "undefined" && !document.hidden) reset();
  };

  function sample(dt: number, now: number): number {
    // Аномальные dt (сворачивание, точка останова, вкладка в фоне) игнорируем
    if (dt > 250) {
      slowSince = 0;
      fastSince = 0;
      return scale;
    }
    ema = ema * 0.95 + dt * 0.05;

    if (ema > slowMs) {
      fastSince = 0;
      if (slowSince === 0) slowSince = now;
      else if (now - slowSince >= holdMs && scale > min) {
        scale = Math.max(min, round(scale - step));
        slowSince = now; // один шаг за окно удержания
      }
    } else if (ema < fastMs) {
      slowSince = 0;
      if (fastSince === 0) fastSince = now;
      else if (now - fastSince >= recoverMs && scale < 1) {
        scale = Math.min(1, round(scale + step));
        fastSince = now;
      }
    } else {
      // нейтральная зона — не копим ни деградацию, ни восстановление
      slowSince = 0;
      fastSince = 0;
    }
    return scale;
  }

  return {
    sample,
    reset,
    attach() {
      if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", onVis);
    },
    detach() {
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onVis);
    },
    get scale() {
      return scale;
    },
    pixelRatio() {
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      return Math.min(dpr, MAX_DPR) * scale;
    },
  };
}

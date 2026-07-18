/**
 * Фильтр «One Euro» (Casiez, Roussel, Vogel, 2012) — сглаживание якорей
 * примерки между детекциями камеры.
 *
 * Компромисс «дрожь ↔ лаг» адаптивен по скорости: на медленном движении
 * (или в покое) частота среза низкая → сильное сглаживание, дрожь уходит;
 * на быстром движении срез растёт → сглаживание слабеет, лаг не копится.
 * Именно это нужно оверлею: детекция идёт на частоте кадров камеры
 * (24–30 fps), а красим 60 fps — фильтр отдаёт плавный кадр между детекциями,
 * не размазывая быстрый поворот головы.
 *
 * ⚠️ ФУНДАМЕНТ ПИШЕТСЯ ОДИН РАЗ (plan.md §5.2): один и тот же фильтр кормит
 * 2D-полировку (этап 7) → 2.5D-проекцию лекал (этап 14) → GLB-слежение
 * (этап 15). Не заводить второй сглаживатель в этих этапах.
 *
 * Единицы: время — миллисекунды (performance.now / rvfc mediaTime·1000);
 * dt внутри переводится в секунды, cutoff — в герцах. Значение и производная
 * могут быть в любых единицах (px, радианы, доли) — важно, чтобы beta
 * подбиралась под масштаб канала (см. MultiFilter).
 */

export type OneEuroOptions = {
  /** Минимальная частота среза (Гц). Ниже — сильнее сглаживание в покое. */
  minCutoff?: number;
  /** Реакция на скорость. Выше — меньше лага на быстром движении. */
  beta?: number;
  /** Частота среза для производной (Гц). */
  dCutoff?: number;
};

/** Экспоненциальный низкочастотный фильтр: hatX = a·x + (1−a)·hatX. */
class LowPass {
  private hatX: number | null = null;

  filter(x: number, alpha: number): number {
    this.hatX = this.hatX === null ? x : alpha * x + (1 - alpha) * this.hatX;
    return this.hatX;
  }

  reset(): void {
    this.hatX = null;
  }
}

/** Коэффициент сглаживания из частоты среза и шага времени. */
function smoothingAlpha(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private lastTimeMs: number | null = null;
  private lastX: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.0;
    this.beta = opts.beta ?? 0.007;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  /** Отфильтровать значение `x`, измеренное в момент `tMs` (мс). */
  filter(x: number, tMs: number): number {
    if (this.lastTimeMs === null || this.lastX === null) {
      // Первый кадр — вернуть как есть (сглаживать не с чем).
      this.lastTimeMs = tMs;
      this.lastX = x;
      return this.xFilter.filter(x, 1);
    }
    // Нижний порог dt: два кадра в одну мс или обратный ход часов не должны
    // взрывать производную (деление на ~0).
    const dtSec = Math.max((tMs - this.lastTimeMs) / 1000, 1e-4);
    this.lastTimeMs = tMs;

    const dx = (x - this.lastX) / dtSec;
    this.lastX = x;
    const edx = this.dxFilter.filter(dx, smoothingAlpha(this.dCutoff, dtSec));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, smoothingAlpha(cutoff, dtSec));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTimeMs = null;
    this.lastX = null;
  }
}

/**
 * Набор фильтров по именованным каналам — по одному OneEuroFilter на ключ,
 * заводится лениво при первом обращении. Для якорей оверлея это
 * cx/cy/angle/ipd/squashL/squashR (px, радианы и доли — но beta одна;
 * каналы малого масштаба, angle/squash, получают почти постоянное мягкое
 * сглаживание, и это ровно то, что нужно медленным величинам).
 */
export class MultiFilter {
  private readonly filters = new Map<string, OneEuroFilter>();

  constructor(private readonly opts: OneEuroOptions = {}) {}

  filter(key: string, x: number, tMs: number): number {
    let f = this.filters.get(key);
    if (!f) {
      f = new OneEuroFilter(this.opts);
      this.filters.set(key, f);
    }
    return f.filter(x, tMs);
  }

  /** Сбросить все каналы (потеря лица, рестарт камеры — начать сглаживание заново). */
  reset(): void {
    // Map.forEach, а не for..of по итератору: фундамент §5.2 не должен
    // зависеть от target/downlevelIteration в tsconfig (TS2802).
    this.filters.forEach((f) => f.reset());
  }
}

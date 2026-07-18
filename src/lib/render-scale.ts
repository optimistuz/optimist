/**
 * render-scale — страховка канвасов (закон движка №3, CLAUDE.md).
 *
 * Деградирует НЕВИДИМОЕ внутреннее разрешение канваса (renderScale), а НИКОГДА
 * сам эффект. Решение по EMA времени кадра с гистерезисом: если кадры стабильно
 * тяжёлые (EMA > порога) дольше окна удержания — шаг вниз; восстановление
 * медленнее (двойное окно). Итоговое разрешение = min(DPR, 2) × scale.
 *
 * Модуль без React. Первый потребитель — оверлей примерки
 * (`components/ui/frame-overlay.tsx`, этап 7): он сампит время кадра в петле
 * покраски и берёт pixelRatio() вместо голого DPR-капа. Канвасы этапов 5–6
 * (ogl-линза, Kawase-шторка) подключатся так же — sample() в едином тикере,
 * attach() вешает сброс по visibilitychange.
 */
export const MAX_DPR = 2;

export interface RenderScaleOptions {
  /** Нижний предел scale (не деградируем ниже). */
  min?: number;
  /** Шаг деградации/восстановления. */
  step?: number;
  /** Порог «дорогой» покраски, мс РАБОТЫ (8 ≈ половина бюджета кадра 60 fps). */
  slowMs?: number;
  /** Сколько мс подряд держать дорого, чтобы шагнуть вниз. */
  holdMs?: number;
}

export interface RenderScale {
  /**
   * Вызывать каждый кадр.
   *
   * ⚠️ `cost` — СТОИМОСТЬ ПОКРАСКИ (сколько миллисекунд заняла работа),
   * а НЕ интервал между кадрами. Разница принципиальная и однажды уже стоила
   * этому клапану работоспособности: интервал задан троттлингом и герцовкой
   * экрана, а не нагрузкой, поэтому понижение разрешения на него не влияет —
   * контур управления, чей исполнитель не влияет на датчик, саморазгоняется
   * в упор. На 90-герцевом Galaxy A15 (эталонное устройство!) интервал в
   * ПОКОЕ равен 22,2 мс — всегда больше любого разумного порога, и клапан
   * душил разрешение на простаивающем телефоне (нашёл `hronometrist`).
   * Стоимость же падает вместе с разрешением — обратная связь замыкается.
   */
  sample(cost: number, now: number): number;
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
  // Пороги — в миллисекундах РАБОТЫ на кадр. Бюджет кадра при 60 fps — 16,7 мс,
  // и он делится с детекцией, композитором и остальной страницей: покраска
  // дороже половины бюджета — настоящая перегрузка, а не всплеск.
  const slowMs = opts.slowMs ?? 8;
  const holdMs = opts.holdMs ?? 3000; // 3 с подряд
  // ⚠️ Порог восстановления обязан быть ДОСТИЖИМ. Прежняя формула (0,75 от
  // порога) при измерении по wall-clock давала 14,25 мс при минимально
  // возможном dt 16,67 мс — условие не выполнялось НИКОГДА, и любая
  // деградация, включая ложную, была необратима (нашёл `hronometrist`).
  // Дешёвая покраска канваса стоит 1–3 мс, так что 60 % порога берётся.
  const fastMs = slowMs * 0.6;
  const recoverMs = holdMs * 2; // восстановление медленнее деградации

  // Стартовая оценка — дешёвая покраска, а не период кадра: EMA теперь
  // измеряет работу.
  let ema = 2;
  let scale = 1;
  let slowSince = 0;
  let fastSince = 0;

  const round = (n: number) => Math.round(n * 100) / 100;

  function reset() {
    ema = 2;
    slowSince = 0;
    fastSince = 0;
    // scale НЕ сбрасываем — деградация «липкая» до честного восстановления
  }

  const onVis = () => {
    // Вкладку свернули → кадры-выбросы; на возврате чистим аккумуляторы,
    // чтобы простой не выдал ложную деградацию.
    if (typeof document !== "undefined" && !document.hidden) reset();
  };

  function sample(cost: number, now: number): number {
    // Аномальные замеры (точка останова, вытеснение потока, свёрнутая вкладка)
    // игнорируем: это не стоимость покраски, а провал в планировщике.
    //
    // ⚠️ Порог 500, а НЕ 250. При замере интервалов 250 мс отсекали ровно ту
    // полосу, ради которой клапан существует: под тяжёлым троттлингом ВСЕ
    // кадры длиннее 250 мс, и клапан становился инертен там, где нужнее всего
    // (нашёл `fizik`). Со стоимостью работы запас нужен тот же: на слабом
    // устройстве под нагрузкой честная покраска доходит до сотен мс, и
    // отбрасывать её как «аномалию» значит слепнуть в перегрузке.
    if (!(cost >= 0) || cost > 500) {
      slowSince = 0;
      fastSince = 0;
      return scale;
    }
    ema = ema * 0.95 + cost * 0.05;

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

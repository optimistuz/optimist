/**
 * Поза головы из матрицы трансформации MediaPipe (одна ось на все горизонты).
 *
 * `facialTransformationMatrixes[0].data` — 4×4 матрица трансформации головы,
 * COLUMN-MAJOR (16 float, OpenGL-порядок): элемент строки r, столбца c лежит
 * в `data[c*4 + r]`. Верхняя левая 3×3 — вращение, из неё берём углы Эйлера.
 *
 * ⚠️ ФУНДАМЕНТ ПИШЕТСЯ ОДИН РАЗ (plan.md §5.2). В этапе 7 матрица уже
 * запрашивается (`outputFacialTransformationMatrixes:true`) и кладётся в
 * `latestRef.matrix`, но пока НЕ потребляется — чтение бесплатно. Одна честная
 * ось позы (yaw) заменит носовой суррогат squash в этапе 14 (2.5D-проекция),
 * дальше та же ось ведёт GLB (этап 15). Второй экстрактор позы не заводить.
 *
 * Точная привязка «какая ось — yaw, какая — pitch» в системе координат
 * MediaPipe уточняется на живом видео там, где поза ВПЕРВЫЕ правит проекцию
 * (этап 14); здесь — корректная, устойчивая к вырождению декомпозиция.
 */

export type HeadPose = {
  /** Поворот влево/вправо (рад). Основная ось: ведёт перспективное сжатие линз. */
  yaw: number;
  /** Наклон вверх/вниз (рад). */
  pitch: number;
  /** Крен головы к плечу (рад). */
  roll: number;
};

export function poseFromMatrix(
  data: Float32Array | number[] | null | undefined,
): HeadPose | null {
  if (!data || data.length < 16) return null;

  // Вращение R[r][c] = data[c*4 + r] (column-major). Берём только элементы,
  // которые участвуют в углах Тейта—Брайана ниже; r01=data[4] и r02=data[8]
  // в этой декомпозиции не нужны.
  const r00 = data[0];
  const r10 = data[1];
  const r20 = data[2];
  const r11 = data[5];
  const r21 = data[6];
  const r12 = data[9];
  const r22 = data[10];

  // Матрица может прийти с NaN на неустойчивом кадре — не отдаём мусор.
  if (
    !Number.isFinite(r00) ||
    !Number.isFinite(r10) ||
    !Number.isFinite(r20) ||
    !Number.isFinite(r21) ||
    !Number.isFinite(r22) ||
    !Number.isFinite(r11) ||
    !Number.isFinite(r12)
  ) {
    return null;
  }

  // Углы Тейта—Брайана (Y-yaw · X-pitch · Z-roll) с защитой от гимбал-лока.
  const sy = Math.hypot(r00, r10);
  if (sy < 1e-6) {
    return {
      yaw: Math.atan2(-r20, sy),
      pitch: Math.atan2(-r12, r11),
      roll: 0,
    };
  }
  return {
    yaw: Math.atan2(-r20, sy),
    pitch: Math.atan2(r21, r22),
    roll: Math.atan2(r10, r00),
  };
}

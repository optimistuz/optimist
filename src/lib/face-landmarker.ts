import type {
  FaceLandmarker,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

/* ------------------------------------------------------------------
   Ленивый singleton Face Landmarker (MediaPipe Tasks Vision, WASM).

   Пакет тянется ДИНАМИЧЕСКИ — `import("@mediapipe/tasks-vision")` внутри
   функции, не на верхнем уровне: тяжёлый wasm-бандл не попадает в стартовый
   бандл «/» и грузится только когда пользователь нажал «Включить камеру».
   `import type` выше стирается компилятором — рантайм-зависимости от пакета
   на верхнем уровне нет.

   Ассеты — со СВОЕГО домена (приватность + сетевой фильтр среды):
   FilesetResolver грузит wasm из /mediapipe/wasm, модель — /mediapipe.
   GPU delegate, при ошибке — CPU-фолбэк.
   ------------------------------------------------------------------ */

export type { FaceLandmarkerResult };

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function build(): Promise<FaceLandmarker> {
  const vision = await import("@mediapipe/tasks-vision");
  const { FilesetResolver, FaceLandmarker } = vision;
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);

  const common = {
    runningMode: "VIDEO" as const,
    numFaces: 1,
    // Нужна матрица трансформации головы — по ней отбраковываем
    // наклонённые/повёрнутые кадры (Блок 3.3). Блендшейпы не нужны.
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  };

  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "GPU" },
      ...common,
    });
  } catch {
    // GPU-делегат не завёлся (нет WebGL / драйвер) — честный CPU-фолбэк.
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
      ...common,
    });
  }
}

/**
 * Возвращает singleton-промис лэндмаркера. При ошибке сбрасывает промис,
 * чтобы следующий вызов мог попробовать снова (фолбэк вызывающего — квиз).
 */
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = build().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/** Полностью освободить модель (память). Кадры/ландмарки чистятся отдельно
    в компоненте — здесь только закрытие самого рантайма. */
export function disposeFaceLandmarker(): void {
  if (!landmarkerPromise) return;
  const p = landmarkerPromise;
  landmarkerPromise = null;
  p.then((lm) => {
    try {
      lm.close();
    } catch {
      /* уже закрыт — молча */
    }
  }).catch(() => {
    /* промис и так упал — нечего закрывать */
  });
}

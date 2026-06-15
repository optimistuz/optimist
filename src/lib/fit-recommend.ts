import { fitResult } from "@/content/home";

/* ------------------------------------------------------------------
   Карта рекомендаций «Подбора» — ОБЩАЯ для квиза и подбора по лицу.
   Вынесена из fit-quiz.tsx без изменения логики (зеро-регресс квиза).

   // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ до публикации (правило опереченья)
   Драфт техлида: связь формы лица и характера оправы с направлениями
   подбора. Не публиковать без проверки специалистами.
   ------------------------------------------------------------------ */

/** Силуэты-примерки оверлея (чертёж на лице) — чипсы переключения. */
export type FrameKind =
  | "round"
  | "oval"
  | "rectangle"
  | "square"
  | "clubmaster"
  | "aviator"
  | "catEye"
  | "geometric";

export type Recommendation = {
  headline: string;
  directions: { name: string; why: string }[];
  sun: boolean;
  code: string;
};

/* ---- Квиз: «форма лица × характер» (логика 1:1 со старым fit-quiz) ---- */
const FACE_DIR: Record<string, string | null> = {
  oval: null, // почти всё идёт — ведём по характеру (шаг 3)
  round: "rectangular",
  square: "softRound",
  heart: "aviator",
  long: "oversized",
  diamond: "softRound", // ромб: мягкие круглые/овальные уравновешивают скулы
};
const CHAR_DIR: Record<string, string> = {
  subtle: "thinMetal",
  bold: "boldAcetate",
  classic: "clubmaster",
};

export function recommend(
  face: string,
  use: string,
  character: string
): Recommendation {
  // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ до публикации (правило опереченья)
  const keys: string[] = [];
  if (face === "oval") {
    if (character === "subtle") keys.push("thinMetal", "rimless");
    else if (character === "bold") keys.push("boldAcetate");
    else keys.push("clubmaster", "roundMetal");
  } else {
    const faceKey = FACE_DIR[face];
    const charKey = CHAR_DIR[character];
    if (faceKey) keys.push(faceKey);
    if (charKey && charKey !== faceKey) keys.push(charKey);
  }
  const uniq = Array.from(new Set(keys)).slice(0, 2);
  const directions = uniq.map((k) => fitResult.directions[k]).filter(Boolean);
  return {
    headline: fitResult.faceHeadline[face] ?? "",
    directions,
    sun: use === "sun" || use === "both",
    code: uniq.join("+"),
  };
}

/* ---- Камера: рекомендация ТОЛЬКО по форме лица (характер не спрашиваем).
       1–2 силуэта из общего каталога направлений.
       // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ до публикации ---- */
const FACE_FRAMES: Record<string, string[]> = {
  oval: ["clubmaster", "thinMetal"],
  round: ["rectangular", "boldAcetate"],
  square: ["softRound", "roundMetal"],
  heart: ["aviator", "thinMetal"],
  long: ["oversized", "boldAcetate"],
  diamond: ["softRound", "rimless"],
};

export function recommendByFace(face: string): Recommendation {
  const keys = (FACE_FRAMES[face] ?? FACE_FRAMES.oval).slice(0, 2);
  const directions = keys.map((k) => fitResult.directions[k]).filter(Boolean);
  return {
    headline: fitResult.faceHeadline[face] ?? "",
    directions,
    sun: false,
    code: keys.join("+"),
  };
}

/* ---- Силуэт-примерка по умолчанию для определённой формы лица.
       // ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ до публикации ---- */
const FACE_OVERLAY: Record<string, FrameKind> = {
  oval: "clubmaster",
  round: "rectangle", // угловатость уравновешивает мягкость круга
  square: "round", // округлость смягчает углы
  heart: "aviator", // лёгкий низ уводит вес от лба
  long: "square", // ширина и структура укорачивают лицо
  diamond: "catEye", // акцент сверху балансирует скулы
};

export function overlayForFace(face: string): FrameKind {
  return FACE_OVERLAY[face] ?? "clubmaster";
}

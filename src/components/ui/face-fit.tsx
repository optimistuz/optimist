"use client";

import { useState } from "react";
import { FaceConsent } from "@/components/ui/face-consent";
import { FaceCamera } from "@/components/ui/face-camera";

/* ------------------------------------------------------------------
   Подбор по лицу — координатор камера-пути. Клиентский компонент,
   подключается через next/dynamic { ssr: false } из секции «Подбор»:
   MediaPipe/getUserMedia не должны исполняться при SSR/сборке.

   Этапы: consent → camera (детекция → скан → результат). Любая
   деградация и «Лучше три вопроса» уводят на квиз (onUseQuiz).
   ------------------------------------------------------------------ */

type Stage = "consent" | "camera";

export default function FaceFit({
  reduce,
  onUseQuiz,
  onExitToChoice,
}: {
  reduce: boolean;
  onUseQuiz: () => void;
  onExitToChoice: () => void;
}) {
  const [stage, setStage] = useState<Stage>("consent");

  if (stage === "consent") {
    return (
      <FaceConsent
        reduce={reduce}
        onEnable={() => setStage("camera")}
        onDecline={onUseQuiz}
        onBack={onExitToChoice}
      />
    );
  }

  return (
    <FaceCamera reduce={reduce} onUseQuiz={onUseQuiz} onStop={onExitToChoice} />
  );
}

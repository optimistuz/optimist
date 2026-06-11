import type { Metadata } from "next";
import NotFoundScene from "@/components/not-found-scene";

export const metadata: Metadata = {
  title: "Страница не найдена",
  robots: { index: false, follow: false },
};

/**
 * 404 — единственная страница сайта с игровым тоном:
 * «op»-очки следят зрачками за курсором. Шапка и подвал — из layout.
 */
export default function NotFound() {
  return <NotFoundScene />;
}

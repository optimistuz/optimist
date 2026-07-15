/** Два разных цвета под одним кодом: менеджер не поймёт, какой отложить,
 *  а React получит дублирующийся ключ. */
import { validFrame } from "./base.mjs";
export const expect = /дубль кода цвета/;
export const frames = [validFrame({ colors: [
  { code: "blk", name: "чёрный", hex: "#1a1a1a", photos: ["front"] },
  { code: "blk", name: "гавана", hex: "#6b4423", photos: ["front"] },
] })];

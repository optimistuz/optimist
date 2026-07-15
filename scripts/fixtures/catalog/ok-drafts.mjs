/** Черновики без кадров — ГОДНЫ: артикул заводится с полки салона до съёмки.
 *  Если гейт уронит это, каталог нельзя будет наполнить, пока не соберут студию. */
import { validFrame } from "./base.mjs";

export const frames = [
  validFrame(),
  validFrame({ id: "op-9002", slug: "test-frame-two", size: { lens: 48, bridge: 20, temple: 135, totalWidth: 128 }, widthStep: 1 }),
];

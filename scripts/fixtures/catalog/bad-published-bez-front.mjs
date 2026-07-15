/** published с одним лишь макро: карточка каталога, LCP-элемент и OG-картинка
 *  ведут в 404 — оправа выехала бы в выдачу с битой обложкой. */
import { validFrame } from "./base.mjs";
export const expect = /front/;
export const frames = [validFrame({ status: "published", photoSet: ["macro-1"], colors: [{ code: "blk", name: "чёрный", hex: "#1a1a1a", photos: ["macro-1"] }] })];

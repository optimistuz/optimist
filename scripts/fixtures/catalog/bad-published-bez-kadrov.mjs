/** published с пустым photoSet — карточка вышла бы к клиенту пустой. */
import { validFrame } from "./base.mjs";

export const expect = /без своих кадров|хотя бы один кадр/;
export const frames = [validFrame({ status: "published", photoSet: [], colors: [{ code: "blk", name: "чёрный", hex: "#1a1a1a", photos: ["front"] }] })];

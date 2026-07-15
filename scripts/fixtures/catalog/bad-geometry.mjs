/** Линза 62 + переносица 24 дают костяк 148 мм, а объявлено 128: такой оправы
 *  не бывает физически. Каждое число по отдельности «в диапазоне». */
import { validFrame } from "./base.mjs";
export const expect = /геометри/;
export const frames = [validFrame({ size: { lens: 62, bridge: 24, temple: 140, totalWidth: 128 }, widthStep: 1 })];

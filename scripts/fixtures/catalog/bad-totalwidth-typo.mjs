/** Опечатка «138» → «13». Ступень честно пересчитана в 1, поэтому старый гейт
 *  говорил «годен», а бейдж «ваша ширина» — тот, что мы публикуем как ГЕОМЕТРИЮ
 *  без подписи врача, — врал о геометрии. */
import { validFrame } from "./base.mjs";
export const expect = /totalWidth|геометри/;
export const frames = [validFrame({ size: { lens: 52, bridge: 18, temple: 140, totalWidth: 13 }, widthStep: 1 })];

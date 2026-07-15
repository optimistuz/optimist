/** Миллиметры поправили, ступень забыли — бейдж «ваша ширина» начал врать
 *  о ГЕОМЕТРИИ, там, где мы обещали точность. */
import { validFrame } from "./base.mjs";

export const expect = /ступень/;
export const frames = [validFrame({ widthStep: 5 })];

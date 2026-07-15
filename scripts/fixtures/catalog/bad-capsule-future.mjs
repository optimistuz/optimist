/** Дата в будущем делала бы дефицит вечно свежим: «обновлено» завтра. */
import { validFrame } from "./base.mjs";
export const expect = /будущем/;
export const frames = [validFrame({ capsule: { name: "Капсула", edition: 30, left: 7, teaser: "live", updatedAt: "2030-01-01" } })];

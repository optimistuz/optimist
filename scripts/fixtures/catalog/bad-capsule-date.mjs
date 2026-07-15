/** 2026-13-45 — такой даты нет. Regex её пропускал, Date.parse давал NaN,
 *  валидатор молча делал continue: ПРОТУХАНИЕ ОСТАТКА СНИМАЛОСЬ ОПЕЧАТКОЙ. */
import { validFrame } from "./base.mjs";
export const expect = /календар|дата/;
export const frames = [validFrame({ capsule: { name: "Капсула", edition: 30, left: 7, teaser: "live", updatedAt: "2026-13-45" } })];

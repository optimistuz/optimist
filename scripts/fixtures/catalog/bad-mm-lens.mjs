/** Линза 70 мм — это не редкая оправа, это опечатка в таблице. */
import { validFrame } from "./base.mjs";

export const expect = /мм/;
export const frames = [validFrame({ size: { lens: 70, bridge: 18, temple: 140, totalWidth: 138 } })];

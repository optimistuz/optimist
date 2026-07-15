/** Дубль slug — две оправы на одном URL: одна исчезнет из выдачи молча. */
import { validFrame } from "./base.mjs";

export const expect = /дубль slug/;
export const frames = [validFrame(), validFrame({ id: "op-9002" })];

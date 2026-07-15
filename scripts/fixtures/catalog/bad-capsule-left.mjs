/** «Осталось 40 из 30» — дефицит, который не сходится сам с собой. */
import { validFrame } from "./base.mjs";
export const expect = /остаток больше тиража/;
export const frames = [validFrame({ capsule: { name: "Капсула", edition: 30, left: 40, teaser: "far", updatedAt: "2026-07-01" } })];

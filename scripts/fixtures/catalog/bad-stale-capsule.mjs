/** «Осталось 7» с датой полугодовой давности. Живой тизер на протухшем
 *  числе — не дефицит, а враньё (CLAUDE.md, «Витрина» п. 5). */
import { validFrame } from "./base.mjs";

export const expect = /враньё|дефицит|остаток/;
export const frames = [
  validFrame({
    capsule: { name: "Капсула", edition: 30, left: 7, teaser: "live", updatedAt: "2026-01-05" },
  }),
];

/** Цена без валюты: Product JSON-LD невалиден, а цифра ничего не значит. */
import { validFrame } from "./base.mjs";
export const expect = /валют/;
export const frames = [validFrame({ price: 1200000 })];

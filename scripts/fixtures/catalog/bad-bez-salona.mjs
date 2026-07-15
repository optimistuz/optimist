/** Опубликована, но не лежит ни в одном салоне: клиенту некуда за ней приехать.
 *  Сайт продаёт ВИЗИТ — оправа без салона это витрина без адреса. */
import { validFrame } from "./base.mjs";
export const expect = /салон/;
export const frames = [validFrame({ status: "published", availability: [] })];

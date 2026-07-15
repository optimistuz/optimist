/** published, кадры объявлены — а на диске их нет. Битый путь доедет
 *  до клиента как правда: пустая карточка вместо оправы. */
import { validFrame } from "./base.mjs";

export const expect = /нет кадра/;
export const frames = [validFrame({ status: "published" })];

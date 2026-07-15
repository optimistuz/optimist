/**
 * Схема каталога — гейт тела товара (этап 11, шаг 2).
 *
 * Тип `Frame` НЕ пишется руками: он выводится из схемы (`z.infer`). Иначе тип
 * и валидатор разошлись бы молча — ровно так, как разошлись ширина кадра
 * в коде и в реестре бюджетов (этап 10): «десктопный» набор собирался мыльным,
 * а манифест об этом лгал. Один источник — одна правда.
 *
 * ⚠️ ZOD ЖИВЁТ ТОЛЬКО ЗДЕСЬ. Этот модуль читают двое, и оба — вне браузера:
 *   1. `scripts/validate-catalog.mjs` — гейт, роняющий сборку (`prebuild`);
 *   2. серверный код витрины, если понадобится `parse` на границе.
 * Витрина импортирует помощники из `frame.ts` (без zod), а тип `Frame` —
 * ТИПОВЫМ импортом (`import type`), который стирается при сборке. Поэтому
 * в клиентский бандл не уезжает ни байта валидатора.
 */
import { z } from "zod";

import {
  COLLECTIONS,
  DIRECTIONS,
  FACE_SHAPES,
  FRAME_KINDS,
  FRAME_STATUSES,
  MM,
  SALON_IDS,
  WEB_SHOTS,
  totalWidthBounds,
  widthStepFor,
} from "./frame.ts";

const mm = (name: keyof typeof MM) =>
  z
    .number()
    .int(`${name}: миллиметры — целое число`)
    .min(MM[name].min, `${name}: ${MM[name].min}–${MM[name].max} мм (проверьте таблицу)`)
    .max(MM[name].max, `${name}: ${MM[name].min}–${MM[name].max} мм (проверьте таблицу)`);

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "цвет: HEX вида #1a1a1a — по нему рисуется кружок выбора");

/**
 * Цвет артикула.
 *
 * ⚠️ ПОЛЯ `photos` ЗДЕСЬ НЕТ — И ЭТО ГЛАВНОЕ, ЧТО НАДО ЗНАТЬ О ЦВЕТАХ.
 * Схема обещала кадры на каждый цвет, а конвейер их не публикует: и
 * `framePhotoPath(id, shot)`, и `ingest-frames.mjs` кладут кадры в
 * `public/frames/<id>/` — БЕЗ цветовой оси. Три цвета физически ссылались
 * на один файл, гейт говорил «годен», и клиент, выбравший синий, увидел бы
 * чёрную оправу и поехал за ней в салон (поймал `revizor-vitriny`).
 *
 * Схема не имеет права обещать то, чего не делает конвейер. Пока кадры
 * снимаются НА АРТИКУЛ, а не на цвет, честный ответ один: сказать, какой
 * цвет на снимках (`photoColor` у оправы) — и не притворяться, что их много.
 * Съёмка каждого цвета отдельно — это другой бюджет фотодня и решение
 * владельца, а не молчаливое допущение схемы.
 */
export const colorSchema = z.object({
  code: z.string().min(1),
  /** Потолок — чтобы строка «Оправа: …» в заявке влезла в лимит (см. ниже). */
  name: z.string().min(1).max(40, "название цвета: до 40 символов"),
  hex,
});

/**
 * Календарная дата, а НЕ «строка, похожая на дату».
 *
 * ⚠️ Первая редакция проверяла только regex — и `2026-13-45` проходил гейт.
 * Дальше `Date.parse` давал `NaN`, валидатор молча делал `continue`, и
 * протухание остатка снималось… опечаткой в дате (поймал `revizor-vitriny`).
 * Будущая дата запрещена по той же причине: `2030-01-01` делала бы дефицит
 * вечно свежим. Прибор, который можно отключить опечаткой, — не прибор.
 */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "дата вида 2026-07-14")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    // Round-trip: только так отсеиваются 2026-02-31 и 2026-13-45.
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "такой даты не существует в календаре")
  .refine(
    (s) => new Date(`${s}T00:00:00Z`).getTime() <= Date.now(),
    "дата в будущем: остаток нельзя обновить завтрашним числом — так дефицит стал бы вечно свежим",
  );

export const capsuleSchema = z
  .object({
    name: z.string().min(1),
    edition: z.number().int().positive(),
    /**
     * Честный остаток. Публикуется ТОЛЬКО по операционному «да» владельца
     * (plan.md §10 Q5); дефолт — не рендерим. Число живёт в данных и без
     * рендера: дефицит, который некому обновлять дисциплинированно, — враньё.
     */
    left: z.number().int().min(0),
    /** Ступень тизера — РУЧНОЙ статус, а не дата (CLAUDE.md, «Витрина» п. 5). */
    teaser: z.enum(["far", "near", "live"]),
    updatedAt: calendarDate,
  })
  .superRefine((capsule, ctx) => {
    if (capsule.left > capsule.edition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["left"],
        message: `осталось ${capsule.left} из ${capsule.edition} — остаток больше тиража`,
      });
    }
  });

export const frameSchema = z
  .object({
    /** Артикул `op-0142`. Он же имя папки `public/frames/<id>/`. */
    id: z.string().regex(/^op-\d{4}$/, "id: формат op-0142 (он же имя папки кадров)"),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "slug: строчная латиница, цифры и дефис — это URL"),
    /**
     * ⚠️ Потолок 60 — не вкусовщина, а ЖИВАЯ ВОРОНКА. Заявка склеивает строку
     * «Оправа: «имя» · артикул op-0142 · цвет: …», а схема `/api/booking`
     * режет строку `extras` по 160 символам. Реальное витринное имя
     * («Ray-Ban Aviator Classic Large Metal Polarized… G-15») плюс длинный
     * цвет давали 181 символ → HTTP 400 → клиент видел «не удалось отправить
     * заявку». Данные каталога, прошедшие гейт, МОЛЧА убивали отправку
     * (измерил `revizor-vitriny`). 60 + 40 + подпись строки < 160.
     */
    name: z.string().min(1).max(60, "название оправы: до 60 символов (иначе заявка не уйдёт)"),
    /** Бренд — фильтр №1 в оптике и обязательное поле Product JSON-LD. */
    brand: z.string().min(1),
    /** Текст о товаре: PDP, og:description, разметка. Без него PDP нечем наполнить. */
    description: z.string().min(1).optional(),
    collection: z.enum(COLLECTIONS),
    silhouette: z.enum(FRAME_KINDS),
    /** Поводы («город», «работа») — фильтры витрины. Словарь ЗАКРЫТ: свободная
     *  строка рассыпается в «город»/«Город»/«городской» — три фильтра по одной
     *  оправе в каждом. */
    direction: z.array(z.enum(DIRECTIONS)),
    material: z.string().min(1),
    colors: z.array(colorSchema).min(1, "у оправы должен быть хотя бы один цвет"),
    size: z.object({
      lens: mm("lens"),
      bridge: mm("bridge"),
      temple: mm("temple"),
      lensHeight: z.number().int().min(20).max(60).optional(),
      totalWidth: mm("totalWidth"),
    }),
    widthStep: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    /**
     * Карта «форма лица → идёт». ⚠️ ПРОВЕРИТЬ ОПТОМЕТРИСТАМИ: поле живёт
     * в данных, но в UI НЕ РЕНДЕРИТСЯ, пока не подписан
     * `docs/optometrist-review.md` (CLAUDE.md, «Витрина» п. 6).
     */
    fitsFaces: z.array(z.enum(FACE_SHAPES)),
    /** `null` — осознанное «цена в салоне» (дефолт §10 Q3), а не забытое поле. */
    price: z.number().int().positive().nullable().optional(),
    /** Валюта — обязательна, если есть цена: Product JSON-LD без неё невалиден. */
    currency: z.literal("UZS").optional(),
    /** Когда артикул завели: «новинки», `lastmod` в sitemap. */
    addedAt: calendarDate.optional(),
    status: z.enum(FRAME_STATUSES),
    availability: z.array(z.enum(SALON_IDS)),
    /** Кадры, реально снятые для артикула (подмножество `WEB_SHOTS`). */
    photoSet: z.array(z.enum(WEB_SHOTS)),
    /**
     * КОД ЦВЕТА, КОТОРЫЙ НА СНИМКАХ. Кадры снимаются на артикул, а не на цвет
     * (см. `colorSchema`), поэтому у оправы с тремя цветами фотографии — одного
     * из них. Молчать об этом нельзя: клиент выбрал бы синий по кружку, а увидел
     * чёрный на всех семи кадрах. Витрина обязана подписать: «на снимках —
     * чёрный матовый».
     *
     * Обязателен, когда цветов больше одного и артикул не черновик (см. ниже).
     */
    photoColor: z.string().min(1).optional(),
    /** Спин: число кадров (48). Файлы — в `public/frames/<id>/spin/`. */
    spin: z.number().int().positive().optional(),
    /** Секвенция rack-focus: число кадров в наборах (24 / 30). */
    seq: z
      .object({
        mobile: z.number().int().positive(),
        desktop: z.number().int().positive(),
      })
      .optional(),
    /** Путь к GLB. Только поле данных: кода 3D нет до санкции §10 Q2. */
    asset3d: z.string().optional(),
    capsule: capsuleSchema.optional(),
  })
  .superRefine((frame, ctx) => {
    const add = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // Ступень ширины — производная, а не мнение. Расхождение с totalWidth
    // означает: кто-то поправил миллиметры и забыл ступень, и бейдж
    // «ваша ширина» начал врать о ГЕОМЕТРИИ — там, где мы обещали точность.
    const expected = widthStepFor(frame.size.totalWidth);
    if (frame.widthStep !== expected) {
      add(
        ["widthStep"],
        `ступень ${frame.widthStep} не сходится с totalWidth ${frame.size.totalWidth} мм — должна быть ${expected}`,
      );
    }

    // Общая ширина обязана сходиться с самой оправой: две линзы + переносица.
    // «lens 62 + bridge 24 + totalWidth 128» — оправа, которой не бывает.
    const bounds = totalWidthBounds(frame.size.lens, frame.size.bridge);
    if (frame.size.totalWidth < bounds.min || frame.size.totalWidth > bounds.max) {
      add(
        ["size", "totalWidth"],
        `totalWidth ${frame.size.totalWidth} мм не сходится с геометрией: при линзе ${frame.size.lens} и переносице ${frame.size.bridge} ожидается ${bounds.min}–${bounds.max} мм`,
      );
    }

    // Цена без валюты — невалидный Product JSON-LD и цифра без смысла.
    if (typeof frame.price === "number" && !frame.currency) {
      add(["currency"], "есть цена, но нет валюты (UZS)");
    }

    // Цвета: код — ключ выбора и строка в заявке. Дубль кода = два разных
    // цвета неразличимы для менеджера и для React.
    const codes = new Set<string>();
    for (const color of frame.colors) {
      if (codes.has(color.code)) add(["colors"], `дубль кода цвета «${color.code}»`);
      codes.add(color.code);
    }

    // Цвет на снимках обязан существовать среди цветов оправы: подпись
    // «на снимках — синий», которого нет в списке, — это опечатка, ведущая
    // клиента к несуществующему товару.
    if (frame.photoColor !== undefined && !codes.has(frame.photoColor)) {
      add(
        ["photoColor"],
        `цвет снимков «${frame.photoColor}» не найден среди цветов оправы (${Array.from(codes).join(", ")})`,
      );
    }

    if (frame.status === "published") {
      // Опубликованный артикул обязан иметь свои кадры.
      if (frame.photoSet.length === 0) {
        add(
          ["photoSet"],
          "published без своих кадров. Пока кадров нет — это draft: черновик живёт в данных и не рендерится",
        );
      }

      // …и среди них ОБЯЗАН быть `front`: это карточка каталога, LCP-элемент
      // и OG-картинка. Артикул с одним лишь `macro-1` выехал бы в выдачу
      // с битой обложкой.
      if (frame.photoSet.length > 0 && !frame.photoSet.includes("front")) {
        add(["photoSet"], "published без кадра front — это карточка, LCP и OG-картинка");
      }

      // Оправа, которой нет ни в одном салоне, — это оправа, за которой
      // клиенту некуда приехать. Сайт продаёт ВИЗИТ.
      if (frame.availability.length === 0) {
        add(
          ["availability"],
          "published, но не лежит ни в одном салоне — клиенту некуда приехать за ней",
        );
      }
    }

    // Многоцветный артикул на витрине ОБЯЗАН сказать, какой цвет на снимках.
    // Иначе кружки цвета молча врут: человек выбирает синий, а все семь кадров
    // показывают чёрный. Черновик освобождён — у него ещё нет кадров вовсе.
    if (frame.status !== "draft" && frame.colors.length > 1 && !frame.photoColor) {
      add(
        ["photoColor"],
        `цветов ${frame.colors.length}, а кадры сняты на один артикул — укажите photoColor ` +
          `(какой цвет на снимках), иначе кружок цвета обещает то, чего на фото нет`,
      );
    }
  });

export type Color = z.infer<typeof colorSchema>;
export type Capsule = z.infer<typeof capsuleSchema>;
export type Frame = z.infer<typeof frameSchema>;

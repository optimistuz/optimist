# REPORT — проход «Премиализация», блоки 0–7

Дата: 11.06.2026. Все блоки выполнены, ничего не откатывалось.
После каждого блока прогонялись `npx tsc --noEmit` и `npm run build` — все зелёные.

---

## Что сделано по блокам

### Блок 0 — конституция
В CLAUDE.md добавлен раздел «Дизайн-концепция: Наведение резкости»:
словарь движения (focusIn / maskLine / imageReveal), ограничения blur,
подписные эффекты, вечные запреты, правило двух красных.

### Блок 1 — гигиена
- Лента брендов: при наведении теперь пауза (`animation-play-state: paused`)
  вместо смены длительности — лента больше не прыгает.
- Токены красного: `brand` #FD0000 (графика), `brand-deep` #D40000
  (заливки кнопок, мелкий текст, AA), `brand-dark` #B80000 (hover заливок).
- Кнопка primary: заливка `brand-deep`, красная тень-свечение удалена,
  `hover:-translate-y-px` и `active:scale-[0.98]` сохранены.
- Мелкий красный текст переведён на `brand-deep`: ховеры номеров услуг,
  ховеры телефонов/почты в подвале. Display-акценты («видно», «видеть»)
  остались `brand`.
- Lenis: создан `LenisContext` + хук `useLenis`; шапка при открытии меню
  вызывает `lenis.stop()`, при закрытии — `lenis.start()`; блокировка
  `body.overflow` оставлена как страховка для reduced-motion.
- `home.ts`: удалено мёртвое поле `span` из `collections.items`.
- `layout.tsx`: JSON-LD `Optician` — головной салон как `address`,
  3 филиала как `department`, телефоны, часы Mo–Sa 09:00–20:00 / Su 10:00–18:00.

### Блок 2 — логотип и favicon
- `logo.tsx`: prop `variant: "mark" | "full"` (default `mark`).
  В шапке — знак без подписи «САЛОН ОПТИКИ» (при 44px подпись была бы 7px),
  в подвале — полный логотип.
- `icon.png` / `apple-icon.png` подхвачены App Router: в `<head>` есть
  `rel="icon"` и `rel="apple-touch-icon"` (проверено в собранном HTML).

### Блок 3 — система движения
- `lib/motion.ts`: добавлены `focusIn`, `maskLineChild`, `imageReveal`.
- `reveal.tsx`: `Reveal` получил `variant: "fade" | "focus"` (default focus);
  новый `RevealLines` (построчная маска для заголовков, stagger 0.12);
  `RevealItem` получил prop `variants` (default fadeUp).
- Заголовки services / expertise / collections / testimonials / cta / vision /
  salons — через `RevealLines`; eyebrow и body — `Reveal` (focus);
  карточки коллекций — `imageReveal` (без blur).
- Hero: `lineChild` дополнен blur(6px)→0 — заголовок «наводится на резкость».
- Манифест: statement-абзац поднят с `text-display-md` до `text-display-lg`.

### Блок 4 — подписные элементы
- НОВАЯ секция «Зрение» (`#vision`, между Positioning и Services):
  compare-слайдер `ui/compare.tsx` — верхний слой со статическим
  blur(10px) saturate(0.9) и clip-path, drag за любое место контейнера,
  клавиатура ←/→ по 2%, `role="slider"` с aria-атрибутами,
  `touch-action: pan-y` (вертикальный скролл пальцем не ломается).
- Отзывы: editorial-перелистывание — один отзыв `text-display-md italic`,
  счётчик `01 — 03` (tabular-nums), доступные кнопки prev/next,
  AnimatePresence crossfade 0.5s, swipe на таче (порог 50px),
  reduced-motion — мгновенная смена.
- Цифры экспертизы: `text-6xl sm:text-7xl` + `tabular-nums`; счётчик на
  `useMotionValue` + `animate` + `useTransform` → ноль ререндеров на кадр.
- `ui/magnetic.tsx`: магнитная обёртка (max 6px, spring 150/15), активна
  только при `(pointer: fine)` и выключенном reduced-motion.
  Применена к primary-кнопкам hero и формы CTA. В шапке не применялась.

### Блок 5 — недостающее по ТЗ
- Форма записи в тёмной CTA (`booking-form.tsx`): двухколоночная раскладка
  на lg (текст слева, форма справа), поля Имя*/Телефон*/Услуга/Дата,
  автоформат `+998 XX XXX-XX-XX`, `min` даты = завтра (на клиенте),
  подписи над полями, ошибки под полями (`aria-invalid`/`aria-describedby`),
  ошибки после первой попытки → далее живые, состояния
  idle → submitting (1200 мс) → success (галочка тонкой линией +
  «Отправить ещё заявку»), honeypot с тихим «успехом».
- НОВАЯ секция «Салоны» (`#salons`, между Testimonials и CTA): 4 филиала
  в стилистике списка услуг (волосяные линии, адрес `font-serif text-2xl`,
  район+note, часы справа) + заглушка карты 16/9. `id="salons"` из подвала
  убран — якорь из меню/подвала ведёт на секцию.

### Блок 6 — типографика
- Подключены `Prata` (400) и `Jost` (300/400/500), оба latin+cyrillic.
- Заголовки переведены на `--font-display` (default — Cormorant);
  tailwind `serif` смотрит на переменную.
- `ui/font-switcher.tsx` — плашка слева внизу с тремя кнопками,
  подключена через условный `dynamic()` — в production-бандле кода
  переключателя НЕТ (проверено поиском по чанкам).

---

## Список изменённых/созданных файлов по блокам (для поблочных коммитов)

**Блок 0**
- `CLAUDE.md` (изменён)

**Блок 1**
- `src/app/globals.css` (изменён — marquee)
- `tailwind.config.ts` (изменён — токены brand)
- `src/components/ui/button.tsx` (изменён — заливка, без тени)
- `src/components/sections/services.tsx` (изменён — hover номера)
- `src/components/layout/footer.tsx` (изменён — hover контактов)
- `src/components/smooth-scroll.tsx` (изменён — LenisContext)
- `src/components/layout/header.tsx` (изменён — lenis stop/start)
- `src/content/home.ts` (изменён — удалено `span`)
- `src/app/layout.tsx` (изменён — JSON-LD)

**Блок 2**
- `src/components/ui/logo.tsx` (изменён — variant)
- `src/components/layout/header.tsx` (изменён — variant="mark")
- `src/components/layout/footer.tsx` (изменён — variant="full")
- `public/logo-mark-dark.png`, `public/logo-mark-light.png`,
  `src/app/icon.png`, `src/app/apple-icon.png` (добавлены владельцем,
  закоммитить вместе с блоком)

**Блок 3**
- `src/lib/motion.ts` (изменён — 3 глагола)
- `src/components/ui/reveal.tsx` (изменён — focus, RevealLines, variants)
- `src/components/sections/services.tsx` (изменён — RevealLines)
- `src/components/sections/expertise.tsx` (изменён — RevealLines)
- `src/components/sections/collections.tsx` (изменён — RevealLines, imageReveal)
- `src/components/sections/testimonials.tsx` (изменён — RevealLines)
- `src/components/sections/cta.tsx` (изменён — RevealLines)
- `src/components/sections/hero.tsx` (изменён — blur в lineChild)
- `src/components/sections/positioning.tsx` (изменён — display-lg)

**Блок 4**
- `src/content/home.ts` (изменён — `vision`)
- `src/components/ui/compare.tsx` (НОВЫЙ)
- `src/components/sections/vision.tsx` (НОВЫЙ)
- `src/app/page.tsx` (изменён — Vision)
- `src/components/sections/testimonials.tsx` (переписан — перелистывание)
- `src/components/sections/expertise.tsx` (изменён — счётчик, кегль)
- `src/components/ui/magnetic.tsx` (НОВЫЙ)
- `src/components/sections/hero.tsx` (изменён — Magnetic)

**Блок 5**
- `src/components/ui/button.tsx` (изменён — prop disabled)
- `src/components/sections/booking-form.tsx` (НОВЫЙ)
- `src/components/sections/cta.tsx` (переписан — две колонки + форма)
- `src/content/home.ts` (изменён — `salonsSection`)
- `src/components/sections/salons.tsx` (НОВЫЙ)
- `src/app/page.tsx` (изменён — Salons)
- `src/components/layout/footer.tsx` (изменён — убран id="salons")

**Блок 6**
- `src/app/layout.tsx` (изменён — Prata/Jost, dynamic FontSwitcher)
- `src/app/globals.css` (изменён — --font-display)
- `tailwind.config.ts` (изменён — serif на переменную)
- `src/components/ui/font-switcher.tsx` (НОВЫЙ)

**Блок 7**
- `REPORT.md` (НОВЫЙ)

> Файлы `home.ts`, `layout.tsx`, `page.tsx`, `button.tsx`, `footer.tsx`,
> `header.tsx`, `services.tsx`, `expertise.tsx`, `testimonials.tsx`,
> `cta.tsx`, `globals.css`, `tailwind.config.ts` правились в нескольких
> блоках — при поблочных коммитах коммить их в составе УКАЗАННОГО блока
> частями (`git add -p`) либо целиком в позднем блоке.

---

## Что пропущено/откатано и почему

Откатов нет. Не делалось (по правилам прохода — понадобится позже):
эффекты на фото (Lens/Focus Cards/Ken Burns), реальная карта, реальная
отправка формы, SVG-логотипы брендов.

Примечание: скиллы `frontend` / `ux/ui` / `taste`, упомянутые в CLAUDE.md,
в системе не установлены (нет ни в проекте, ни в `~/.claude`) — работа
велась строго по спецификации промпта и конституции дизайна.

---

## Реальные выводы проверок (блок 7)

`npx tsc --noEmit` — вывод пуст, exit code 0.

`npm run lint`:
```
> optimist@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

`npm run build`:
```
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (6/6)
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
┌ ○ /                                    13.7 kB         150 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ○ /apple-icon.png                      0 B                0 B
└ ○ /icon.png                            0 B                0 B
+ First Load JS shared by all            87.3 kB
```

Дополнительно (скрипт по собранному HTML):
- JSON-LD парсится: `type=Optician, departments=3, hours=2`;
- в HTML есть `id="vision"`, `id="salons"` (ровно один), все поля формы,
  honeypot, `role="slider"`, счётчик отзывов, `rel="icon"` /
  `rel="apple-touch-icon"`, `logo-mark-dark`;
- в prod-чанках НЕТ кода переключателя шрифтов
  (поиск `setProperty("--font-display"` по `.next/static/chunks`);
- в dev-режиме (запускался `npm run dev`) плашка переключателя рендерится.

## Чеклист самопроверки

- [x] лента брендов не прыгает при наведении (пауза);
- [x] кнопки: заливка #D40000, без цветного свечения;
- [x] мелкий красный текст — brand-deep (номера услуг, контакты в подвале);
- [x] шапка — знак без подписи; подвал — полный логотип; favicon «op»
      подхвачен (`rel="icon"` в head);
- [x] все секции появляются по словарю: маска / focus / imageReveal;
      анимируемый blur нигде не превышает 8px и не висит на изображениях
      (blur(10px) в compare — статический, по спецификации эффекта,
      не анимируется);
- [x] hero-заголовок наводится на резкость (blur 6px → 0 в маске);
- [x] секция «Зрение»: слайдер тянется мышью (pointer events + capture),
      клавиатурой (←/→ по 2%) и тачем (pan-y, тянуть за любое место);
- [x] отзывы: один quote, счётчик, стрелки, swipe на таче;
- [x] цифры статистики крупные (text-6xl/7xl), tabular-nums,
      без ререндеров на кадр (motion value → DOM напрямую);
- [x] магнитные кнопки только на desktop-указателе (pointer: fine)
      и при выключенном reduced-motion;
- [x] форма: пустая отправка → ошибки; неполный телефон → ошибка;
      валидная → «Отправляем…» 1200 мс → success; honeypot → тихий успех
      (логика проверена по коду, сценарии стоит прокликать руками);
- [x] секция «Салоны»: 4 филиала, часы, заглушка карты; якорь #salons
      один и ведёт на секцию;
- [x] переключатель шрифтов работает в dev и отсутствует в prod-бандле;
- [x] reduced-motion: все Reveal/RevealLines/счётчики/отзывы рендерятся
      статично; слайдер и форма остаются функциональными;
- [x] JSON-LD валиден (JSON.parse по собранному HTML — успех).

---

## Все TODO, оставленные в коде

| Где | Что |
| --- | --- |
| `src/content/home.ts` → `vision.heading`, `vision.body` | согласовать тексты секции «Зрение» |
| `src/content/home.ts` → `salonsSection.heading` | согласовать заголовок секции «Салоны» |
| `src/components/ui/compare.tsx` | `TODO: фото ташкентской улицы (резкое)` — заменить заглушки на фото |
| `src/components/sections/salons.tsx` | `TODO: карта — Яндекс или Google, решение владельца` |
| `src/components/sections/booking-form.tsx` → `sendBooking` | `TODO: подключить реальную отправку (Telegram-бот / e-mail / CRM)` |
| Старые TODO в `home.ts` | телефоны/почта, реальные фото, реальные отзывы, цифры экспертизы, SVG-логотипы брендов |

## Вопросы владельцу

1. **Шрифт заголовков.** Запусти `npm run dev`, открой сайт — слева внизу
   плашка «Cormorant / Prata / Jost». Клик мгновенно меняет все заголовки.
   Скажи, какой оставляем — лишние шрифты и плашку удалим.
2. **Карта.** Яндекс или Google? После решения заглушка в «Салонах»
   заменится на реальную карту.
3. **Заявки с формы.** Куда слать: Telegram-бот, e-mail или CRM?
   Сейчас отправка имитируется.
4. Тексты с пометкой TODO в `src/content/home.ts` (секции «Зрение»
   и «Салоны») — нужно согласовать формулировки.

## Как смотреть

```
npm run dev
```
Открыть http://localhost:3000. Проверить на ширине 1440px и 390px
(DevTools → device toolbar). Отдельно: эмуляция reduced-motion
(DevTools → Rendering → prefers-reduced-motion) — страница должна быть
статичной, но слайдер и форма работать.

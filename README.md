This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Как проверять (приёмка по приборам)

Приёмка на этом проекте — по скриншотам и пиксельным аудитам, не «на глаз».
Все скрипты требуют запущенного dev-сервера на `:3000` (`npm run dev`), кроме
запекания ассетов и веса сборки.

**Инструменты приёмки** (`scripts/`, запуск `node scripts/<файл>`):

- `diag-firstload.mjs` — первый заход vs рефреш, консоль и гидрация `/`.
- `cdp-audit.mjs` — пиксельный тест белой точки парящих оправ (допуск ±1).
- `cdp-whitepoint.mjs`, `cdp-hydration.mjs` — белая точка и гидрация точечно.
- `shot-site.mjs` — кадры dev-сайта (env `SHOTS`, поля `mouse`/`mobile`).
- `bake-blur.mjs` — запекание расфокуса/светов в статику (**вручную**, не в build):
  `node scripts/bake-blur.mjs blur public/photos/interior.jpg`.

**Конвейер фото-ассетов** (этап 10; dev-сервер не нужен):

- `ingest-frames.mjs` — приёмка сдачи фотографа (дерево `docs/photo-brief.md` §10)
  → `public/frames/<артикул>/`. Гейты: белая точка (весь фон, не рамка;
  gain ≤ `MaxGain` из `normalize-white.ps1`), комплектность, миллиметры, вес,
  объявленный источник кадра. Фотограф сдаёт **десять** packshot-кадров,
  на сайт уходят **семь**: `front-top`, `side-ortho`, `front-ortho` — архив
  и чертёж размеров, в веб не публикуются. Публикация лесенкой:
  `<кадр>.jpg` 1200 px (карточка, LCP) + `<кадр>@2x.jpg` 2400 px (лупа).
  Забракованный артикул следов в `public/` не оставляет.
  `node scripts/ingest-frames.mjs <дерево-сдачи>`
  `node scripts/ingest-frames.mjs --verify <файл|папка>` — приговор по белой
  точке без записи (**режим съёмочного дня**).
  `node scripts/ingest-frames.mjs --verify <папка> --expect` — **самопроверка
  гейта**: имя кадра-ловушки объявляет ожидаемый приговор (`ok-` / `brak-` /
  `nomeasure-`), расхождение роняет прогон. Проверяется ПРИБОР, а не кадры;
  гонять после любой правки `scripts/lib/white-point.mjs`.
- `build-seq.mjs` — rack-focus серия → секвенции PDP (mobile 24 / desktop 30,
  оба набора **выбираются** из одной серии, промежуточный фокус не
  интерполируется). Потолки читаются из `docs/perf-budgets.md`; при превышении
  скрипт **падает** и не оставляет полусобранную секвенцию.
  `node scripts/build-seq.mjs <rack-dir> --sku <id>`
- `make-pilot-delivery.mjs` — синтетическая «сдача» из существующих кадров,
  чтобы прогонять конвейер без фотографа. Кладёт в дерево **намеренный брак**:
  гейт доказывается падением, а не успехом. Выход пилота — в `.gitignore`.
- `normalize-white.ps1` — инструмент **съёмочного дня** (PowerShell):
  `.\scripts\normalize-white.ps1 -In кадр.jpg -Out проверка.jpg -VerifyOnly`.

**Мобильная приёмка** (обязательна для тяжёлых эффектов): Chrome DevTools →
эмуляция **390×844 + CPU throttling 4×**, прогон каждого эффекта **5+ минут**
(троттлинг разогретого телефона). Эталон аудитории — Galaxy A15/A54.

**Бюджеты веса и производительности** — `docs/perf-budgets.md` (закон; вес
first-load JS смотреть в выводе `npm run build`, Lighthouse mobile — из DevTools).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

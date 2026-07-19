/**
 * ОФСКРИН-РЕНДЕР SVG В КАНВАС — текстура линзы для чертежа Мастерской
 * (этап 5, шаг 7). Ленивый модуль: грузится вместе с линзой, в критический
 * путь «/» не попадает.
 *
 * ⚠️ ПОЧЕМУ НЕЛЬЗЯ ПРОСТО СЕРИАЛИЗОВАТЬ SVG. Чертёж красится классами
 * Tailwind через `currentColor`, а вынутый из документа SVG теряет ВЕСЬ
 * внешний CSS: линии стали бы чёрными или исчезли вовсе. Поэтому перед
 * сериализацией вычисленные свойства запекаются в атрибуты. Обход стоит
 * порядка сотни элементов и делается ОДИН раз на снимок, не в кадре.
 *
 * ⚠️ СНИМОК СТАТИЧЕН — это решение плана, а не упрощение: чертёж собирается
 * по скроллу, и живая перерисовка означала бы сериализацию SVG каждый кадр.
 * Пересъёмка — по выбору детали (и по запросу хозяина).
 */

/** Свойства, без которых чертёж теряет вид при отрыве от документа. */
const BAKED = [
  "color",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "fill-opacity",
  "opacity",
  "transform",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
] as const;

function bake(src: Element, dst: Element) {
  const cs = window.getComputedStyle(src);
  let decl = "";
  for (const prop of BAKED) {
    const v = cs.getPropertyValue(prop);
    if (v && v !== "none" && v !== "normal") decl += `${prop}:${v};`;
  }
  if (decl) dst.setAttribute("style", decl);

  const sk = src.children;
  const dk = dst.children;
  for (let i = 0; i < sk.length && i < dk.length; i += 1) bake(sk[i], dk[i]);
}

/**
 * Снимает текущий вид SVG в канвас. Возвращает канвас или null, если снимок
 * не удался — тогда хозяин обязан уйти в фолбэк, а не показать пустое стекло.
 */
export async function svgToCanvas(
  svg: SVGSVGElement,
  cssWidth: number,
  cssHeight: number,
  ratio = 1
): Promise<HTMLCanvasElement | null> {
  if (!cssWidth || !cssHeight) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  bake(svg, clone);
  // Размер обязателен: без него Firefox рисует SVG в нулевой прямоугольник.
  clone.setAttribute("width", String(cssWidth));
  clone.setAttribute("height", String(cssHeight));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" })
  );

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("SVG не отрисовался"));
      el.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cssWidth * ratio));
    canvas.height = Math.max(1, Math.round(cssHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Фон чертежа — тёплый off-white страницы: прозрачная текстура дала бы
    // под стеклом дыру вместо листа.
    ctx.fillStyle = "#F6F4EF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

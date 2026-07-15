/**
 * Годная оправа — основа ловушек гейта каталога.
 *
 * Ловушка портит РОВНО ОДНО поле и объявляет ожидаемый повод падения. Иначе
 * фикстура падала бы по трём причинам сразу и доказывала бы не тот гейт:
 * «упало» — не то же самое, что «поймало то, что должно было поймать».
 *
 * Это ТЕСТОВЫЙ артикул (`op-9001`), а не товар: в каталог он не попадает
 * никогда — фикстуры лежат вне `src/`.
 *
 * Геометрия базы: линза 52 + переносица 18 → костяк 2×52 + 18 = 122 мм,
 * допустимая общая ширина 122–142 мм. Взято 138 → ступень 3 («средняя ширина»).
 */
export function validFrame(overrides = {}) {
  return {
    id: "op-9001",
    slug: "test-frame",
    name: "Тестовая оправа",
    brand: "Optimist",
    collection: "optical",
    silhouette: "rectangle",
    direction: ["город"],
    material: "ацетат",
    colors: [{ code: "blk", name: "чёрный", hex: "#1a1a1a", photos: ["front"] }],
    size: { lens: 52, bridge: 18, temple: 140, totalWidth: 138 },
    widthStep: 3,
    fitsFaces: ["oval", "round"],
    price: null,
    status: "draft",
    availability: ["yunusabad"],
    photoSet: ["front"],
    ...overrides,
  };
}

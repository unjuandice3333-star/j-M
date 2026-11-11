// Filtros del catálogo derivados de los productos reales (no de listas fijas).
// Antes: tope de precio fijo en $400.000 (ocultaba sin aviso lo más caro), tallas,
// fits y ocasiones de listas escritas a mano o de mockData, y búsqueda sensible a tildes.

export const PRICE_STEP = 10000;
export const FIT_ORDER = ['SLIM', 'REGULAR', 'RELAXED', 'OVERSIZE'];

/** minúsculas, sin tildes ni espacios sobrantes: «Pantalón» → «pantalon». */
export function normalizeText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function searchHaystack(p) {
  return normalizeText([
    p.name, p.categoryName, p.category, p.brand, p.styleLineName, p.reference,
    p.color, ...(p.colors ?? []).map((c) => c?.name),
  ].filter(Boolean).join(' '));
}

/** Todas las palabras de la búsqueda deben aparecer (en cualquier orden) en nombre, categoría, marca, línea, referencia o color. */
export function matchesSearch(product, query) {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = searchHaystack(product);
  return tokens.every((t) => hay.includes(t));
}

/** Precio máximo del control deslizante: el precio más alto redondeado hacia arriba al paso. */
export function priceCeiling(products) {
  const max = products.reduce((m, p) => (Number.isFinite(p.price) && p.price > m ? p.price : m), 0);
  return Math.max(PRICE_STEP, Math.ceil(max / PRICE_STEP) * PRICE_STEP);
}

/** Tallas presentes en los productos, en el orden de la tabla `sizes`. */
export function sizeOptions(products) {
  const order = new Map();
  for (const p of products) {
    const variants = p.rawVariants ?? [];
    for (const v of variants) {
      if (!v.size) continue;
      const o = Number.isFinite(v.sizeOrder) ? v.sizeOrder : 0;
      order.set(v.size, Math.min(order.get(v.size) ?? Infinity, o));
    }
    for (const s of p.sizes ?? []) if (!order.has(s)) order.set(s, Infinity);
  }
  return [...order.entries()]
    .sort((a, b) => (a[1] - b[1]) || a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([s]) => s);
}

/** Fits presentes en los productos, en orden de horma. */
export function fitOptions(products) {
  const present = new Set(products.map((p) => p.fit).filter(Boolean));
  return [...FIT_ORDER.filter((f) => present.has(f)), ...[...present].filter((f) => !FIT_ORDER.includes(f)).sort()];
}

/** Ocasiones asignadas a algún producto, con el nombre de la BD. */
export function occasionOptions(products) {
  const map = new Map();
  for (const p of products) {
    for (const o of p.occasionList ?? []) {
      if (o?.slug && !map.has(o.slug)) map.set(o.slug, o.name || o.slug);
    }
  }
  return [...map.entries()].map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Aplica los filtros (intersección). `maxPrice` null = sin límite.
 * `normalizeStyle` normaliza la línea de estilo (inyectada para no acoplar con productUtils).
 */
export function filterProducts(products, f, normalizeStyle = (s) => s) {
  const style = normalizeStyle(f.styleLine ?? 'todas');
  return products.filter((p) => {
    if (p.status !== 'active') return false;
    if (f.query && !matchesSearch(p, f.query)) return false;
    if (style !== 'todas' && normalizeStyle(p.styleLine) !== style) return false;
    if (f.onlyNew && !p.isNew) return false;
    if (f.onlyBestSeller && !p.isBestSeller) return false;
    if (f.onlySale && (!p.isSale || !(p.discountPercent > 0))) return false;
    if (f.category && f.category !== 'todas' && p.category !== f.category) return false;
    if (f.fit && f.fit !== 'todos' && p.fit !== f.fit) return false;
    if (f.size && f.size !== 'todas' && !(p.sizes ?? []).includes(f.size)) return false;
    if (f.occasion && f.occasion !== 'todas' && !(p.occasions ?? []).includes(f.occasion)) return false;
    if (f.maxPrice != null && p.price > f.maxPrice) return false;
    return true;
  });
}

/** Orden estable: en empate se conserva el orden original (relevancia = orden de la BD). */
export function sortProducts(list, sortBy) {
  const cmp = {
    'precio-asc': (a, b) => a.price - b.price,
    'precio-desc': (a, b) => b.price - a.price,
    'mas-vendidos': (a, b) => (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0),
    'mejor-valorados': (a, b) => ((b.rating || 0) - (a.rating || 0)) || ((b.reviewCount || 0) - (a.reviewCount || 0)),
    nuevos: (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0),
  }[sortBy];
  return cmp ? [...list].sort(cmp) : list;
}

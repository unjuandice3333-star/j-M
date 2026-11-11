// «Completa el look»: talla y color elegidos por prenda antes de agregar el look al carrito.
// Antes se agregaba la PRIMERA variante con stock de cada prenda (p. ej. XS) sin preguntar.
import { isOneSize } from './sizeAdvice';

const stockOf = (product, color, size) =>
  (product?.rawVariants ?? []).filter((v) => (color == null || v.color === color) && (size == null || v.size === size))
    .reduce((n, v) => n + (Number(v.available) || 0), 0);

/** Colores con alguna variante disponible, en el orden de `product.colors` (y luego los que falten). */
export function colorsInStock(product) {
  const withStock = new Set((product?.rawVariants ?? []).filter((v) => v.available > 0).map((v) => v.color));
  const ordered = (product?.colors ?? []).map((c) => (typeof c === 'string' ? c : c?.name)).filter((c) => withStock.has(c));
  for (const c of withStock) if (!ordered.includes(c)) ordered.push(c);
  return ordered;
}

/** Tallas del color dado, en el orden de `product.sizes`, con su disponible (0 = agotada en ese color). */
export function sizesForColor(product, color) {
  const offered = new Set((product?.rawVariants ?? []).filter((v) => v.color === color).map((v) => v.size));
  const order = (product?.sizes ?? []).filter((s) => offered.has(s));
  for (const s of offered) if (!order.includes(s)) order.push(s);
  return order.map((size) => ({ size, available: stockOf(product, color, size) }));
}

/**
 * Selección inicial: el color por defecto del producto si tiene stock (si no, el primero con stock).
 * La talla solo se preselecciona si no hay elección real (talla única o una sola talla disponible en ese color).
 */
export function defaultLookSelection(product) {
  const colors = colorsInStock(product);
  if (colors.length === 0) return { color: null, size: null };
  const color = colors.includes(product.color) ? product.color : colors[0];
  return { color, size: autoSize(product, color) };
}

function autoSize(product, color) {
  const avail = sizesForColor(product, color).filter((s) => s.available > 0);
  return (isOneSize(product) || avail.length === 1) && avail[0] ? avail[0].size : null;
}

/** Cambiar de color conserva la talla si sigue disponible; si no, la deja sin elegir (o la única posible). */
export function changeLookColor(product, selection, color) {
  const keep = selection?.size && stockOf(product, color, selection.size) > 0 ? selection.size : null;
  return { color, size: keep ?? autoSize(product, color) };
}

/**
 * Clasifica las prendas del look según la selección.
 * @returns {{ ready: {product, size, color}[], missing: object[], soldOut: object[] }}
 */
export function resolveLookSelection(products, selections) {
  const ready = []; const missing = []; const soldOut = [];
  for (const product of products ?? []) {
    if (colorsInStock(product).length === 0) { soldOut.push(product); continue; }
    const sel = selections?.[product.id] ?? defaultLookSelection(product);
    if (!sel.color || !sel.size || stockOf(product, sel.color, sel.size) <= 0) missing.push(product);
    else ready.push({ product, size: sel.size, color: sel.color });
  }
  return { ready, missing, soldOut };
}

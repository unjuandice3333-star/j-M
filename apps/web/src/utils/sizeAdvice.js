// Ayudas de talla en la ficha de producto, según el grupo de tallas real de la categoría (`categories.size_group`).
// - one_size (accesorios): no hay talla que elegir → sin guía de medidas ni recomendador.
// - alpha (XS…XXL): guía de medidas + recomendador por estatura/peso.
// - numeric_pants / footwear: solo guía de medidas (estatura y peso no determinan la talla de cintura ni de calzado).

export const ALPHA_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const isOneSizeCode = (s) => /^(UNICA|ÚNICA|U|OS|TU)$/i.test(String(s ?? '').trim());

/** true si el producto es de talla única (por grupo de la categoría o porque su única talla es «UNICA»). */
export function isOneSize(product) {
  if (!product) return false;
  if (product.sizeGroup === 'one_size') return true;
  const sizes = product.sizes ?? [];
  return sizes.length === 1 && isOneSizeCode(sizes[0]);
}

/** Qué ayudas de talla mostrar para el producto. */
export function sizeHelpFor(product) {
  if (!product || isOneSize(product)) return { guide: false, recommender: false };
  const sizes = product.sizes ?? [];
  const allAlpha = sizes.length > 0 && sizes.every((s) => ALPHA_ORDER.includes(String(s).toUpperCase()));
  const alpha = product.sizeGroup === 'alpha' || (!['numeric_pants', 'footwear'].includes(product.sizeGroup) && allAlpha);
  return { guide: true, recommender: alpha };
}

/** Talla alfabética de referencia según estatura (cm), peso (kg) y preferencia de ajuste. */
export function baseAlphaSize({ height, weight, fit = 'normal' }) {
  let size;
  if (weight < 65 || (height > 175 && weight < 68)) size = fit === 'loose' ? 'M' : 'S';
  else if (weight <= 78) size = fit === 'fitted' ? 'S' : fit === 'loose' ? 'L' : 'M';
  else if (weight <= 88) size = fit === 'fitted' ? 'M' : fit === 'loose' ? 'XL' : 'L';
  else size = fit === 'fitted' ? 'L' : 'XL';
  return size;
}

/**
 * Recomendación ajustada a las tallas que el producto ofrece de verdad y a su stock.
 * Si la talla de referencia no existe en el producto, se propone la más cercana (y se dice).
 * Devuelve null si el producto no ofrece tallas alfabéticas.
 */
export function recommendSize(product, input) {
  const offered = (product?.sizes ?? []).map((s) => String(s).toUpperCase()).filter((s) => ALPHA_ORDER.includes(s));
  if (offered.length === 0) return null;
  const base = baseAlphaSize(input);
  const baseIdx = ALPHA_ORDER.indexOf(base);
  // La más cercana; ante empate, la más grande (una prenda algo holgada es preferible a una que no entra).
  const size = [...offered].sort((a, b) => {
    const da = Math.abs(ALPHA_ORDER.indexOf(a) - baseIdx);
    const db = Math.abs(ALPHA_ORDER.indexOf(b) - baseIdx);
    return da - db || ALPHA_ORDER.indexOf(b) - ALPHA_ORDER.indexOf(a);
  })[0];
  const variants = (product.rawVariants ?? []).filter((v) => String(v.size).toUpperCase() === size);
  const availableColors = variants.filter((v) => v.available > 0).map((v) => v.color).filter(Boolean);
  return {
    size,
    base,
    exact: size === base,
    inStock: availableColors.length > 0,
    availableColors: [...new Set(availableColors)],
  };
}

/** Texto explicativo honesto (sin estadísticas inventadas). */
export function explainRecommendation(rec, { height, weight, fit = 'normal' }) {
  const fitLabel = fit === 'fitted' ? 'entallado' : fit === 'loose' ? 'holgado' : 'estándar';
  let text = `Según tu estatura de ${height} cm, tu peso de ${weight} kg y tu preferencia de ajuste ${fitLabel}, te sugerimos la talla ${rec.size}.`;
  if (!rec.exact) text += ` Por tus medidas te correspondería la ${rec.base}, que este producto no ofrece; la ${rec.size} es la más cercana.`;
  text += rec.inStock
    ? ` Disponible en: ${rec.availableColors.join(', ')}.`
    : ' Ahora mismo está agotada en todos los colores.';
  text += ' Es una orientación: confirma con la guía de medidas.';
  return text;
}

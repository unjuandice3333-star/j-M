// Contenido editorial de las guías de tallas y fits (medidas de referencia de J&M).
// Antes vivía en data/mockData.js junto a productos y reseñas simulados que ya no usaba ninguna página.

export const SIZE_CHART = {
  camisetas: [
    { size: 'S', chest: '92 - 97 cm', waist: '76 - 81 cm', length: '70 cm' },
    { size: 'M', chest: '98 - 103 cm', waist: '82 - 87 cm', length: '72 cm' },
    { size: 'L', chest: '104 - 109 cm', waist: '88 - 93 cm', length: '74 cm' },
    { size: 'XL', chest: '110 - 115 cm', waist: '94 - 99 cm', length: '76 cm' },
    { size: 'XXL', chest: '116 - 122 cm', waist: '100 - 105 cm', length: '78 cm' }
  ],
  camisas: [
    { size: 'S', chest: '94 - 98 cm', collar: '38 cm', sleeve: '64 cm' },
    { size: 'M', chest: '99 - 104 cm', collar: '40 cm', sleeve: '65 cm' },
    { size: 'L', chest: '105 - 110 cm', collar: '42 cm', sleeve: '66 cm' },
    { size: 'XL', chest: '111 - 116 cm', collar: '44 cm', sleeve: '67 cm' }
  ],
  jeans: [
    { size: '30', waist: '76 - 79 cm', hip: '92 - 95 cm', length: '102 cm' },
    { size: '32', waist: '81 - 84 cm', hip: '97 - 100 cm', length: '104 cm' },
    { size: '34', waist: '86 - 89 cm', hip: '102 - 105 cm', length: '105 cm' },
    { size: '36', waist: '91 - 94 cm', hip: '107 - 110 cm', length: '106 cm' }
  ],
  calzado: [
    { size: '38', footLength: '24.5 cm', us: '7' },
    { size: '39', footLength: '25.0 cm', us: '7.5' },
    { size: '40', footLength: '25.8 cm', us: '8.5' },
    { size: '41', footLength: '26.5 cm', us: '9.5' },
    { size: '42', footLength: '27.2 cm', us: '10' },
    { size: '43', footLength: '28.0 cm', us: '11' }
  ]
};

export const FITS_INFO = [
  {
    name: 'SLIM',
    tagline: 'Entallado moderno y silueta limpia',
    description: 'Sigue la forma del cuerpo estrechándose en tórax, brazos o piernas sin restringir el movimiento.',
    recommendedFor: 'Hombres que prefieren un look ajustado y pulido.'
  },
  {
    name: 'REGULAR',
    tagline: 'El equilibrio clásico atemporal',
    description: 'Corte tradicional rectilíneo que otorga holgura natural y confort durante todo el día.',
    recommendedFor: 'Ideal para todo tipo de cuerpo y uso versátil.'
  },
  {
    name: 'RELAXED',
    tagline: 'Frescura, amplitud y caída ligera',
    description: 'Ligeramente más amplio en hombros, pecho y muslos para un aire relajado y desenfadado.',
    recommendedFor: 'Quienes buscan máxima soltura y movilidad en clima templado/cálido.'
  },
  {
    name: 'OVERSIZE',
    tagline: 'Silueta urbana vanguardista',
    description: 'Corte amplio intencional con hombros caídos y volumen holgado de alta moda masculina.',
    recommendedFor: 'Amantes del streetwear contemporáneo y confort holgado.'
  }
];

export const SIZE_CHART_TABS = ['camisetas', 'camisas', 'jeans', 'calzado'];

// Categorías de la BD (slug y size_group de `categories`) → tabla de medidas que les corresponde.
const SLUG_TO_TAB = {
  camisetas: 'camisetas', polos: 'camisetas', chaquetas: 'camisetas',
  camisas: 'camisas',
  jeans: 'jeans', pantalones: 'jeans', bermudas: 'jeans',
  calzado: 'calzado',
};
const GROUP_TO_TAB = { alpha: 'camisetas', numeric_pants: 'jeans', footwear: 'calzado' };

/** Pestaña de la guía de medidas para una categoría (slug) o grupo de tallas; 'camisetas' si no se reconoce. */
export function sizeChartTabFor(category, sizeGroup) {
  const slug = typeof category === 'string' ? category.trim().toLowerCase() : '';
  if (SLUG_TO_TAB[slug]) return SLUG_TO_TAB[slug];
  if (GROUP_TO_TAB[sizeGroup]) return GROUP_TO_TAB[sizeGroup];
  return 'camisetas';
}

/**
 * Herramientas de talla que tienen sentido para un grupo de tallas de la BD:
 * - alpha (S–XXL): guía de medidas y recomendador por estatura/peso.
 * - numeric_pants / footwear: solo guía (el recomendador calcula tallas alfa, no 30–36 ni 38–43).
 * - one_size: ninguna (accesorios de talla única; antes mostraban la tabla de camisetas).
 * Grupo desconocido o ausente: ambas, como antes.
 */
export function sizeToolsFor(sizeGroup) {
  if (sizeGroup === 'one_size') return { guide: false, recommender: false };
  if (sizeGroup === 'numeric_pants' || sizeGroup === 'footwear') return { guide: true, recommender: false };
  return { guide: true, recommender: true };
}

const ALPHA_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/**
 * Talla alfa orientativa a partir de estatura (cm), peso (kg) y preferencia de ajuste
 * ('fitted' | 'normal' | 'loose'). Misma regla que usaba el modal, ahora pura y probada.
 */
export function recommendAlphaSize({ height, weight, fit = 'normal' }) {
  const h = Number(height);
  const w = Number(weight);
  if (!Number.isFinite(h) || !Number.isFinite(w)) return null;
  if (w < 65 || (h > 175 && w < 68)) return fit === 'loose' ? 'M' : 'S';
  if (w <= 78) return fit === 'fitted' ? 'S' : fit === 'loose' ? 'L' : 'M';
  if (w <= 88) return fit === 'fitted' ? 'M' : fit === 'loose' ? 'XL' : 'L';
  return fit === 'fitted' ? 'L' : 'XL';
}

/**
 * Disponibilidad de la talla recomendada en el producto (variantes reales con stock).
 * Devuelve { offered, inStock, alternative } — `alternative` es la talla alfa más cercana con stock.
 */
export function recommendedSizeAvailability(product, size) {
  const variants = Array.isArray(product?.rawVariants) ? product.rawVariants : [];
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const offered = sizes.includes(size);
  const inStockSizes = new Set(variants.filter((v) => v.available > 0).map((v) => v.size));
  const inStock = inStockSizes.has(size);
  let alternative = null;
  if (!inStock) {
    const idx = ALPHA_ORDER.indexOf(size);
    const candidates = [...inStockSizes].filter((s) => ALPHA_ORDER.includes(s))
      .sort((a, b) => Math.abs(ALPHA_ORDER.indexOf(a) - idx) - Math.abs(ALPHA_ORDER.indexOf(b) - idx)
        || ALPHA_ORDER.indexOf(b) - ALPHA_ORDER.indexOf(a));
    alternative = idx >= 0 ? candidates[0] ?? null : null;
  }
  return { offered, inStock, alternative };
}

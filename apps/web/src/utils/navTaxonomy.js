// Menú de la cabecera (escritorio y móvil) a partir de las tablas reales `style_lines` y `categories`.
// Antes estaba escrito a mano: líneas y subcategorías fijas que no seguían los nombres del admin, una categoría
// desactivada seguía en el menú y una nueva nunca aparecía. Las rutas son las de AppRoutes:
// `/linea/:slug`, `/calzado`, `/accesorios` y `/ropa/:slug` para el resto de categorías.

import { FALLBACK_TAXONOMY } from './homeTaxonomy';

// Categorías con ruta propia de primer nivel (CatalogPage las trata aparte de `/ropa`).
const TOP_LEVEL = ['calzado', 'accesorios'];

// Respaldo si la BD no responde: el menú de siempre (incluye Calzado, que la portada no muestra sin productos).
const FALLBACK_CATEGORIES = [
  ...FALLBACK_TAXONOMY.categories.filter((c) => c.slug !== 'accesorios'),
  { slug: 'calzado', name: 'Calzado', parent_id: null },
  { slug: 'accesorios', name: 'Accesorios', parent_id: null },
];

const upper = (s) => String(s ?? '').toLocaleUpperCase('es-CO');

/**
 * @param {{categories?: object[], styleLines?: object[]} | null} taxonomy filas de la BD (null: respaldo).
 * @returns {{styleLines: {slug,label,to}[], clothing: {slug,name,to}[], topLevel: {slug,label,to}[]}}
 */
export function buildNavTaxonomy(taxonomy) {
  const db = taxonomy && Array.isArray(taxonomy.categories) && Array.isArray(taxonomy.styleLines);
  const styleRows = db ? taxonomy.styleLines : FALLBACK_TAXONOMY.styleLines;
  const categoryRows = db ? taxonomy.categories : FALLBACK_CATEGORIES;
  const keep = (rows) => rows.filter((r) => r?.slug && r.is_active !== false);

  const styleLines = keep(styleRows).map((r) => ({ slug: r.slug, label: upper(r.name || r.slug), to: `/linea/${r.slug}` }));
  const roots = keep(categoryRows).filter((r) => !r.parent_id);
  const clothing = roots.filter((r) => !TOP_LEVEL.includes(r.slug))
    .map((r) => ({ slug: r.slug, name: r.name || r.slug, to: `/ropa/${r.slug}` }));
  const topLevel = TOP_LEVEL.map((slug) => roots.find((r) => r.slug === slug)).filter(Boolean)
    .map((r) => ({ slug: r.slug, label: upper(r.name || r.slug), to: `/${r.slug}` }));

  return { styleLines, clothing, topLevel };
}

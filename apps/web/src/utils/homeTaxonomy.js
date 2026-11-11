// Secciones de navegación de la portada (líneas de estilo, categorías y ocasiones) construidas a partir de las
// tablas reales `style_lines`, `categories` y `occasions` y de los productos activos cargados. Antes salían de
// `mockData` (conteos inventados, sin la categoría «Calzado» de la BD, nombres y textos que el admin no podía
// cambiar). Las fotos del diseño se conservan solo como respaldo visual por slug.

import { normalizeStyleLine } from './productUtils';

// Fotos del diseño original (respaldo cuando ni el admin ni la BD definen una imagen).
const DESIGN_IMAGES = {
  category: {
    camisetas: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=800',
    camisas: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&q=80&w=800',
    polos: 'https://images.unsplash.com/photo-1626557981101-aae6f84aa6ff?auto=format&fit=crop&q=80&w=800',
    jeans: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=800',
    pantalones: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&q=80&w=800',
    bermudas: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&q=80&w=800',
    chaquetas: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800',
    accesorios: 'https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&q=80&w=800',
  },
  occasion: {
    trabajo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=800',
    cita: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=800',
    casual: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=800',
    fiesta: 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?auto=format&fit=crop&q=80&w=800',
    'fin-de-semana': 'https://images.unsplash.com/photo-1488161628813-04466f872be2?auto=format&fit=crop&q=80&w=800',
    streetwear: 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?auto=format&fit=crop&q=80&w=800',
  },
  style: {
    urbana: 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&q=80&w=1000',
    elegante: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=1000',
    casual: 'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?auto=format&fit=crop&q=80&w=1000',
  },
};

// Respaldo cuando la BD no responde (p. ej. esquema heredado en QA): mismos slugs y textos que la semilla de la
// línea base M24, para que los enlaces sigan llevando a rutas válidas del catálogo.
export const FALLBACK_TAXONOMY = {
  styleLines: [
    { slug: 'urbana', name: 'Urbana', tagline: 'Actitud, comodidad y carácter.', description: 'Denim, oversize y esenciales para un estilo urbano contemporáneo.', badge: 'ESTILO URBANO' },
    { slug: 'elegante', name: 'Elegante', tagline: 'Presencia para cada ocasión.', description: 'Prendas refinadas para un estilo elegante y sofisticado.', badge: 'OFICINA & FORMAL' },
    { slug: 'casual', name: 'Smart Casual', tagline: 'Equilibrio entre estilo y comodidad.', description: 'Looks versátiles que combinan elegancia y frescura.', badge: 'CASUAL ELEGANTE' },
  ],
  categories: ['camisetas', 'camisas', 'polos', 'jeans', 'pantalones', 'bermudas', 'chaquetas', 'accesorios']
    .map((slug) => ({ slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), parent_id: null })),
  occasions: [
    { slug: 'trabajo', name: 'Trabajo & oficina', subtitle: 'Presencia sin perder comodidad.' },
    { slug: 'cita', name: 'Cita & salidas', subtitle: 'Tu mejor versión empieza aquí.' },
    { slug: 'casual', name: 'Casual urbano', subtitle: 'Estilo para todos los días.' },
    { slug: 'fiesta', name: 'Noche & eventos', subtitle: 'Destaca cuando importa.' },
    { slug: 'fin-de-semana', name: 'Fin de semana', subtitle: 'Comodidad con actitud.' },
    { slug: 'streetwear', name: 'Streetwear', subtitle: 'Actitud que se lleva puesta.' },
  ],
};

// Claves de `site_content` que usa la página «Imágenes editoriales» del admin. Antes la portada buscaba
// `style_casual` y el admin guardaba `style_smart_casual`: la foto elegida para Smart Casual nunca aparecía.
const OCCASION_KEYS = {
  trabajo: 'occasion_trabajo_oficina', cita: 'occasion_cita_salidas', casual: 'occasion_casual_urbano',
  fiesta: 'occasion_noche_eventos', 'fin-de-semana': 'occasion_fin_semana', streetwear: 'occasion_streetwear',
};
const underscore = (slug) => String(slug).replace(/-/g, '_');
export const styleImageKey = (slug) => (slug === 'casual' ? 'style_smart_casual' : `style_${underscore(slug)}`);
export const categoryImageKey = (slug) => `category_${underscore(slug)}`;
export const occasionImageKey = (slug) => OCCASION_KEYS[slug] ?? `occasion_${underscore(slug)}`;

const isActiveProduct = (p) => p && p.status !== 'borrador' && p.status !== 'archivado' && p.status !== 'draft' && p.status !== 'archived';
const firstImage = (list) => list.map((p) => p.images?.[0]).find(Boolean) ?? null;

// Prioridad de imagen: la elegida por el admin (site_content) > image_url de la tabla > foto del diseño >
// primera foto de un producto de esa sección > ninguna (SafeImage muestra su marcador).
function pickImage(editorial, key, row, designUrl, sectionProducts) {
  return editorial?.[key] || row.image_url || designUrl || firstImage(sectionProducts) || null;
}

/**
 * @param {{categories?: object[], styleLines?: object[], occasions?: object[]} | null} taxonomy filas de la BD
 *   (null mientras carga o si falló: se usa FALLBACK_TAXONOMY).
 * @param {object[]} products productos normalizados (productService).
 * @param {Record<string,string>} editorial imágenes personalizadas por clave de site_content.
 * Con productos cargados se ocultan las secciones sin ningún producto activo (enlaces a páginas vacías).
 */
export function buildHomeTaxonomy(taxonomy, products = [], editorial = {}) {
  const source = taxonomy ?? FALLBACK_TAXONOMY;
  const active = (products ?? []).filter(isActiveProduct);
  const known = active.length > 0;
  const byField = (field, slug) => active.filter((p) => (field === 'occasions' ? (p.occasions ?? []).includes(slug) : p[field] === slug));
  const keep = (rows) => (rows ?? []).filter((r) => r?.slug && r.is_active !== false);

  const styleLines = keep(source.styleLines).map((row) => {
    const items = active.filter((p) => p.styleLine === normalizeStyleLine(row.slug));
    return {
      slug: row.slug, name: row.name, tagline: row.tagline || '', description: row.description || '', badge: row.badge || '',
      count: items.length, image: pickImage(editorial, styleImageKey(row.slug), row, DESIGN_IMAGES.style[row.slug], items),
    };
  }).filter((l) => !known || l.count > 0);

  const categories = keep(source.categories).filter((row) => !row.parent_id).map((row) => {
    const items = byField('category', row.slug);
    return { slug: row.slug, name: row.name, count: items.length, image: pickImage(editorial, categoryImageKey(row.slug), row, DESIGN_IMAGES.category[row.slug], items) };
  }).filter((c) => !known || c.count > 0);

  const occasions = keep(source.occasions).map((row) => {
    const items = byField('occasions', row.slug);
    return { slug: row.slug, name: row.name, subtitle: row.subtitle || '', count: items.length, image: pickImage(editorial, occasionImageKey(row.slug), row, DESIGN_IMAGES.occasion[row.slug], items) };
  }).filter((o) => !known || o.count > 0);

  return { styleLines, categories, occasions };
}

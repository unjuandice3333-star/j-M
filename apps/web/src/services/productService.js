// =============================================================================
// Catálogo J&M FASHION STORE — lectura del esquema M24 (Supabase PostgreSQL).
//
// M27: contrato único con la base de datos (supabase/migrations/20261106120000_baseline_ecommerce.sql):
//   products · categories · style_lines · brands · product_colors→colors · product_images · variants→sizes
//   product_occasions→occasions · v_variant_availability (stock disponible) · v_product_rating (reseñas aprobadas)
// Sin datos simulados ni valores inventados: si la consulta falla, se lanza el error (la interfaz lo muestra).
// Precios en pesos colombianos (bigint, sin decimales). Disponibilidad = stock − reservado (vista de la BD).
// =============================================================================
import supabase from '../config/supabase';
import { getClientConfig } from '../config/runtimeConfig.js';
import { normalizeStyleLine } from '../utils/productUtils';
import { fetchAllIn, fetchAllRows } from '../utils/fetchAll.js';

export const PRODUCT_IMAGES_BUCKET = 'product-images';

const PRODUCT_SELECT = `
  id, reference, slug, name, description, details, fit, fit_description,
  base_price, compare_at_price, status, is_featured_new, is_bestseller, published_at, created_at,
  categories ( id, slug, name, size_group ),
  style_lines ( id, slug, name ),
  brands ( id, name ),
  product_colors ( color_id, position, is_default, colors ( id, slug, name, hex_code ) ),
  product_images ( id, color_id, storage_path, external_url, alt_text, position ),
  variants ( id, sku, color_id, price_override, is_active, sizes ( code, sort_order ) ),
  product_occasions ( occasions ( slug, name ) )
`;

/** URL pública de una imagen: externa (https) o del bucket público de Storage. */
export function imageUrl(img) {
  if (!img) return null;
  if (img.external_url) return img.external_url;
  if (img.storage_path) return `${getClientConfig().supabase.url}/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/${img.storage_path}`;
  return null;
}

/** Convierte una fila de la BD (con sus relaciones) a la estructura que consumen los componentes. */
export function normalizeProduct(db, availability = new Map(), ratings = new Map()) {
  const colorList = [...(db.product_colors ?? [])]
    .sort((a, b) => (b.is_default - a.is_default) || a.position - b.position)
    .filter((pc) => pc.colors)
    .map((pc) => ({ id: pc.color_id, slug: pc.colors.slug, name: pc.colors.name, hex: pc.colors.hex_code, isDefault: pc.is_default }));
  const colorById = new Map(colorList.map((c) => [c.id, c]));

  const imgs = [...(db.product_images ?? [])].sort((a, b) => a.position - b.position);
  const imagesByColor = {};
  for (const c of colorList) imagesByColor[c.name] = imgs.filter((i) => i.color_id === c.id).map(imageUrl).filter(Boolean);
  const general = imgs.filter((i) => !i.color_id).map(imageUrl).filter(Boolean);
  const defaultColor = colorList[0];
  const images = [...(defaultColor ? imagesByColor[defaultColor.name] : []), ...general,
    ...colorList.slice(1).flatMap((c) => imagesByColor[c.name])].filter((v, i, a) => a.indexOf(v) === i);

  const price = Number(db.base_price);
  const variants = (db.variants ?? []).filter((v) => v.is_active).map((v) => ({
    id: v.id,
    sku: v.sku,
    size: v.sizes?.code ?? null,
    sizeOrder: v.sizes?.sort_order ?? 0,
    colorId: v.color_id,
    color: colorById.get(v.color_id)?.name ?? null,
    price: v.price_override ? Number(v.price_override) : price,
    available: availability.get(v.id) ?? 0,
  })).sort((a, b) => a.sizeOrder - b.sizeOrder);

  const sizes = [...new Map(variants.map((v) => [v.size, v.sizeOrder])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([s]) => s).filter(Boolean);
  const stock = variants.reduce((n, v) => n + v.available, 0);
  const original = db.compare_at_price ? Number(db.compare_at_price) : null;
  const rating = ratings.get(db.id);
  const occasions = (db.product_occasions ?? []).map((po) => po.occasions?.slug).filter(Boolean);

  return {
    id: db.id,
    reference: db.reference,
    slug: db.slug,
    name: db.name,
    category: db.categories?.slug ?? null,
    categoryName: db.categories?.name ?? null,
    sizeGroup: db.categories?.size_group ?? null,
    brand: db.brands?.name ?? null,
    styleLine: db.style_lines?.slug ? normalizeStyleLine(db.style_lines.slug) : null,
    styleLineName: db.style_lines?.name ?? null,
    price,
    originalPrice: original,
    discountPercent: original ? Math.round((1 - price / original) * 100) : 0,
    isNew: Boolean(db.is_featured_new),
    isBestSeller: Boolean(db.is_bestseller),
    isSale: Boolean(original),
    rating: rating ? Number(rating.rating) : null,
    reviewCount: rating ? Number(rating.review_count) : 0,
    fit: db.fit,
    occasion: occasions[0] ?? null,
    occasions,
    color: defaultColor?.name ?? null,
    colors: colorList,
    sizes,
    rawVariants: variants,
    images,
    imagesByColor,
    description: db.description ?? '',
    details: db.details ?? [],
    fitDescription: db.fit_description ?? '',
    status: db.status,
    publishedAt: db.published_at,
    stock,
    inStock: stock > 0,
  };
}

/** Error de catálogo con el mensaje técnico de la BD (la interfaz muestra un texto propio). */
export class CatalogError extends Error {
  constructor(message, cause) { super(message); this.name = 'CatalogError'; this.cause = cause; }
}

// Disponibilidad y valoraciones de TODAS las variantes/productos pedidos: lista de ids troceada y cada trozo
// paginado (antes una sola consulta: con >1000 variantes PostgREST cortaba y faltaba stock sin error).
async function loadAvailabilityAndRatings(productIds) {
  if (productIds.length === 0) return { availability: new Map(), ratings: new Map() };
  const [av, rt] = await Promise.all([
    fetchAllIn((ids) => supabase.from('v_variant_availability').select('variant_id, available').in('product_id', ids).order('variant_id'), productIds),
    fetchAllIn((ids) => supabase.from('v_product_rating').select('product_id, rating, review_count').in('product_id', ids).order('product_id'), productIds),
  ]);
  if (av.error) throw new CatalogError('No se pudo consultar la disponibilidad', av.error);
  if (rt.error) throw new CatalogError('No se pudieron consultar las valoraciones', rt.error);
  return {
    availability: new Map(av.data.map((r) => [r.variant_id, Number(r.available)])),
    ratings: new Map(rt.data.map((r) => [r.product_id, r])),
  };
}

export const productService = {
  /** Productos visibles para el usuario actual (anon: solo `active`; admin: todos, por RLS). */
  async getProducts({ includeInactive = false } = {}) {
    // Paginado con orden total (published_at + id): con >1000 productos una consulta única perdía filas.
    const { data, error, capped } = await fetchAllRows(() => {
      let q = supabase.from('products').select(PRODUCT_SELECT).order('published_at', { ascending: false, nullsFirst: false }).order('id');
      if (!includeInactive) q = q.eq('status', 'active');
      return q;
    });
    if (error) throw new CatalogError('No se pudo cargar el catálogo', error);
    if (capped) console.warn('[catálogo] se alcanzó el tope de productos; la lista puede estar incompleta');
    const { availability, ratings } = await loadAvailabilityAndRatings(data.map((p) => p.id));
    return data.map((p) => normalizeProduct(p, availability, ratings));
  },

  /** Un producto activo por slug (null si no existe o no está publicado). */
  async getProductBySlug(slug) {
    const { data, error } = await supabase.from('products').select(PRODUCT_SELECT).eq('slug', slug).eq('status', 'active').maybeSingle();
    if (error) throw new CatalogError('No se pudo cargar el producto', error);
    if (!data) return null;
    const { availability, ratings } = await loadAvailabilityAndRatings([data.id]);
    return normalizeProduct(data, availability, ratings);
  },

  /** Catálogos de referencia para filtros y para el formulario de administración. */
  async getReferenceData() {
    const [cat, sl, oc, col, sz, br] = await Promise.all([
      supabase.from('categories').select('id, slug, name, size_group, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('style_lines').select('id, slug, name, tagline').eq('is_active', true).order('sort_order'),
      supabase.from('occasions').select('id, slug, name').eq('is_active', true).order('sort_order'),
      supabase.from('colors').select('id, slug, name, hex_code').order('sort_order'),
      supabase.from('sizes').select('id, size_group, code, name, sort_order').order('sort_order'),
      supabase.from('brands').select('id, name').order('name'),
    ]);
    for (const r of [cat, sl, oc, col, sz, br]) if (r.error) throw new CatalogError('No se pudieron cargar los datos de referencia', r.error);
    return { categories: cat.data, styleLines: sl.data, occasions: oc.data, colors: col.data, sizes: sz.data, brands: br.data };
  },
};

export default productService;

// =============================================================================
// Administración — RPC admin_* del esquema M24 (todas exigen is_admin() en la BD; ocultar botones no basta).
//   admin_upsert_product(p)                       crear/editar producto con colores, imágenes y variantes
//   admin_set_product_status(id, status)          draft | active | archived (publicar exige variantes e imágenes)
//   admin_adjust_inventory(variant, Δ, tipo, motivo)   restock | adjustment | damage | return (con trazabilidad)
//   admin_transition_order(id, estado, nota, tracking)  máquina de estados de la BD
//   admin_dashboard_metrics(desde, hasta)
// Lecturas administrativas: tablas con RLS (solo admin): online_orders, inventories, coupons, profiles…
// =============================================================================
import supabase from '../config/supabase';
import { toOrderError } from './orderService';

const ADMIN_HINTS = {
  JM_FORBIDDEN: 'No tienes permisos para esta operación.',
  JM_UNKNOWN_CATEGORY: 'La categoría no existe.',
  JM_UNKNOWN_STYLE_LINE: 'La línea de estilo no existe.',
  JM_UNKNOWN_COLOR: 'Uno de los colores no existe.',
  JM_UNKNOWN_SIZE: 'Una de las tallas no corresponde a la categoría.',
  JM_UNKNOWN_OCCASION: 'Una de las ocasiones no existe.',
  JM_COLORS_REQUIRED: 'El producto debe tener al menos un color.',
  JM_COLOR_NOT_DECLARED: 'Una variante usa un color que no está en la lista de colores del producto.',
  JM_COLOR_IN_USE: 'No se puede quitar un color que tiene variantes.',
  JM_PRODUCT_NOT_FOUND: 'El producto no existe.',
  JM_PUBLISH_NO_VARIANTS: 'Para publicar, el producto necesita al menos una variante activa.',
  JM_PUBLISH_NO_IMAGES: 'Para publicar, el producto necesita al menos una imagen.',
  JM_INVALID_MOVEMENT: 'El ajuste de inventario no es válido (tipo, signo o cantidad).',
  JM_NOTE_REQUIRED: 'Escribe el motivo.',
  JM_BELOW_RESERVED: 'El ajuste dejaría el stock por debajo de lo reservado por pedidos pendientes.',
  JM_VARIANT_NOT_FOUND: 'La variante no existe.',
  JM_INVALID_TRANSITION: 'El pedido no puede pasar a ese estado desde el estado actual.',
  JM_TRACKING_REQUIRED: 'Para marcar como enviado, indica transportadora y número de guía.',
  JM_ORDER_NOT_FOUND: 'El pedido no existe.',
  JM_LAST_SUPER_ADMIN: 'No se puede quitar el último super administrador.',
  JM_USER_NOT_FOUND: 'El usuario no existe.',
};

/** Traduce errores de la BD (HINT JM_*, restricciones, RLS) a mensajes de administración. */
export function adminError(error, fallback = 'No se pudo completar la operación.') {
  const hint = error?.hint || '';
  if (ADMIN_HINTS[hint]) return Object.assign(new Error(ADMIN_HINTS[hint]), { hint, cause: error });
  if (error?.code === '23505') {
    const what = /slug/.test(error.message) ? 'el slug' : /reference/.test(error.message) ? 'la referencia' : /sku/.test(error.message) ? 'un SKU' : /code/.test(error.message) ? 'el código' : 'un valor único';
    return Object.assign(new Error(`Ya existe otro registro con ${what}.`), { hint: 'UNIQUE', cause: error });
  }
  if (error?.code === '23514') return Object.assign(new Error('Un dato no cumple el formato o las reglas (revisa referencia, slug, precios y códigos).'), { hint: 'CHECK', cause: error });
  if (error?.code === '42501') return Object.assign(new Error(ADMIN_HINTS.JM_FORBIDDEN), { hint: 'JM_FORBIDDEN', cause: error });
  return Object.assign(toOrderError(error, fallback), { cause: error });
}

/** Slug canónico (minúsculas, sin tildes, guiones). */
export function slugify(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

/** Referencia canónica (mayúsculas, guiones). */
export function toReference(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

const call = async (fn, args, fallback) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw adminError(error, fallback);
  return data;
};

/** Evento del navegador que pide al menú del admin recontar los pedidos por preparar (ejecución 75). */
export const ORDERS_CHANGED_EVENT = 'jm:admin-orders-changed';
/** Cada cuánto el menú del admin reconsulta los pedidos por preparar (los pagos llegan por webhook). */
export const ORDERS_POLL_MS = 60000;
const notifyOrdersChanged = () => { try { window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT)); } catch { /* sin window (node) */ } };

/** Pedidos pagados que esperan preparación (status = 'paid'). Solo HEAD con count exacto: no descarga filas. */
export async function countOrdersToPrepare() {
  const { count, error } = await supabase.from('online_orders').select('id', { count: 'exact', head: true }).eq('status', 'paid');
  if (error) throw adminError(error, 'No se pudo contar los pedidos por preparar.');
  return count ?? 0;
}

export const adminService = {
  upsertProduct: (payload) => call('admin_upsert_product', { p: payload }, 'No se pudo guardar el producto.'),
  setProductStatus: (productId, status) => call('admin_set_product_status', { p_product_id: productId, p_status: status }, 'No se pudo cambiar el estado del producto.'),
  adjustInventory: (variantId, quantityChange, movementType, reason) =>
    call('admin_adjust_inventory', { p_variant_id: variantId, p_quantity_change: quantityChange, p_movement_type: movementType, p_reason: reason }, 'No se pudo ajustar el inventario.'),
  async transitionOrder(orderId, to, note = null, tracking = null) {
    const data = await call('admin_transition_order', { p_order_id: orderId, p_to: to, p_note: note, p_tracking: tracking }, 'No se pudo cambiar el estado del pedido.');
    notifyOrdersChanged();
    return data;
  },
  countOrdersToPrepare,
  dashboardMetrics: (from, to) => call('admin_dashboard_metrics', { p_from: from, p_to: to }, 'No se pudieron cargar las métricas.'),

  /** Producto completo para edición (cualquier estado; RLS: solo admin). */
  async getProductForEdit(id) {
    const { data, error } = await supabase.from('products').select(`
      id, reference, slug, name, description, details, fit, fit_description, base_price, compare_at_price, base_cost,
      status, is_featured_new, is_bestseller, categories ( slug ), style_lines ( slug ),
      product_colors ( color_id, position, is_default, colors ( slug, name, hex_code ) ),
      product_images ( color_id, storage_path, external_url, alt_text, position ),
      product_occasions ( occasions ( slug ) ),
      variants ( id, sku, barcode, price_override, is_active, color_id, sizes ( code, size_group ), inventories ( stock, reserved ) )`).eq('id', id).maybeSingle();
    if (error) throw adminError(error, 'No se pudo cargar el producto.');
    return data;
  },

  /** Sube una imagen al bucket público product-images (RLS de Storage: solo admin) y devuelve storage_path. */
  async uploadProductImage(file, productSlug) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${slugify(productSlug) || 'producto'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw adminError(error, 'No se pudo subir la imagen.');
    return path;
  },
};

export default adminService;

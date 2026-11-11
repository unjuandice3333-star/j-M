// Acceso a datos de /admin/reviews (ejecución 73). RLS: solo el admin lee todas y modera (product_reviews_admin).
// Columnas: solo las del GRANT SELECT por columnas de la migración 20261111200000 (sin user_id ni order_item_id).
import supabase from '../config/supabase';
import { adminError } from './adminService';
import { fetchAllRows } from '../utils/fetchAll';
import { normalizeReply } from '../utils/reviewsAdmin';

export const REVIEWS_ADMIN_COLUMNS = 'id, product_id, author_name, city, rating, title, comment, status, admin_reply, is_verified_buyer, created_at, products ( name, slug )';
/** Evento del navegador que pide al menú del admin recontar las pendientes. */
export const REVIEWS_CHANGED_EVENT = 'jm:admin-reviews-changed';

/** Todas las reseñas (todas las páginas; orden total created_at desc + id). */
export async function fetchAdminReviews() {
  const { data, error, capped } = await fetchAllRows(() => supabase.from('product_reviews').select(REVIEWS_ADMIN_COLUMNS)
    .order('created_at', { ascending: false }).order('id'));
  if (error) throw adminError(error, 'No se pudieron cargar las reseñas.');
  return { reviews: data, capped };
}

/** Número de reseñas pendientes (solo cabecera HEAD con count exacto; no descarga filas). */
export async function countPendingReviews() {
  const { count, error } = await supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw adminError(error, 'No se pudo contar las reseñas pendientes.');
  return count ?? 0;
}

const notifyChanged = () => { try { window.dispatchEvent(new Event(REVIEWS_CHANGED_EVENT)); } catch { /* sin window (pruebas de node) */ } };

async function patchReview(id, patch) {
  const { data, error } = await supabase.from('product_reviews').update(patch).eq('id', id).select('id');
  if (error) throw adminError(error);
  // Sin filas afectadas = la RLS no dejó (sesión sin rol admin) o la reseña ya no existe: no fingir éxito.
  if (!data || data.length === 0) throw Object.assign(new Error('No se guardó: la reseña no existe o tu sesión no tiene permisos de administrador.'), { hint: 'NO_ROWS' });
  notifyChanged();
}

/** Aprueba o rechaza guardando la respuesta pública (opcional). */
export async function moderateReview(id, status, reply, moderatorId) {
  if (!['approved', 'rejected', 'pending'].includes(status)) throw new Error('Estado de reseña no válido.');
  const r = normalizeReply(reply);
  if (r.error) throw new Error(r.error);
  await patchReview(id, { status, admin_reply: r.value, moderated_by: moderatorId ?? null, moderated_at: new Date().toISOString() });
}

/** Guarda o borra solo la respuesta pública sin cambiar el estado (p. ej. en una reseña ya aprobada). */
export async function saveReviewReply(id, reply) {
  const r = normalizeReply(reply);
  if (r.error) throw new Error(r.error);
  await patchReview(id, { admin_reply: r.value });
}

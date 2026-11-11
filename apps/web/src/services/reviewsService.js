// =============================================================================
// Reseñas escritas por el cliente (ejecución 71, migración 20261111180000).
// La compra se verifica en la BD (my_product_reviewables / submit_product_review): el cliente solo opina
// sobre artículos de sus pedidos pagados y la reseña queda pendiente hasta que el admin la apruebe.
// =============================================================================
import supabase from '../config/supabase';

export const REVIEW_LIMITS = { titleMin: 3, titleMax: 120, commentMin: 10, commentMax: 2000, cityMax: 80 };

/** Mismo criterio que la RPC. Devuelve { campo: motivo } (vacío si es válido). */
export function validateReview({ rating, title, comment, city } = {}) {
  const errors = {};
  const t = String(title ?? '').trim();
  const c = String(comment ?? '').trim();
  const ci = String(city ?? '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Elige una calificación de 1 a 5 estrellas.';
  if (t.length < REVIEW_LIMITS.titleMin || t.length > REVIEW_LIMITS.titleMax) errors.title = `El título debe tener entre ${REVIEW_LIMITS.titleMin} y ${REVIEW_LIMITS.titleMax} caracteres.`;
  if (c.length < REVIEW_LIMITS.commentMin || c.length > REVIEW_LIMITS.commentMax) errors.comment = `El comentario debe tener entre ${REVIEW_LIMITS.commentMin} y ${REVIEW_LIMITS.commentMax} caracteres.`;
  if (ci.length > REVIEW_LIMITS.cityMax) errors.city = `La ciudad debe tener como máximo ${REVIEW_LIMITS.cityMax} caracteres.`;
  return errors;
}

export const isReviewRpcMissing = (err) => err?.code === 'PGRST202' || err?.code === '42883';

/** Error de PostgREST/red → mensaje en español sin detalles internos. */
export function reviewErrorMessage(err) {
  const hint = err?.hint;
  if (hint === 'JM_AUTH_REQUIRED' || err?.code === 'PGRST301') return 'Tu sesión venció. Vuelve a iniciar sesión para opinar.';
  if (hint === 'JM_NOT_PURCHASED') return 'Solo puedes opinar sobre productos que compraste.';
  if (hint === 'JM_ALREADY_REVIEWED') return 'Ya enviaste una opinión sobre esta compra.';
  if (hint === 'JM_INVALID_INPUT' && err?.message) return err.message;
  if (isReviewRpcMissing(err)) return 'Las opiniones de clientes no están disponibles en este momento.';
  return 'No pudimos enviar tu opinión. Revisa tu conexión e intenta de nuevo.';
}

const fail = (err) => Object.assign(new Error(reviewErrorMessage(err)), { cause: err, missing: isReviewRpcMissing(err) });

/**
 * Artículos comprados de este producto por el usuario con sesión:
 * [{ orderItemId, orderNumber, purchasedAt, size, color, review: null | { status, rating, title, comment, adminReply } }]
 */
export async function fetchMyReviewables(productId) {
  let res;
  try { res = await supabase.rpc('my_product_reviewables', { p_product_id: productId }); } catch (e) { throw fail(e); }
  if (res?.error) throw fail(res.error);
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows.map((r) => ({
    orderItemId: r.order_item_id,
    orderNumber: r.order_number,
    purchasedAt: r.purchased_at,
    size: r.size_code,
    color: r.color_name,
    review: r.review ? {
      id: r.review.id, status: r.review.status, rating: r.review.rating, title: r.review.title,
      comment: r.review.comment, adminReply: r.review.admin_reply ?? null,
    } : null,
  }));
}

/** Envía la reseña (queda pendiente de moderación). */
export async function submitReview({ orderItemId, rating, title, comment, city }) {
  const errors = validateReview({ rating, title, comment, city });
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);
  let res;
  try {
    res = await supabase.rpc('submit_product_review', {
      p_order_item_id: orderItemId, p_rating: rating, p_title: String(title).trim(),
      p_comment: String(comment).trim(), p_city: String(city ?? '').trim() || null,
    });
  } catch (e) { throw fail(e); }
  if (res?.error) throw fail(res.error);
  if (!res?.data?.id) throw fail(null);
  return res.data;
}

/**
 * Ejecución 72 (migración 20261111200000): artículos de pedidos ENTREGADOS sin reseña propia del producto,
 * uno por producto: [{ orderItemId, orderNumber, deliveredAt, productId, productName, slug, imageUrl, size, color }]
 */
export async function fetchReviewInvitations() {
  let res;
  try { res = await supabase.rpc('my_review_invitations'); } catch (e) { throw fail(e); }
  if (res?.error) throw fail(res.error);
  const rows = Array.isArray(res?.data) ? res.data : [];
  return rows.filter((r) => r?.slug).map((r) => ({
    orderItemId: r.order_item_id,
    orderNumber: r.order_number,
    deliveredAt: r.delivered_at,
    productId: r.product_id,
    productName: r.product_name,
    slug: r.slug,
    imageUrl: r.image_url ?? null,
    size: r.size_code,
    color: r.color_name,
  }));
}

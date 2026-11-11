// Utilidades puras de /admin/reviews (ejecución 73): filtro por estado, producto y texto sin tildes,
// conteo por estado y lista de productos con reseñas. Sin dependencias de Supabase (probadas con vitest).

export const REVIEW_STATUS = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
/** Longitud máxima de la respuesta pública de la tienda (la ficha la muestra completa). */
export const REVIEW_REPLY_MAX = 1000;

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Filtra reseñas: status = 'todas' | pending | approved | rejected; productId = '' para todos; query sin tildes. */
export function filterReviews(rows, { status = 'todas', productId = '', query = '' } = {}) {
  const q = fold(query);
  return (rows || []).filter((r) => (status === 'todas' || r.status === status)
    && (!productId || r.product_id === productId)
    && (!q || [r.author_name, r.city, r.title, r.comment, r.admin_reply, r.products?.name].some((v) => fold(v).includes(q))));
}

/** Conteo por estado (para las pestañas) sobre las reseñas ya filtradas por producto/texto. */
export function countReviewsByStatus(rows) {
  const out = { todas: 0, pending: 0, approved: 0, rejected: 0 };
  for (const r of rows || []) { out.todas += 1; if (r.status in out) out[r.status] += 1; }
  return out;
}

/** Productos con al menos una reseña, ordenados por nombre (es), con su número de pendientes. */
export function reviewProducts(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r.product_id) continue;
    const p = map.get(r.product_id) || { id: r.product_id, name: r.products?.name || 'Producto sin nombre', total: 0, pending: 0 };
    p.total += 1; if (r.status === 'pending') p.pending += 1;
    map.set(r.product_id, p);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

/** Respuesta normalizada (null si vacía) o error si supera el máximo. */
export function normalizeReply(text) {
  const t = String(text ?? '').trim();
  if (t.length > REVIEW_REPLY_MAX) return { error: `La respuesta no puede superar ${REVIEW_REPLY_MAX} caracteres (tiene ${t.length}).` };
  return { value: t || null };
}

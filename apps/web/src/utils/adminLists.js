// Reglas puras de las listas del admin (pedidos y clientes), separadas de las páginas para poder probarlas.

/** Estados en los que el pedido cuenta como compra pagada. */
export const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

/** Máximo de pedidos que carga la página de pedidos del admin (los más recientes). */
export const ADMIN_ORDERS_LIMIT = 200;

const norm = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Filtra pedidos del admin por estado, método de envío y texto.
 * El texto busca en número, cliente, correo, teléfono y número de guía.
 * @param {Array<object>} orders
 * @param {{status?:string, method?:string, query?:string}} [f] 'todos' o vacío = sin filtro
 */
export function filterAdminOrders(orders, { status = 'todos', method = 'todos', query = '' } = {}) {
  const q = norm(query);
  return (orders ?? []).filter((o) => {
    if (status && status !== 'todos' && o.status !== status) return false;
    if (method && method !== 'todos' && (o.shipping_method_code || '') !== method) return false;
    if (q && ![o.order_number, o.customer_name, o.customer_email, o.customer_phone, o.tracking_number]
      .some((v) => norm(v).includes(q))) return false;
    return true;
  });
}

/**
 * Códigos de método presentes en los pedidos + los configurados, sin duplicados, en orden estable
 * (primero los configurados por sort_order, luego los que solo aparecen en pedidos).
 */
export function shippingMethodOptions(orders, shippingMethods) {
  const out = [];
  [...(shippingMethods ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .forEach((m) => { if (m?.code && !out.includes(m.code)) out.push(m.code); });
  (orders ?? []).forEach((o) => { const c = o.shipping_method_code; if (c && !out.includes(c)) out.push(c); });
  return out;
}

/**
 * Une perfiles con sus pedidos. Un pedido pertenece al perfil si coincide user_id o, solo para pedidos
 * de invitado (sin user_id), el correo (sin distinguir mayúsculas ni espacios). `orders` debe venir del más reciente al más antiguo.
 */
export function buildCustomers(profiles, orders) {
  return (profiles ?? []).map((p) => {
    const email = norm(p.email);
    // Un pedido con user_id pertenece solo a esa cuenta (no se atribuye a otra por coincidir el correo).
    const mine = (orders ?? []).filter((o) => (o.user_id ? o.user_id === p.id : Boolean(email) && norm(o.customer_email) === email));
    const paid = mine.filter((o) => PAID_STATUSES.has(o.status));
    const spent = paid.reduce((n, o) => n + (Number(o.total) || 0), 0);
    return {
      ...p, orders: mine, ordersCount: paid.length, totalSpent: spent,
      avgTicket: paid.length ? Math.round(spent / paid.length) : 0,
      lastPurchase: paid[0]?.created_at ?? null, city: mine[0]?.shipping_city || '—',
    };
  });
}

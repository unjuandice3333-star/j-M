// Reglas puras de las listas del admin (pedidos y clientes), separadas de las páginas para poder probarlas.

/** Estados en los que el pedido cuenta como compra pagada. */
export const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

/** Pedidos por página en el admin de pedidos (se cargan más con «Cargar más»). */
export const ADMIN_ORDERS_PAGE_SIZE = 50;

/** Filas por solicitud al leer tablas completas; igual a `max_rows` de PostgREST (supabase/config.toml). */
export const FETCH_ALL_PAGE_SIZE = 1000;
/** Tope de seguridad de filas al leer una tabla completa (evita bucles infinitos y pestañas colgadas). */
export const FETCH_ALL_MAX_ROWS = 50000;

/**
 * Lee TODAS las filas de una consulta paginando con `.range()`. PostgREST corta cada respuesta en `max_rows`
 * (1000) sin avisar, así que una sola consulta pierde filas en silencio a partir de ese número.
 * `buildQuery` debe devolver una consulta NUEVA con orden total y estable (p. ej. `.order('created_at').order('id')`).
 * @param {() => any} buildQuery
 * @returns {Promise<{data: Array|null, error: any, capped: boolean}>} capped = se alcanzó `maxRows`.
 */
export async function fetchAllRows(buildQuery, { pageSize = FETCH_ALL_PAGE_SIZE, maxRows = FETCH_ALL_MAX_ROWS } = {}) {
  const out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, Math.min(from + pageSize, maxRows) - 1);
    if (error) return { data: null, error, capped: false };
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) return { data: out, error: null, capped: false };
  }
  return { data: out, error: null, capped: true };
}

/**
 * Texto de búsqueda seguro para un filtro `or=(…ilike…)` de PostgREST: quita los caracteres con significado
 * en esa sintaxis (coma, paréntesis, comillas, comodines, barra invertida, dos puntos) y recorta.
 */
export function sanitizeOrSearch(query) {
  return String(query ?? '').replace(/[,()"'*%\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Columnas en las que busca el admin de pedidos (número, cliente, correo, teléfono y guía). */
export const ORDER_SEARCH_COLUMNS = ['order_number', 'customer_name', 'customer_email', 'customer_phone', 'tracking_number'];

/** Filtro `or` de PostgREST para buscar pedidos, o null si no hay texto útil. */
export function orderSearchFilter(query) {
  const q = sanitizeOrSearch(query);
  return q ? ORDER_SEARCH_COLUMNS.map((c) => `${c}.ilike.*${q}*`).join(',') : null;
}

/** Conteo por estado a partir de filas `{status}` (para las pestañas). */
export function countByStatus(rows) {
  const out = { todos: 0 };
  (rows ?? []).forEach((r) => { out.todos += 1; out[r.status] = (out[r.status] ?? 0) + 1; });
  return out;
}

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

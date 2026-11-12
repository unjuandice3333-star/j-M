// Reglas puras de las listas del admin (pedidos y clientes), separadas de las páginas para poder probarlas.

/** Estados en los que el pedido cuenta como compra pagada. */
export const PAID_STATUSES = new Set(['paid', 'processing', 'shipped', 'delivered']);

/** Pedidos por página en el admin de pedidos (se cargan más con «Cargar más»). */
export const ADMIN_ORDERS_PAGE_SIZE = 50;

// Lectura paginada compartida con la tienda (catálogo, reseñas, lista de deseos).
export { fetchAllRows, FETCH_ALL_PAGE_SIZE, FETCH_ALL_MAX_ROWS } from './fetchAll.js';

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

/**
 * Ejecución 87: código de cupón leído de `?cupon=` en /admin/pedidos. Se normaliza igual que la BD
 * (`upper(btrim(code))`) y se valida contra la restricción de `coupons.code` (`^[A-Z0-9_-]{3,40}$`); cualquier otro
 * valor devuelve null (sin filtro) en vez de mandar a PostgREST un texto arbitrario.
 */
export function couponFromParam(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_-]{3,40}$/.test(code) ? code : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ejecución 88: id de cliente leído de `?cliente=` en /admin/pedidos; solo un UUID válido (si no, null = sin filtro). */
export function customerFromParam(value) {
  const id = String(value ?? '').trim().toLowerCase();
  return UUID_RE.test(id) ? id : null;
}

/**
 * Ejecución 88: filtro `or` de PostgREST con la MISMA regla de atribución que `buildCustomers`: los pedidos con
 * `user_id` de la cuenta y, de los pedidos sin cuenta (invitado), los de su correo. `online_orders.customer_email`
 * siempre está en minúsculas (CHECK de la BD), así que basta `eq` con el correo normalizado, entre comillas.
 * @param {{id:string, email?:string}} profile
 */
export function customerOrdersFilter(profile) {
  const id = customerFromParam(profile?.id);
  if (!id) return null;
  const email = norm(profile.email);
  if (!email) return `user_id.eq.${id}`;
  const quoted = `"${email.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;
  return `user_id.eq.${id},and(user_id.is.null,customer_email.eq.${quoted})`;
}

/** Combina dos filtros `or` en uno solo (PostgREST: un único parámetro `or`), o devuelve el que exista. */
export function combineOrFilters(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return `and(or(${a}),or(${b}))`;
}

/**
 * Ejecución 89: enlace del detalle de un pedido a /admin/clientes. Con cuenta (`user_id`) abre directamente la ficha de
 * esa cuenta (`?cliente=<id>`); un pedido de invitado busca su correo entre todos los roles (`?q=<correo>&rol=todos`),
 * igual que `buildCustomers` atribuye los pedidos de invitado por correo. Sin datos útiles devuelve null.
 */
export function customerLinkForOrder(order) {
  const id = customerFromParam(order?.user_id);
  if (id) return { to: `/admin/clientes?cliente=${id}`, label: 'Ver ficha del cliente' };
  const email = norm(order?.customer_email);
  if (!email) return null;
  return { to: `/admin/clientes?${new URLSearchParams({ q: email, rol: 'todos' })}`, label: 'Buscar cliente por correo' };
}

/** Ejecución 89: enlace de un pedido (por su número, único) a /admin/pedidos. */
export function orderLink(orderNumber) {
  const n = String(orderNumber ?? '').trim();
  return n ? `/admin/pedidos?${new URLSearchParams({ q: n })}` : null;
}

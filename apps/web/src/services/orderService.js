// =============================================================================
// Pedidos, cotización y cupones — RPC públicas del esquema M24 (contrato único con la BD).
//   quote_cart(p_items, p_coupon_code, p_shipping_method, p_email)   precios, descuento, envío y stock desde la BD
//   validate_coupon(p_code, p_subtotal, p_email)
//   create_order(p_customer, p_shipping, p_items, p_coupon_code, p_shipping_method, p_idempotency_key)
//   get_order_public(p_order_number, p_public_token)                  seguimiento sin sesión (token del pedido)
//   cancel_my_order(p_order_id, p_public_token, p_reason)
// Los importes los calcula SIEMPRE la BD; el navegador solo envía variante y cantidad.
// =============================================================================
import supabase from '../config/supabase';

const HINT_MESSAGES = {
  JM_EMPTY_CART: 'Tu carrito está vacío.',
  JM_TOO_MANY_ITEMS: 'Un pedido admite como máximo 20 referencias distintas.',
  JM_INVALID_ITEM: 'Uno de los productos del carrito no es válido. Retíralo y vuelve a agregarlo.',
  JM_INVALID_QUANTITY: 'La cantidad de un producto no es válida.',
  JM_VARIANT_NOT_FOUND: 'Uno de los productos ya no está disponible. Retíralo del carrito.',
  JM_VARIANT_UNAVAILABLE: 'Uno de los productos ya no está disponible. Retíralo del carrito.',
  JM_OUT_OF_STOCK: 'No hay stock suficiente para uno o más productos.',
  JM_INVALID_CUSTOMER: 'Revisa tu nombre (entre 2 y 150 caracteres).',
  JM_INVALID_EMAIL: 'Revisa tu correo electrónico.',
  JM_INVALID_PHONE: 'Revisa tu teléfono (entre 7 y 15 dígitos).',
  JM_INVALID_SHIPPING: 'Completa departamento, ciudad y dirección de envío.',
  JM_SHIPPING_UNAVAILABLE: 'El método de envío seleccionado no está disponible.',
  JM_IDEMPOTENCY_KEY: 'No se pudo identificar el intento de compra. Recarga la página e inténtalo de nuevo.',
  JM_ORDER_NOT_FOUND: 'No encontramos el pedido.',
  JM_ORDER_NOT_PAYABLE: 'Este pedido ya no admite pagos.',
  JM_PAYMENT_WINDOW_EXPIRED: 'El tiempo para pagar este pedido expiró. Crea un pedido nuevo.',
  JM_TOO_MANY_ATTEMPTS: 'Se alcanzó el máximo de intentos de pago para este pedido.',
  JM_INVALID_TRANSITION: 'Este pedido no se puede cambiar a ese estado.',
  JM_CONFIG: 'La tienda no está configurada para recibir pedidos. Inténtalo más tarde.',
};

export const COUPON_REASONS = {
  EMPTY: 'Escribe un código de cupón.',
  NOT_FOUND: 'El cupón no existe.',
  NOT_STARTED: 'El cupón todavía no está vigente.',
  EXPIRED: 'El cupón está vencido.',
  EXHAUSTED: 'El cupón ya alcanzó su límite de usos.',
  EMAIL_LIMIT: 'Ya usaste este cupón el máximo de veces permitido.',
  MIN_SUBTOTAL: 'Tu compra no alcanza el mínimo para este cupón.',
};

/** Error de negocio con mensaje para el cliente (nunca expone detalles internos). */
export class OrderError extends Error {
  constructor(message, { hint, cause } = {}) { super(message); this.name = 'OrderError'; this.hint = hint; this.cause = cause; }
}

export function toOrderError(error, fallback = 'No se pudo completar la operación. Inténtalo de nuevo.') {
  if (!error) return new OrderError(fallback);
  if (error instanceof OrderError) return error; // ya traducido: no volver a envolver (perdería el mensaje)
  const hint = error.hint || '';
  if (hint.startsWith('JM_COUPON_')) return new OrderError(COUPON_REASONS[hint.slice('JM_COUPON_'.length)] || 'El cupón no es válido.', { hint, cause: error });
  if (hint === 'JM_OUT_OF_STOCK' && error.message) return new OrderError(error.message.replace(/^Stock insuficiente: /, 'Stock insuficiente: '), { hint, cause: error });
  if (HINT_MESSAGES[hint]) return new OrderError(HINT_MESSAGES[hint], { hint, cause: error });
  if (error.message && /Failed to fetch|NetworkError|fetch failed/i.test(error.message)) return new OrderError('No hay conexión con la tienda. Revisa tu internet e inténtalo de nuevo.', { hint: 'NETWORK', cause: error });
  return new OrderError(fallback, { hint, cause: error });
}

const toItems = (items) => items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));

export const orderService = {
  async getShippingMethods() {
    const { data, error } = await supabase.from('shipping_methods').select('code, name, cost, free_over_subtotal, eta_text').eq('is_active', true).order('sort_order');
    if (error) throw toOrderError(error, 'No se pudieron cargar los métodos de envío.');
    return data.map((m) => ({ ...m, cost: Number(m.cost), free_over_subtotal: m.free_over_subtotal ? Number(m.free_over_subtotal) : null }));
  },

  async quote(items, { couponCode = null, shippingMethod = 'standard', email = null } = {}) {
    const { data, error } = await supabase.rpc('quote_cart', { p_items: toItems(items), p_coupon_code: couponCode, p_shipping_method: shippingMethod, p_email: email });
    if (error) throw toOrderError(error, 'No se pudo calcular el total del carrito.');
    return data;
  },

  async validateCoupon(code, subtotal, email = null) {
    const { data, error } = await supabase.rpc('validate_coupon', { p_code: code, p_subtotal: subtotal, p_email: email });
    if (error) throw toOrderError(error, 'No se pudo validar el cupón.');
    return { ...data, message: data.valid ? null : (COUPON_REASONS[data.reason] || 'El cupón no es válido.') };
  },

  async createOrder({ customer, shipping, items, couponCode, shippingMethod = 'standard', idempotencyKey }) {
    const { data, error } = await supabase.rpc('create_order', {
      p_customer: customer, p_shipping: shipping, p_items: toItems(items),
      p_coupon_code: couponCode || null, p_shipping_method: shippingMethod, p_idempotency_key: idempotencyKey,
    });
    if (error) throw toOrderError(error, 'No se pudo crear el pedido. Inténtalo de nuevo.');
    return data;
  },

  async getPublicOrder(orderNumber, publicToken) {
    const { data, error } = await supabase.rpc('get_order_public', { p_order_number: orderNumber, p_public_token: publicToken });
    if (error) throw toOrderError(error, 'No se pudo consultar el pedido.');
    return data; // null si no existe o el token no corresponde
  },

  async cancelOrder(orderId, publicToken = null, reason = null) {
    const { data, error } = await supabase.rpc('cancel_my_order', { p_order_id: orderId, p_public_token: publicToken, p_reason: reason });
    if (error) throw toOrderError(error, 'No se pudo cancelar el pedido.');
    return data;
  },

  /** Pedidos del usuario autenticado (RLS: solo los suyos). */
  async getMyOrders() {
    const { data, error } = await supabase.from('online_orders')
      .select('id, order_number, public_token, status, total, subtotal, discount_total, shipping_cost, shipping_method_code, coupon_code, created_at, payment_expires_at, paid_at, shipped_at, delivered_at, carrier, tracking_number, tracking_url, shipping_city, shipping_department, shipping_address, online_order_items ( product_name, size_code, color_name, quantity, unit_price, line_total, image_url )')
      .order('created_at', { ascending: false });
    if (error) throw toOrderError(error, 'No se pudieron cargar tus pedidos.');
    return data;
  },

  async getStatusCatalog() {
    const { data, error } = await supabase.rpc('get_order_status_catalog');
    if (error) throw toOrderError(error, 'No se pudo cargar el catálogo de estados.');
    return data;
  },
};

/** Clave de idempotencia por intento de compra (estable mientras no cambie el contenido). */
export function newIdempotencyKey() {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${rnd}`;
}

export default orderService;

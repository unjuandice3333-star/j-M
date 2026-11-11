// Política de envío visible en la tienda, derivada de public.shipping_methods (la misma tabla con la que la BD
// calcula el envío en private.shipping_cost). Sin cifras fijas: si los métodos aún no cargaron, o el método
// estándar no tiene umbral, los textos no prometen envío gratis.
import { formatCOP } from './currency';

export const STANDARD_METHOD = 'standard';

/** @param {Array<{code:string,cost:number,free_over_subtotal:number|null,eta_text?:string|null}>} shippingMethods */
export function getShippingPolicy(shippingMethods) {
  const list = Array.isArray(shippingMethods) ? shippingMethods : [];
  const standard = list.find((m) => m?.code === STANDARD_METHOD) || null;
  const threshold = standard && Number(standard.free_over_subtotal) > 0 ? Number(standard.free_over_subtotal) : null;
  const cost = standard && Number.isFinite(Number(standard.cost)) ? Number(standard.cost) : null;
  return {
    loaded: Boolean(standard),
    threshold,
    cost,
    eta: standard?.eta_text || null,
    thresholdLabel: threshold != null ? `${formatCOP(threshold)} COP` : null,
    costLabel: cost != null ? `${formatCOP(cost)} COP` : null,
  };
}

// Nombres de respaldo para pedidos cuyo método ya no está en la lista pública (RLS: solo se leen los activos).
const FALLBACK_METHOD_NAMES = { standard: 'Envío estándar', express: 'Envío express' };

/**
 * Nombre legible del método de envío de un pedido (online_orders.shipping_method_code).
 * Usa el nombre configurado en shipping_methods si está cargado; si no, un nombre de respaldo o el código.
 * @param {string|null|undefined} code
 * @param {Array<{code:string,name?:string|null}>} [shippingMethods]
 * @returns {string|null} null si el pedido no trae método
 */
export function shippingMethodLabel(code, shippingMethods) {
  const c = typeof code === 'string' ? code.trim() : '';
  if (!c) return null;
  const list = Array.isArray(shippingMethods) ? shippingMethods : [];
  const name = list.find((m) => m?.code === c)?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  return FALLBACK_METHOD_NAMES[c] || c;
}

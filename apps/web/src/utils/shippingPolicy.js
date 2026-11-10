// Política de envío visible en la tienda, derivada de public.shipping_methods (la misma tabla con la que la BD
// calcula el envío en private.shipping_cost). Sin cifras fijas: si los métodos aún no cargaron, o el método
// estándar no tiene umbral, los textos no prometen envío gratis.
import { formatCOP } from '../data/mockData';

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

import { useECommerceStore } from '../store/eCommerceStore';
import { getShippingPolicy } from '../utils/shippingPolicy';

/** Política de envío actual (umbral de envío gratis y tarifa estándar) leída del catálogo cargado. */
export function useShippingPolicy() {
  const shippingMethods = useECommerceStore((s) => s.shippingMethods);
  return getShippingPolicy(shippingMethods);
}

export default useShippingPolicy;

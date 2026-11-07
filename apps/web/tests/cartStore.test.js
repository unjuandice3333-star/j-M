import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/store/cartStore.js';

const variant = (id, price) => ({ id, price_override: price, product: { base_price: price } });

describe('cartStore', () => {
  beforeEach(() => useCartStore.getState().clearCart());

  it('agrega y acumula cantidades de la misma variante', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 10000), 1);
    s.addToCart(variant('v1', 10000), 2);
    const { cart } = useCartStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].total).toBe(30000);
  });

  it('elimina al actualizar cantidad a 0', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 10000));
    s.updateCartQuantity('v1', 0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  it('calcula IVA 19% y descuentos', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 100000), 1);
    s.setGlobalDiscount(10, 'percentage');
    const t = useCartStore.getState().getCartTotals();
    expect(t.netSubtotal).toBe(90000);
    expect(t.tax).toBeCloseTo(17100);
    expect(t.total).toBeCloseTo(107100);
  });

  it('el descuento por ítem no excede el subtotal', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 5000), 1);
    s.applyItemDiscount('v1', 99999);
    expect(useCartStore.getState().cart[0].total).toBe(0);
  });
});

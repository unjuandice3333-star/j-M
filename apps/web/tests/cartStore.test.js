import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/store/cartStore.js';

const variant = (id, price) => ({ id, price_override: price, product: { base_price: 1 } });

describe('cartStore', () => {
  beforeEach(() => useCartStore.getState().clearCart());

  it('añade y acumula cantidades de la misma variante', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 100000), 1);
    s.addToCart(variant('v1', 100000), 2);
    const { cart } = useCartStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].total).toBe(300000);
  });

  it('calcula IVA 19% sobre subtotal neto', () => {
    useCartStore.getState().addToCart(variant('v1', 100000), 1);
    const t = useCartStore.getState().getCartTotals();
    expect(t.netSubtotal).toBe(100000);
    expect(t.tax).toBeCloseTo(19000);
    expect(t.total).toBeCloseTo(119000);
  });

  it('aplica descuento por ítem acotado al subtotal y descuento global %', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 50000), 2);
    s.applyItemDiscount('v1', 999999);
    expect(useCartStore.getState().cart[0].discount).toBe(100000);
    s.applyItemDiscount('v1', 0);
    s.setGlobalDiscount(10, 'percentage');
    expect(useCartStore.getState().getCartTotals().netSubtotal).toBe(90000);
  });

  it('cantidad <=0 elimina el ítem y clearCart vacía', () => {
    const s = useCartStore.getState();
    s.addToCart(variant('v1', 10), 1);
    s.updateCartQuantity('v1', 0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/store/cartStore.js';

const v = (id, price) => ({ id, price_override: price, product: { base_price: price } });

describe('cartStore', () => {
  beforeEach(() => useCartStore.getState().clearCart());

  it('adds items and merges same variant', () => {
    const s = useCartStore.getState();
    s.addToCart(v('a', 100), 1);
    s.addToCart(v('a', 100), 2);
    const { cart } = useCartStore.getState();
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
    expect(cart[0].total).toBe(300);
  });

  it('removes when quantity <= 0', () => {
    const s = useCartStore.getState();
    s.addToCart(v('a', 100), 1);
    s.updateCartQuantity('a', 0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  it('computes totals with item and percentage discounts', () => {
    const s = useCartStore.getState();
    s.addToCart(v('a', 100), 2);
    s.applyItemDiscount('a', 50);
    s.setGlobalDiscount(10, 'percentage');
    const t = useCartStore.getState().getCartTotals();
    expect(t.subtotal).toBe(200);
    expect(t.netSubtotal).toBeCloseTo(135);
    expect(t.total).toBeGreaterThan(t.netSubtotal);
  });

  it('clamps item discount to subtotal', () => {
    const s = useCartStore.getState();
    s.addToCart(v('a', 100), 1);
    s.applyItemDiscount('a', 999);
    expect(useCartStore.getState().cart[0].total).toBe(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../src/store/cartStore.js';

const v = (id, price) => ({ id, product: { base_price: price } });
beforeEach(() => useCartStore.setState({ cart: [], globalDiscount: 0, globalDiscountType: 'fixed' }));

describe('cartStore', () => {
  it('agrega y acumula cantidades de la misma variante', () => {
    const s = useCartStore.getState();
    s.addToCart(v('a', 50000), 1); useCartStore.getState().addToCart(v('a', 50000), 2);
    const { cart } = useCartStore.getState();
    expect(cart).toHaveLength(1); expect(cart[0].quantity).toBe(3); expect(cart[0].total).toBe(150000);
  });
  it('price_override tiene prioridad', () => {
    useCartStore.getState().addToCart({ id: 'b', price_override: 40000, product: { base_price: 50000 } });
    expect(useCartStore.getState().cart[0].unit_price).toBe(40000);
  });
  it('cantidad <= 0 elimina el ítem', () => {
    useCartStore.getState().addToCart(v('a', 100)); useCartStore.getState().updateCartQuantity('a', 0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  });
  it('descuento por ítem no excede el subtotal', () => {
    useCartStore.getState().addToCart(v('a', 100), 2); useCartStore.getState().applyItemDiscount('a', 9999);
    expect(useCartStore.getState().cart[0].total).toBe(0);
  });
});

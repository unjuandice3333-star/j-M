import { describe, it, expect } from 'vitest';
import { getProductImage, hasValidProductImage, normalizeStyleLine, DEFAULT_PRODUCT_FALLBACK } from '../src/utils/productUtils.js';
import { useCartStore } from '../src/store/cartStore.js';

describe('productUtils', () => {
  it('falls back when no image', () => expect(getProductImage({})).toBe(DEFAULT_PRODUCT_FALLBACK));
  it('uses images[]', () => expect(getProductImage({ images: ['a.jpg', 'b.jpg'] }, 1)).toBe('b.jpg'));
  it('detects valid image', () => { expect(hasValidProductImage({ image: 'x' })).toBe(true); expect(hasValidProductImage({ images: [' '] })).toBe(false); });
  it('normalizes style lines', () => { expect(normalizeStyleLine('Streetwear')).toBe('urbana'); expect(normalizeStyleLine(null)).toBe('todas'); });
});

describe('cartStore totals', () => {
  it('adds, merges and totals with IVA', () => {
    const s = useCartStore.getState(); s.clearCart();
    const v = { id: 'v1', price_override: 100 };
    s.addToCart(v, 1); useCartStore.getState().addToCart(v, 1);
    const t = useCartStore.getState().getCartTotals();
    expect(useCartStore.getState().cart[0].quantity).toBe(2);
    expect(t.subtotal).toBe(200); expect(t.total).toBeCloseTo(238);
  });
  it('removes on quantity 0', () => {
    const s = useCartStore.getState(); s.clearCart(); s.addToCart({ id: 'v2', price_override: 5 });
    useCartStore.getState().updateCartQuantity('v2', 0);
    expect(useCartStore.getState().cart).toHaveLength(0);
  });
});

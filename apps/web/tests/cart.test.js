import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/supabase', () => {
  const chain = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? undefined : chain),
    apply: () => chain,
  });
  return { default: { auth: { getSession: async () => ({ data: { session: null } }) }, from: () => chain }, supabase: {} };
});
vi.mock('../src/services/analytics', () => ({
  analyticsService: new Proxy({}, { get: () => () => {} }),
}));

import { useECommerceStore } from '../src/store/eCommerceStore';

const UUID = '11111111-1111-4111-8111-111111111111';
const product = { id: 'p1', name: 'Camisa', price: 100000, images: ['a.jpg'], variantId: UUID };

describe('storefront cart', () => {
  beforeEach(() => {
    useECommerceStore.setState({ items: [], appliedCoupon: null, activeCheckoutOrderId: null });
  });

  it('adds an item and merges the same size/color', () => {
    const s = useECommerceStore.getState();
    s.addItem(product, 'M', 'Negro', 1);
    useECommerceStore.getState().addItem(product, 'M', 'Negro', 2);
    const { items } = useECommerceStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    expect(items[0].variantId).toBe(UUID);
  });

  it('keeps different sizes as separate lines', () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro');
    useECommerceStore.getState().addItem(product, 'L', 'Negro');
    expect(useECommerceStore.getState().items).toHaveLength(2);
  });

  it('resolves variant from rawVariants by size and color', () => {
    const p = { ...product, variantId: undefined, rawVariants: [
      { id: UUID, size: 'M', color: 'Negro' },
      { id: '22222222-2222-4222-8222-222222222222', size: 'L', color: 'Negro' },
    ] };
    useECommerceStore.getState().addItem(p, 'M', 'Negro');
    expect(useECommerceStore.getState().items[0].variantId).toBe(UUID);
  });

  it('updateQuantity <= 0 removes the item', () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro');
    const id = useECommerceStore.getState().items[0].id;
    useECommerceStore.getState().updateQuantity(id, 0);
    expect(useECommerceStore.getState().items).toHaveLength(0);
  });

  it('does not clear the cart for a foreign order', () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro');
    useECommerceStore.setState({ activeCheckoutOrderId: 'A' });
    expect(useECommerceStore.getState().finalizePaidOrder('B')).toBe(false);
    expect(useECommerceStore.getState().items).toHaveLength(1);
  });

  it('clears the cart for the active checkout order', () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro');
    useECommerceStore.setState({ activeCheckoutOrderId: 'A' });
    useECommerceStore.getState().finalizePaidOrder('A');
    expect(useECommerceStore.getState().items).toHaveLength(0);
  });
});

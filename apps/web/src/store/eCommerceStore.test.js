import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../services/analytics', () => ({
  analyticsService: { addToCart: vi.fn(), removeFromCart: vi.fn() }
}));
vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));

const store = {};
vi.stubGlobal('localStorage', {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
});

const { useECommerceStore } = await import('./eCommerceStore');

const product = { id: 'p1', name: 'Camisa', price: 100000, image: 'x.jpg' };

describe('eCommerceStore cart', () => {
  beforeEach(() => {
    useECommerceStore.setState({
      items: [], appliedCoupon: null, syncCartWithServer: async () => {}
    });
  });

  it('agrega items y acumula cantidad sin mutar el estado previo', () => {
    const { addItem } = useECommerceStore.getState();
    addItem(product, 'M', 'Negro', 1);
    const before = useECommerceStore.getState().items;
    const firstRef = before[0];
    addItem(product, 'M', 'Negro', 2);
    const after = useECommerceStore.getState().items;
    expect(after).toHaveLength(1);
    expect(after[0].quantity).toBe(3);
    expect(firstRef.quantity).toBe(1); // inmutabilidad
  });

  it('distingue variantes por talla/color', () => {
    const { addItem } = useECommerceStore.getState();
    addItem(product, 'M', 'Negro');
    addItem(product, 'L', 'Negro');
    expect(useECommerceStore.getState().items).toHaveLength(2);
  });

  it('updateQuantity <= 0 elimina el item', () => {
    const { addItem, updateQuantity } = useECommerceStore.getState();
    addItem(product, 'M', 'Negro');
    const id = useECommerceStore.getState().items[0].id;
    updateQuantity(id, 0);
    expect(useECommerceStore.getState().items).toHaveLength(0);
  });

  it('calcula envío (15000 bajo umbral, gratis sobre 200000) y cupón', () => {
    const { addItem } = useECommerceStore.getState();
    addItem(product, 'M', 'Negro', 1);
    let t = useECommerceStore.getState().getTotals();
    expect(t.shippingCost).toBe(15000);
    expect(t.total).toBe(115000);
    addItem(product, 'M', 'Negro', 2);
    t = useECommerceStore.getState().getTotals();
    expect(t.hasFreeShipping).toBe(true);
    expect(t.total).toBe(300000);
    useECommerceStore.setState({ appliedCoupon: { percent: 10 } });
    t = useECommerceStore.getState().getTotals();
    expect(t.couponDiscount).toBe(30000);
    expect(t.total).toBe(270000);
  });
});

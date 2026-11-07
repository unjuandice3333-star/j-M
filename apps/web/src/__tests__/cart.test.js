import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

let storage;
let useECommerceStore, findVariant;

async function freshStore() {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  ({ useECommerceStore, findVariant } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
}

beforeEach(async () => {
  storage = memoryStorage();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  supa.state.rpc = {};
  supa.rpc.mockClear();
  await freshStore();
});

const product = makeProduct();
const items = () => useECommerceStore.getState().items;

describe('carrito: agregar', () => {
  it('agrega una variante exacta (talla + color) con su precio de BD', () => {
    const r = useECommerceStore.getState().addItem(product, 'M', 'Negro', 2);
    expect(r.ok).toBe(true);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ variantId: 'v-m-neg', size: 'M', color: 'Negro', price: 80000, quantity: 2 });
  });

  it('la misma variante suma cantidad, no duplica la línea; el color distingue variantes', () => {
    const s = useECommerceStore.getState();
    s.addItem(product, 'M', 'Negro', 1);
    s.addItem(product, 'M', 'negro', 2); // el color no distingue mayúsculas
    s.addItem(product, 'S', 'Blanco', 1);
    expect(items()).toHaveLength(2);
    expect(items().find((i) => i.variantId === 'v-m-neg').quantity).toBe(3);
  });

  it('rechaza combinaciones inexistentes', () => {
    const r = useECommerceStore.getState().addItem(product, 'XL', 'Negro');
    expect(r.ok).toBe(false);
    expect(items()).toHaveLength(0);
    expect(findVariant(product, 'XL', 'Negro')).toBeNull();
  });
});

describe('carrito: stock', () => {
  it('rechaza variantes agotadas', () => {
    const r = useECommerceStore.getState().addItem(product, 'M', 'Blanco');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/agotada/i);
  });

  it('no permite superar el stock disponible, ni sumando en varias veces', () => {
    const s = useECommerceStore.getState();
    expect(s.addItem(product, 'L', 'Negro', 1).ok).toBe(true);
    const r = s.addItem(product, 'L', 'Negro', 1);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Solo hay 1/);
    expect(items()[0].quantity).toBe(1);
    expect(useECommerceStore.getState().addItem(product, 'S', 'Blanco', 4).ok).toBe(false);
  });

  it('la cantidad se normaliza (decimales, negativos, texto)', () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro', 2.9);
    expect(items()[0].quantity).toBe(2);
    useECommerceStore.getState().clearCart();
    useECommerceStore.getState().addItem(product, 'M', 'Negro', -3);
    expect(items()[0].quantity).toBe(1);
  });
});

describe('carrito: cantidades y eliminación', () => {
  beforeEach(() => useECommerceStore.getState().addItem(product, 'M', 'Negro', 2));

  it('updateQuantity cambia la cantidad dentro del stock', () => {
    expect(useECommerceStore.getState().updateQuantity('v-m-neg', 4).ok).toBe(true);
    expect(items()[0].quantity).toBe(4);
  });
  it('updateQuantity no supera lo disponible', () => {
    const r = useECommerceStore.getState().updateQuantity('v-m-neg', 6);
    expect(r.ok).toBe(false);
    expect(items()[0].quantity).toBe(2);
  });
  it('cantidad 0 o negativa elimina la línea', () => {
    useECommerceStore.getState().updateQuantity('v-m-neg', 0);
    expect(items()).toHaveLength(0);
  });
  it('removeItem elimina solo esa línea', () => {
    useECommerceStore.getState().addItem(product, 'S', 'Blanco', 1);
    useECommerceStore.getState().removeItem('v-m-neg');
    expect(items().map((i) => i.variantId)).toEqual(['v-s-bla']);
  });
});

describe('carrito: cambio de talla/color (changeVariant)', () => {
  beforeEach(() => {
    useECommerceStore.setState({ products: [product] });
    useECommerceStore.getState().addItem(product, 'M', 'Negro', 2);
  });
  it('cambia de variante conservando la cantidad y toma el precio de la nueva variante', () => {
    const r = useECommerceStore.getState().changeVariant('v-m-neg', 'S', 'Blanco');
    expect(r.ok).toBe(true);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ variantId: 'v-s-bla', quantity: 2, price: 85000 });
  });
  it('es atómico: si no hay stock suficiente el carrito no cambia', () => {
    const before = JSON.stringify(items());
    const r = useECommerceStore.getState().changeVariant('v-m-neg', 'L', 'Negro'); // solo 1 disponible, hay 2
    expect(r.ok).toBe(false);
    expect(JSON.stringify(items())).toBe(before);
  });
  it('fusiona con la variante destino si ya existe y el stock alcanza', () => {
    useECommerceStore.getState().addItem(product, 'S', 'Blanco', 1);
    const r = useECommerceStore.getState().changeVariant('v-m-neg', 'S', 'Blanco');
    expect(r).toMatchObject({ ok: true, merged: true });
    expect(items()).toHaveLength(1);
    expect(items()[0].quantity).toBe(3);
  });
  it('rechaza una combinación inexistente', () => {
    expect(useECommerceStore.getState().changeVariant('v-m-neg', 'XXL', 'Negro').ok).toBe(false);
  });
});

describe('carrito: reconciliación con el catálogo', () => {
  it('retira productos que ya no existen o se agotaron y ajusta cantidades y precios', () => {
    const s = useECommerceStore.getState();
    s.addItem(product, 'M', 'Negro', 4);
    s.addItem(product, 'S', 'Blanco', 2);
    const cambiado = makeProduct({ rawVariants: [
      { id: 'v-m-neg', sku: 'x', size: 'M', color: 'Negro', price: 90000, available: 2 },
      { id: 'v-s-bla', sku: 'y', size: 'S', color: 'Blanco', price: 85000, available: 0 },
    ] });
    useECommerceStore.setState({ products: [cambiado] });
    useECommerceStore.getState().reconcileCart();
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ variantId: 'v-m-neg', quantity: 2, price: 90000 });
    expect(useECommerceStore.getState().cartNotice).toMatch(/se agotó/);
  });
});

describe('carrito: persistencia', () => {
  it('el carrito sobrevive a una recarga (rehidratación desde localStorage)', async () => {
    useECommerceStore.getState().addItem(product, 'M', 'Negro', 2);
    expect(storage.getItem('jm-fashion-store-cart-v14')).toContain('v-m-neg');
    await freshStore(); // nueva instancia de la app con el mismo almacenamiento
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ variantId: 'v-m-neg', quantity: 2 });
  });
  it('no persiste datos de catálogo ni estado de UI', () => {
    useECommerceStore.setState({ products: [product], isCartOpen: true });
    useECommerceStore.getState().addItem(product, 'M', 'Negro', 1);
    const saved = JSON.parse(storage.getItem('jm-fashion-store-cart-v14')).state;
    expect(saved.products).toBeUndefined();
    expect(saved.isCartOpen).toBeUndefined();
  });
  it('descarta carritos de versiones antiguas (catálogo simulado)', async () => {
    storage.setItem('jm-fashion-store-cart-v14', JSON.stringify({ version: 13, state: { items: [{ id: 'viejo' }] } }));
    await freshStore();
    expect(items()).toEqual([]);
  });
});

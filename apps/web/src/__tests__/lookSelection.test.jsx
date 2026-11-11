// @vitest-environment jsdom
// «Comprar el look completo»: talla y color elegidos por prenda (antes: la primera variante con stock, p. ej. XS).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

const db = { collections: [] };
vi.mock('../config/supabase', () => {
  const make = (table) => {
    const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: db[table] ?? [], error: null }) : () => q) });
    return q;
  };
  const client = { from: (t) => make(t), rpc: () => make('rpc'), storage: { from: () => make('s') }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { colorsInStock, sizesForColor, defaultLookSelection, changeLookColor, resolveLookSelection } from '../utils/lookSelection';
import { useECommerceStore } from '../store/eCommerceStore';
import { CompleteTheLook } from '../components/Product/CompleteTheLook';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const variant = (size, color, available) => ({ id: `${size}-${color}`, sku: `${size}-${color}`, size, color, colorId: color, available, price: 100000 });
const product = (over = {}) => ({
  id: 'p1', slug: 'polo', name: 'Polo Piqué', category: 'polos', categoryName: 'Polos', sizeGroup: 'alpha', fit: 'SLIM',
  price: 100000, images: [], imagesByColor: {}, color: 'Negro', colors: [{ name: 'Negro', hex: '#000' }, { name: 'Blanco', hex: '#fff' }],
  sizes: ['XS', 'S', 'M', 'L'], rawVariants: [variant('XS', 'Negro', 3), variant('S', 'Negro', 0), variant('M', 'Negro', 2), variant('M', 'Blanco', 4), variant('L', 'Blanco', 1)],
  inStock: true, stock: 10, details: [], description: '', ...over,
});
const cap = product({ id: 'c', slug: 'gorra', name: 'Gorra', category: 'accesorios', categoryName: 'Accesorios', sizeGroup: 'one_size',
  sizes: ['UNICA'], colors: [{ name: 'Negro' }], rawVariants: [variant('UNICA', 'Negro', 5)] });
const soldOut = product({ id: 'x', name: 'Chaqueta', rawVariants: [variant('M', 'Negro', 0)] });

describe('lookSelection', () => {
  it('colores con stock en el orden del producto y tallas por color con su disponible', () => {
    expect(colorsInStock(product())).toEqual(['Negro', 'Blanco']);
    expect(colorsInStock(soldOut)).toEqual([]);
    expect(sizesForColor(product(), 'Negro')).toEqual([{ size: 'XS', available: 3 }, { size: 'S', available: 0 }, { size: 'M', available: 2 }]);
  });
  it('no preselecciona talla salvo talla única o una sola disponible', () => {
    expect(defaultLookSelection(product())).toEqual({ color: 'Negro', size: null });
    expect(defaultLookSelection(cap)).toEqual({ color: 'Negro', size: 'UNICA' });
    expect(defaultLookSelection(product({ color: 'Rojo', rawVariants: [variant('M', 'Blanco', 1)] }))).toEqual({ color: 'Blanco', size: 'M' });
  });
  it('cambiar de color conserva la talla solo si sigue disponible', () => {
    expect(changeLookColor(product(), { color: 'Negro', size: 'M' }, 'Blanco')).toEqual({ color: 'Blanco', size: 'M' });
    expect(changeLookColor(product(), { color: 'Negro', size: 'XS' }, 'Blanco')).toEqual({ color: 'Blanco', size: null });
  });
  it('clasifica listas, sin talla y agotadas', () => {
    const r = resolveLookSelection([product(), cap, soldOut], { p1: { color: 'Negro', size: 'S' } });
    expect(r.missing.map((p) => p.id)).toEqual(['p1']); // S agotada en Negro
    expect(r.ready.map((x) => [x.product.id, x.size])).toEqual([['c', 'UNICA']]);
    expect(r.soldOut.map((p) => p.id)).toEqual(['x']);
  });
});

describe('CompleteTheLook — compra con talla por prenda', () => {
  let host, root;
  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    db.collections = [{ slug: 'look', name: 'Look urbano', subtitle: 'x', image_url: null,
      collection_products: [{ product_id: 'p1', position: 1 }, { product_id: 'c', position: 2 }, { product_id: 'x', position: 3 }] }];
    act(() => useECommerceStore.setState({ items: [], products: [product(), cap, soldOut], productsLoaded: true }));
    await act(async () => { root.render(<CompleteTheLook />); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const buy = () => [...host.querySelectorAll('button')].find((b) => /COMPRAR EL LOOK/.test(b.textContent));
  const select = (label) => host.querySelector(`select[aria-label="${label}"]`);
  const choose = (el, value) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  it('sin talla elegida no agrega nada y pide elegirla', () => {
    act(() => buy().click());
    expect(useECommerceStore.getState().items).toEqual([]);
    expect(host.querySelector('[data-testid="look-notice"]').textContent).toMatch(/Elige la talla de: Polo Piqué/);
  });

  it('agrega la talla y el color elegidos (no la primera con stock) y avisa de lo agotado', () => {
    expect(host.textContent).toMatch(/Agotado/);
    expect(host.textContent).toMatch(/Talla única/);
    const sizeSel = select('Talla de Polo Piqué');
    expect([...sizeSel.options].find((o) => o.value === 'S').disabled).toBe(true);
    choose(select('Color de Polo Piqué'), 'Blanco');
    choose(select('Talla de Polo Piqué'), 'L');
    act(() => buy().click());
    const items = useECommerceStore.getState().items.map((i) => [i.productId, i.size, i.color]);
    expect(items).toEqual([['p1', 'L', 'Blanco'], ['c', 'UNICA', 'Negro']]);
    const notice = host.querySelector('[data-testid="look-notice"]').textContent;
    expect(notice).toMatch(/2 prenda\(s\) agregada\(s\)/);
    expect(notice).toMatch(/Agotado: Chaqueta/);
    expect(host.textContent).toMatch(/Incluye 2 producto\(s\) disponible\(s\) de 3/);
  });
});

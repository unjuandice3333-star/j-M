// @vitest-environment jsdom
// «Agregar todo al carrito» de la lista de deseos: talla y color elegidos por prenda
// (antes: la primera variante con stock de cada favorito, p. ej. XS, sin preguntar).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => {
  const make = () => {
    const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
    return q;
  };
  const client = { from: () => make(), rpc: () => make(), storage: { from: () => make() }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { useECommerceStore } from '../store/eCommerceStore';
import { WishlistPage } from '../pages/WishlistPage';

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
const soldOut = product({ id: 'x', slug: 'chaqueta', name: 'Chaqueta', inStock: false, stock: 0, rawVariants: [variant('M', 'Negro', 0)] });

const reset = (wishlist) => useECommerceStore.setState({ items: [], products: [product(), cap, soldOut], productsLoaded: true, wishlist, wishlistOwner: null, wishlistError: null });

describe('moveWishlistToCart (store)', () => {
  beforeEach(() => act(() => reset(['p1', 'c', 'x'])));

  it('sin talla elegida no agrega nada e indica qué falta', () => {
    const r = useECommerceStore.getState().moveWishlistToCart({});
    expect(r).toMatchObject({ ok: false, added: 0, missing: ['Polo Piqué'] });
    expect(useECommerceStore.getState().items).toEqual([]);
  });

  it('agrega la talla y el color elegidos e informa las agotadas', () => {
    const r = useECommerceStore.getState().moveWishlistToCart({ p1: { color: 'Blanco', size: 'L' } });
    expect(r).toMatchObject({ ok: false, added: 2, missing: [], soldOut: ['Chaqueta'], failed: [] });
    expect(useECommerceStore.getState().items.map((i) => [i.productId, i.size, i.color])).toEqual([['p1', 'L', 'Blanco'], ['c', 'UNICA', 'Negro']]);
  });

  it('un favorito que ya no existe en el catálogo se informa sin bloquear al resto', () => {
    act(() => reset(['c', 'borrado']));
    const r = useECommerceStore.getState().moveWishlistToCart({});
    expect(r).toMatchObject({ ok: false, added: 1, failed: ['Producto no disponible'] });
  });
});

describe('WishlistPage — agregar todo con talla por prenda', () => {
  let host, root;
  beforeEach(async () => {
    act(() => reset(['p1', 'c', 'x']));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root.render(<MemoryRouter><WishlistPage /></MemoryRouter>); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const moveAll = () => [...host.querySelectorAll('button')].find((b) => /AGREGAR TODO AL CARRITO/.test(b.textContent));
  const select = (label) => host.querySelector(`select[aria-label="${label}"]`);
  const choose = (el, value) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const notice = () => host.querySelector('[data-testid="wishlist-notice"]').textContent;

  it('pide la talla antes de agregar y no agrega XS por defecto', () => {
    expect(host.querySelectorAll('[data-testid="wishlist-item"]').length).toBe(3);
    act(() => moveAll().click());
    expect(useECommerceStore.getState().items).toEqual([]);
    expect(notice()).toMatch(/Elige la talla de: Polo Piqué/);
  });

  it('agrega lo elegido y avisa de lo agotado', () => {
    expect([...select('Talla de Polo Piqué').options].find((o) => o.value === 'S').disabled).toBe(true);
    choose(select('Color de Polo Piqué'), 'Blanco');
    choose(select('Talla de Polo Piqué'), 'M');
    act(() => moveAll().click());
    expect(useECommerceStore.getState().items.map((i) => [i.productId, i.size, i.color])).toEqual([['p1', 'M', 'Blanco'], ['c', 'UNICA', 'Negro']]);
    expect(notice()).toMatch(/2 prenda\(s\) agregada\(s\) al carrito\./);
    expect(notice()).toMatch(/Agotado: Chaqueta/);
    expect(notice()).not.toMatch(/talla disponible por defecto/);
  });
});

// @vitest-environment jsdom
// Ejecución 123 (D96): la ficha de producto vuelve a leer la disponibilidad de sus variantes al volver a la
// pestaña (y al abrirse con un catálogo cargado hace rato). Si la talla elegida se agotó o bajó de la cantidad
// elegida, se avisa y se corrige; refrescar no borra la selección ni vuelve al inicio de la página.
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { act } from 'react-dom/test-utils';

const db = { availability: null, fail: false, calls: 0 };
vi.mock('../config/supabase', () => {
  const make = (table) => {
    const q = new Proxy({}, {
      get: (t, k) => {
        if (k !== 'then') return () => q;
        return (res) => {
          if (table !== 'v_variant_availability') return res({ data: [], error: null });
          db.calls += 1;
          if (db.fail) return res({ data: null, error: { message: 'sin conexión' } });
          return res({ data: Object.entries(db.availability ?? {}).map(([variant_id, available]) => ({ variant_id, available })), error: null });
        };
      },
    });
    return q;
  };
  const client = { from: (t) => make(t), rpc: () => make('rpc'), storage: { from: () => make('s') }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

import { useECommerceStore } from '../store/eCommerceStore';
import ProductDetailPage from '../pages/ProductDetailPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const scrollTo = vi.fn();
window.scrollTo = scrollTo;

const variant = (size, color, available) => ({ id: `${size}-${color}`, sku: `${size}-${color}`, size, color, colorId: color, available, price: 100000 });
const product = () => ({
  id: 'p1', slug: 'polo', name: 'Polo Piqué', category: 'polos', categoryName: 'Polos', sizeGroup: 'alpha', fit: 'SLIM',
  price: 100000, images: [], imagesByColor: {}, colors: [{ name: 'Negro', hex: '#000' }, { name: 'Blanco', hex: '#fff' }],
  sizes: ['S', 'M', 'L'], rawVariants: [variant('S', 'Negro', 2), variant('M', 'Negro', 5), variant('L', 'Negro', 1), variant('M', 'Blanco', 4)],
  inStock: true, stock: 12, details: [], description: '',
});
const BASE = { 'S-Negro': 2, 'M-Negro': 5, 'L-Negro': 1, 'M-Blanco': 4 };

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0)); });
const sizeBtn = (s) => host.querySelector(`button[aria-label="Talla ${s}"]`);
const plus = () => host.querySelector('button[aria-label="Aumentar cantidad"]');
const qty = () => plus().previousElementSibling.textContent;
const notice = () => host.querySelector('[data-testid="pdp-stock-notice"]');
const backToTab = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); }); await flush(); };
const mount = async ({ loadedAt = Date.now() } = {}) => {
  act(() => useECommerceStore.setState({ products: [product()], productsLoaded: true, productsLoadedAt: loadedAt, items: [] }));
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/producto/polo']}>
      <Routes><Route path="/producto/:slug" element={<ProductDetailPage />} /></Routes>
    </MemoryRouter>,
  ));
  await flush();
};

// el store importa productService de forma diferida: se precarga para que la primera prueba no dependa del tiempo de carga
beforeAll(async () => { await import('../services/productService'); });

beforeEach(() => {
  db.availability = { ...BASE }; db.fail = false; db.calls = 0;
  scrollTo.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('ficha de producto: disponibilidad al volver a la pestaña', () => {
  it('con el catálogo recién cargado no consulta al abrir; al volver a la pestaña sí', async () => {
    await mount();
    expect(db.calls).toBe(0);
    await backToTab();
    expect(db.calls).toBe(1);
  });

  it('con el catálogo cargado hace rato consulta al abrir y muestra lo que dice la BD', async () => {
    db.availability['S-Negro'] = 0;
    await mount({ loadedAt: Date.now() - 5 * 60_000 });
    expect(db.calls).toBe(1);
    expect(host.querySelector('button[aria-label="Talla S agotada"]').disabled).toBe(true);
  });

  it('la talla elegida se agota mientras el cliente estaba en otra pestaña → se desmarca y se avisa', async () => {
    await mount();
    act(() => sizeBtn('L').click());
    expect(sizeBtn('L').getAttribute('aria-pressed')).toBe('true');
    db.availability['L-Negro'] = 0;
    await backToTab();
    expect(sizeBtn('L')).toBeNull();
    const sold = host.querySelector('button[aria-label="Talla L agotada"]');
    expect(sold.disabled).toBe(true);
    expect(notice().getAttribute('role')).toBe('status');
    expect(notice().textContent).toBe('La talla L en Negro se acaba de agotar. Elige otra talla o color.');
    // elegir otra talla quita el aviso
    act(() => sizeBtn('M').click());
    expect(notice()).toBeNull();
  });

  it('quedan menos unidades que las elegidas → ajusta la cantidad y lo dice; «+» respeta el nuevo máximo', async () => {
    await mount();
    act(() => sizeBtn('M').click());
    act(() => plus().click()); act(() => plus().click()); act(() => plus().click());
    expect(qty()).toBe('4');
    db.availability['M-Negro'] = 2;
    await backToTab();
    expect(qty()).toBe('2');
    expect(plus().disabled).toBe(true);
    expect(notice().textContent).toBe('Solo quedan 2 unidad(es) de la talla M en Negro; ajustamos la cantidad.');
    expect(sizeBtn('M').getAttribute('aria-pressed')).toBe('true');
  });

  it('refrescar sin cambios en lo elegido no borra la selección ni vuelve al inicio de la página', async () => {
    await mount();
    act(() => sizeBtn('M').click());
    act(() => plus().click());
    const scrolls = scrollTo.mock.calls.length;
    db.availability['S-Negro'] = 0; // cambia otra talla
    await backToTab();
    expect(sizeBtn('M').getAttribute('aria-pressed')).toBe('true');
    expect(qty()).toBe('2');
    expect(notice()).toBeNull();
    expect(host.querySelector('button[aria-label="Talla S agotada"]')).not.toBeNull();
    expect(scrollTo.mock.calls.length).toBe(scrolls);
  });

  it('el producto entero se agota → «Producto agotado»', async () => {
    await mount();
    db.availability = { 'S-Negro': 0, 'M-Negro': 0, 'L-Negro': 0, 'M-Blanco': 0 };
    await backToTab();
    expect(host.textContent).toMatch(/Producto agotado/);
    expect(useECommerceStore.getState().products[0]).toMatchObject({ stock: 0, inStock: false });
  });

  it('si la consulta falla se conserva la disponibilidad conocida, sin avisos', async () => {
    await mount();
    act(() => sizeBtn('L').click());
    db.fail = true;
    await backToTab();
    expect(sizeBtn('L').getAttribute('aria-pressed')).toBe('true');
    expect(notice()).toBeNull();
  });
});

describe('store: refreshProductStock', () => {
  it('sin cambios no reemplaza el catálogo; con cambios solo cambia ese producto', async () => {
    const other = { ...product(), id: 'p2', slug: 'otro' };
    useECommerceStore.setState({ products: [product(), other] });
    const before = useECommerceStore.getState().products;
    await useECommerceStore.getState().refreshProductStock('p1');
    expect(useECommerceStore.getState().products).toBe(before);
    db.availability['M-Negro'] = 1;
    const updated = await useECommerceStore.getState().refreshProductStock('p1');
    const after = useECommerceStore.getState().products;
    expect(after).not.toBe(before);
    expect(after[1]).toBe(other);
    expect(updated.rawVariants.find((v) => v.id === 'M-Negro').available).toBe(1);
    expect(updated.stock).toBe(8);
    expect(await useECommerceStore.getState().refreshProductStock('no-existe')).toBeNull();
  });
});

// @vitest-environment jsdom
// Ejecución 146 (D123): la ficha de producto leía solo las 12 reseñas aprobadas más recientes y mostraba
// «(N opiniones)» sin forma de ver el resto; si la lectura fallaba la sección quedaba vacía sin aviso.
// Ahora: 12 por página con total real, «Ver más opiniones» (foco a la primera nueva), error con «Reintentar».
// Solo se simulan Supabase y la analítica; página, store y reviewsService son los reales.
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { act } from 'react-dom/test-utils';

const db = { reviews: [], failNext: 0, reads: [], filters: [] };
vi.mock('../config/supabase', () => {
  const make = (table) => {
    let range = null; let countExact = false; const eqs = [];
    const q = new Proxy({}, {
      get: (t, k) => {
        if (k === 'select') return (_c, opts) => { countExact = opts?.count === 'exact'; return q; };
        if (k === 'range') return (a, b) => { range = [a, b]; return q; };
        if (k === 'eq') return (c, v) => { eqs.push([c, v]); return q; };
        if (k !== 'then') return () => q;
        return (res) => {
          if (table !== 'product_reviews') return res({ data: [], error: null });
          db.reads.push(range); db.filters.push(eqs);
          if (db.failNext > 0) { db.failNext -= 1; return res({ data: null, error: { message: 'Failed to fetch' } }); }
          const rows = range ? db.reviews.slice(range[0], range[1] + 1) : db.reviews;
          return res({ data: rows.map((r) => ({ ...r })), error: null, count: countExact ? db.reviews.length : null });
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
window.scrollTo = vi.fn();

const product = (reviewCount) => ({
  id: 'p1', slug: 'polo', name: 'Polo Piqué', category: 'polos', categoryName: 'Polos', sizeGroup: 'alpha', fit: 'SLIM',
  price: 100000, images: [], imagesByColor: {}, colors: [{ name: 'Negro', hex: '#000' }], sizes: ['M'],
  rawVariants: [{ id: 'M-Negro', sku: 'M-Negro', size: 'M', color: 'Negro', colorId: 'Negro', available: 3, price: 100000 }],
  inStock: true, stock: 3, details: [], description: '', rating: reviewCount ? 4.5 : null, reviewCount,
});
const makeReviews = (n) => Array.from({ length: n }, (_, i) => ({
  id: `r${String(i).padStart(3, '0')}`, author_name: `Cliente ${i + 1}`, city: null, rating: 5, title: `Título ${i + 1}`,
  comment: `Comentario número ${i + 1}`, created_at: new Date(Date.now() - i * 60e3).toISOString(), is_verified_buyer: false, admin_reply: null,
}));

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); });
const cards = () => host.querySelectorAll('#opiniones [data-review-id]');
const box = () => host.querySelector('[data-testid="reviews-load-more"]');
const button = () => box()?.querySelector('button') ?? null;
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };
const mount = async (n) => {
  db.reviews = makeReviews(n);
  act(() => useECommerceStore.setState({ products: [product(n)], productsLoaded: true, productsLoadedAt: Date.now(), items: [] }));
  await act(async () => root.render(
    <MemoryRouter initialEntries={['/producto/polo']}>
      <Routes><Route path="/producto/:slug" element={<ProductDetailPage />} /></Routes>
    </MemoryRouter>,
  ));
  await flush();
};

beforeAll(async () => { await import('../services/productService'); });
beforeEach(() => {
  db.reviews = []; db.failNext = 0; db.reads = []; db.filters = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('ficha de producto: opiniones paginadas', () => {
  it('con 30 reseñas muestra 12, el total real y «Ver más opiniones»; pide un rango acotado y solo aprobadas', async () => {
    await mount(30);
    expect(cards()).toHaveLength(12);
    expect(db.reads.at(-1)).toEqual([0, 12]);
    expect(db.filters.at(-1)).toEqual(expect.arrayContaining([['product_id', 'p1'], ['status', 'approved']]));
    expect(box().textContent).toContain('Mostrando 12 de 30 opiniones');
    expect(button().textContent).toBe('Ver más opiniones');
  });

  it('«Ver más» amplía a 24 y luego a 30 sin duplicados; el foco pasa a la primera nueva y el botón desaparece', async () => {
    await mount(30);
    await click(button());
    expect(cards()).toHaveLength(24);
    expect(document.activeElement?.getAttribute('data-review-id')).toBe('r012');
    expect(box().textContent).toContain('Mostrando 24 de 30 opiniones');
    await click(button());
    const ids = [...cards()].map((c) => c.getAttribute('data-review-id'));
    expect(ids).toHaveLength(30);
    expect(new Set(ids).size).toBe(30);
    expect(document.activeElement?.getAttribute('data-review-id')).toBe('r024');
    expect(box()).toBeNull();
  });

  it('con 12 o menos no muestra el botón', async () => {
    await mount(12);
    expect(cards()).toHaveLength(12);
    expect(box()).toBeNull();
  });

  it('si falla «Ver más», conserva las 12 y avisa junto al botón; reintentar carga las siguientes', async () => {
    await mount(30);
    db.failNext = 1;
    await click(button());
    expect(cards()).toHaveLength(12);
    expect(box().querySelector('[role="alert"]').textContent).toMatch(/No pudimos cargar las opiniones/);
    expect(button().getAttribute('aria-describedby')).toBe('reviews-load-error');
    await click(button());
    expect(cards()).toHaveLength(24);
    expect(box().querySelector('[role="alert"]')).toBeNull();
  });

  it('si la primera lectura falla, avisa (antes: sección vacía en silencio) y «Reintentar» carga la primera página', async () => {
    db.failNext = 1;
    await mount(30);
    expect(cards()).toHaveLength(0);
    expect(box().querySelector('[role="alert"]').textContent).toMatch(/No pudimos cargar las opiniones/);
    expect(button().textContent).toBe('Reintentar');
    await click(button());
    expect(cards()).toHaveLength(12);
    expect(db.reads.at(-1)).toEqual([0, 12]);
  });
});

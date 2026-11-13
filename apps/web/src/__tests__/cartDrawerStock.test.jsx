// @vitest-environment jsdom
// Ejecución 120 (D93): el carrito lateral avisa por línea (como /carrito, D92) cuando la BD informa que una variante se
// agotó o tiene menos stock, y permite quitarla o ajustarla. Cotiza al abrirse y al volver a la pestaña.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => {
  const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
  const client = { from: () => q, storage: { from: () => q }, auth: { getSession: async () => ({ data: { session: null } }) } };
  return { default: client, supabase: client };
});

import productService from '../services/productService';
import { orderService } from '../services/orderService';
import { __resetStorefrontTaxonomyCache } from '../hooks/useStorefrontTaxonomy';
import { useECommerceStore } from '../store/eCommerceStore';
import { Header } from '../components/Header/Header';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const A = { id: 'l1', productId: 'p1', variantId: 'v1', name: 'Camiseta Básica', size: 'M', color: 'Negro', price: 50000, quantity: 3, available: 5, image: '/x.jpg' };
const B = { id: 'l2', productId: 'p2', variantId: 'v2', name: 'Pantalón Chino', size: '32', color: 'Beige', price: 120000, quantity: 1, available: 4, image: '/y.jpg' };
const line = (variant_id, quantity, available, price) => ({
  variant_id, product_name: 'x', size_code: 'M', color_name: 'Negro', unit_price: price, quantity, line_total: price * quantity, available, in_stock: available >= quantity,
});
const quoteOf = (lines) => ({
  subtotal: lines.reduce((s, l) => s + l.line_total, 0), discount_total: 0, shipping_cost: 0,
  total: lines.reduce((s, l) => s + l.line_total, 0), can_checkout: lines.every((l) => l.in_stock), coupon: null, lines,
});

describe('carrito lateral: stock de la BD por línea', () => {
  let root; let el; let quote;
  beforeEach(() => {
    __resetStorefrontTaxonomyCache();
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(null);
    quote = vi.spyOn(orderService, 'quote');
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    useECommerceStore.setState({ products: [], items: [{ ...A }, { ...B }], quote: null, appliedCoupon: null, isMobileMenuOpen: false, isCartOpen: true, siteContent: {}, siteContentError: null, loadSiteContent: async () => {} });
  });
  afterEach(() => { act(() => root.unmount()); el.remove(); vi.restoreAllMocks(); useECommerceStore.setState({ isCartOpen: false, items: [], quote: null }); });
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const render = async (path = '/') => { await act(async () => { root.render(<MemoryRouter initialEntries={[path]}><Header /></MemoryRouter>); }); await flush(); };
  const dlg = () => document.querySelector('[role="dialog"]');
  const btn = (re) => [...dlg().querySelectorAll('button')].find((b) => re.test(b.textContent));

  it('al abrirse cotiza y marca la línea agotada y la que tiene menos stock', async () => {
    quote.mockResolvedValue(quoteOf([line('v1', 3, 1, 50000), line('v2', 1, 0, 120000)]));
    await render();
    expect(quote).toHaveBeenCalledTimes(1);
    const short = [...dlg().querySelectorAll('.drawer-line[data-stock-short="true"]')];
    expect(short).toHaveLength(2);
    expect(short[0].querySelector('.drawer-line-stock').textContent).toContain('Solo quedan 1; tienes 3 en el carrito.');
    expect(short[1].querySelector('.drawer-line-stock').textContent).toContain('Agotado');
    expect(dlg().querySelector('.drawer-stock-summary').textContent).toContain('2 prendas');
    // «+» queda limitado por la disponibilidad de la BD
    expect(useECommerceStore.getState().items[0].available).toBe(1);
  });

  it('«Ajustar a N» y «Quitar del carrito» actúan solo sobre su línea y lo anuncian', async () => {
    quote.mockResolvedValue(quoteOf([line('v1', 3, 1, 50000), line('v2', 1, 0, 120000)]));
    await render();
    // la siguiente cotización (carrito nuevo): v2 sigue agotada
    quote.mockResolvedValue(quoteOf([line('v1', 1, 1, 50000), line('v2', 1, 0, 120000)]));
    await act(async () => { btn(/^Ajustar a 1$/).click(); });
    await flush();
    let items = useECommerceStore.getState().items;
    expect(items.find((i) => i.variantId === 'v1')).toMatchObject({ quantity: 1, available: 1 });
    expect(items.find((i) => i.variantId === 'v2').quantity).toBe(1); // la otra línea no se toca
    expect(dlg().querySelectorAll('.drawer-line[data-stock-short="true"]')).toHaveLength(1);
    quote.mockResolvedValue(quoteOf([line('v1', 1, 1, 50000)]));
    await act(async () => { btn(/^Quitar del carrito$/).click(); });
    await flush();
    items = useECommerceStore.getState().items;
    expect(items.map((i) => i.variantId)).toEqual(['v1']);
    expect(dlg().querySelector('.drawer-line[data-stock-short]')).toBeNull();
    expect(dlg().querySelector('[role="status"]').textContent).toMatch(/Quitamos Pantalón Chino \(32, Beige\): está agotado/);
  });

  it('«Ajustar el carrito al stock disponible» resuelve todas las líneas a la vez', async () => {
    quote.mockResolvedValue(quoteOf([line('v1', 3, 2, 50000), line('v2', 1, 0, 120000)]));
    await render();
    await act(async () => { btn(/Ajustar el carrito al stock disponible/).click(); });
    expect(useECommerceStore.getState().items).toEqual([expect.objectContaining({ variantId: 'v1', quantity: 2 })]);
  });

  it('con stock suficiente no muestra avisos; al volver a la pestaña vuelve a cotizar y detecta el agotado', async () => {
    quote.mockResolvedValue(quoteOf([line('v1', 3, 5, 50000), line('v2', 1, 4, 120000)]));
    await render();
    expect(dlg().querySelector('[role="alert"]')).toBeNull();
    quote.mockResolvedValue(quoteOf([line('v1', 3, 5, 50000), line('v2', 1, 0, 120000)]));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(quote).toHaveBeenCalledTimes(2);
    expect(dlg().querySelectorAll('.drawer-line[data-stock-short="true"]')).toHaveLength(1);
  });

  it('en /checkout no cotiza (no pisa la cotización de la página con su método de envío)', async () => {
    quote.mockResolvedValue(quoteOf([line('v1', 3, 1, 50000), line('v2', 1, 0, 120000)]));
    await render('/checkout');
    expect(quote).not.toHaveBeenCalled();
  });

  it('sin conexión no rompe el carrito ni muestra avisos de stock', async () => {
    quote.mockRejectedValue(new Error('Failed to fetch'));
    await render();
    expect(dlg().querySelector('.drawer-line[data-stock-short]')).toBeNull();
    expect(useECommerceStore.getState().items).toHaveLength(2);
  });
});

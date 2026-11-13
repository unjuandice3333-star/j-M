// @vitest-environment jsdom
// Ejecución 119 (D92): variante agotada (o con menos stock) mientras está en el carrito → aviso en /carrito antes del checkout.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => navigate,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CartPage, orderSvc, host, root;

const line = (variant_id, quantity, available, over = {}) => ({
  variant_id, product_name: 'Camiseta Básica', size_code: 'M', color_name: 'Negro', unit_price: 80000, quantity,
  line_total: 80000 * quantity, available, in_stock: available >= quantity, ...over,
});
const quoteOf = (lines) => ({
  subtotal: lines.reduce((s, l) => s + l.line_total, 0), discount_total: 0, shipping_cost: 0,
  total: lines.reduce((s, l) => s + l.line_total, 0), can_checkout: lines.every((l) => l.in_stock), coupon: null, lines,
});

beforeEach(async () => {
  vi.resetModules();
  navigate.mockReset();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  orderSvc = await import('../services/orderService.js');
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({ loadProducts: async () => {} });
  ({ CartPage } = await import('../pages/CartPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async () => { await act(async () => root.render(<CartPage />)); await flush(); };
const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
const checkoutBtn = () => btn(/PROCEDER|CHECKOUT|PAGAR/i);

describe('carrito: stock de la BD (refreshQuote / fitCartToStock)', () => {
  it('refreshQuote actualiza la disponibilidad de la línea con la de la BD y «+» ya no la supera', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 2); // catálogo: 5 disponibles
    vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(quoteOf([line('v-m-neg', 2, 2)]));
    await useECommerceStore.getState().refreshQuote();
    const it0 = useECommerceStore.getState().items[0];
    expect(it0.available).toBe(2);
    expect(it0.quantity).toBe(2);
    const r = useECommerceStore.getState().updateQuantity(it0.id, 3);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Solo hay 2/);
  });

  it('fitCartToStock quita lo agotado y baja la cantidad al disponible, y no hace nada con una cotización vieja', async () => {
    const p = makeProduct();
    useECommerceStore.getState().addItem(p, 'M', 'Negro', 3);
    useECommerceStore.getState().addItem(p, 'S', 'Blanco', 1);
    vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(quoteOf([line('v-m-neg', 3, 1), line('v-s-bla', 1, 0, { size_code: 'S', color_name: 'Blanco' })]));
    await useECommerceStore.getState().refreshQuote();
    // Cotización vieja (el carrito cambió después): no se toca nada.
    const saved = useECommerceStore.getState().quote;
    useECommerceStore.setState({ quote: { ...saved, signature: 'otra' } });
    expect(useECommerceStore.getState().fitCartToStock().ok).toBe(false);
    useECommerceStore.setState({ quote: saved });
    const r = useECommerceStore.getState().fitCartToStock();
    expect(r.ok).toBe(true);
    expect(r.changes.join(' ')).toMatch(/Quitamos Camiseta Básica \(S, Blanco\): está agotado/);
    expect(r.changes.join(' ')).toMatch(/cantidad ajustada a 1/);
    const items = useECommerceStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ variantId: 'v-m-neg', quantity: 1, available: 1 });
    expect(useECommerceStore.getState().quote).toBeNull();
  });
});

describe('CartPage: aviso por línea antes del checkout', () => {
  it('marca la línea agotada, bloquea el checkout y «Quitar del carrito» la retira', async () => {
    const p = makeProduct();
    useECommerceStore.getState().addItem(p, 'M', 'Negro', 1);
    useECommerceStore.getState().addItem(p, 'S', 'Blanco', 1);
    const quote = vi.spyOn(orderSvc.orderService, 'quote')
      .mockResolvedValueOnce(quoteOf([line('v-m-neg', 1, 5), line('v-s-bla', 1, 0, { size_code: 'S', color_name: 'Blanco' })]))
      .mockResolvedValue(quoteOf([line('v-m-neg', 1, 5)]));
    await mount();
    const short = host.querySelectorAll('[data-stock-short="true"]');
    expect(short).toHaveLength(1);
    expect(short[0].querySelector('[role="alert"]').textContent).toMatch(/Agotado: ya no quedan unidades/);
    expect(checkoutBtn().disabled).toBe(true);
    await act(async () => btn(/Quitar del carrito/).click());
    await flush();
    expect(useECommerceStore.getState().items.map((i) => i.variantId)).toEqual(['v-m-neg']);
    expect(host.querySelector('[data-stock-short="true"]')).toBeNull();
    expect(host.querySelector('[role="status"]').textContent).toMatch(/Quitamos Camiseta Básica \(S, Blanco\)/);
    expect(checkoutBtn().disabled).toBe(false);
    expect(quote).toHaveBeenCalledTimes(2);
  });

  it('con menos unidades que las del carrito ofrece «Ajustar a N» y el resumen ajusta todo', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 4);
    vi.spyOn(orderSvc.orderService, 'quote')
      .mockResolvedValueOnce(quoteOf([line('v-m-neg', 4, 2)]))
      .mockResolvedValue(quoteOf([line('v-m-neg', 2, 2)]));
    await mount();
    const alert = host.querySelector('[data-stock-short="true"] [role="alert"]');
    expect(alert.textContent).toMatch(/Solo quedan 2; tienes 4 en el carrito/);
    expect(btn(/^Ajustar a 2$/)).toBeTruthy();
    expect(host.textContent).toMatch(/solo quedan 2 unidad\(es\)/);
    await act(async () => btn(/Ajustar el carrito al stock disponible/).click());
    await flush();
    expect(useECommerceStore.getState().items[0].quantity).toBe(2);
    expect(checkoutBtn().disabled).toBe(false);
  });

  it('al volver a la pestaña vuelve a consultar el stock y avisa si se agotó mientras tanto', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    vi.spyOn(orderSvc.orderService, 'quote')
      .mockResolvedValueOnce(quoteOf([line('v-m-neg', 1, 5)]))
      .mockResolvedValue(quoteOf([line('v-m-neg', 1, 0)]));
    await mount();
    expect(host.querySelector('[data-stock-short="true"]')).toBeNull();
    expect(checkoutBtn().disabled).toBe(false);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(host.querySelector('[data-stock-short="true"] [role="alert"]').textContent).toMatch(/Agotado/);
    expect(checkoutBtn().disabled).toBe(true);
  });
});

// @vitest-environment jsdom
// Ejecución 121 (D94): en el checkout, las líneas que la BD marca sin stock se avisan por línea con «Quitar»/«Ajustar».
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => vi.fn(),
}));
const openWompiWidget = vi.fn(async () => ({}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CheckoutPage, orderSvc, host, root, quoteSpy;

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
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  orderSvc = await import('../services/orderService.js');
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({ loadProducts: async () => {} });
  ({ CheckoutPage } = await import('../pages/CheckoutPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async () => { await act(async () => root.render(<CheckoutPage />)); await flush(); };
const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));
const submitBtn = () => host.querySelector('button[type="submit"]');
const twoLines = () => {
  const p = makeProduct();
  useECommerceStore.getState().addItem(p, 'M', 'Negro', 3);
  useECommerceStore.getState().addItem(p, 'S', 'Blanco', 1);
};
const shortQuote = () => quoteOf([line('v-m-neg', 3, 1), line('v-s-bla', 1, 0, { size_code: 'S', color_name: 'Blanco' })]);

describe('checkout: stock insuficiente por línea', () => {
  it('marca cada línea sin stock con su acción y deja el botón de pago deshabilitado', async () => {
    twoLines();
    quoteSpy = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(shortQuote());
    await mount();
    const notes = [...host.querySelectorAll('.checkout-line-stock')].map((n) => n.textContent);
    expect(notes).toHaveLength(2);
    expect(notes.join(' | ')).toMatch(/Solo quedan 1\.Ajustar a 1/);
    expect(notes.join(' | ')).toMatch(/Agotado\.Quitar del carrito/);
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Camiseta Básica \(S, Blanco\): agotado/);
    expect(btn(/Ajustar el carrito al stock disponible/)).toBeTruthy();
    expect(submitBtn().disabled).toBe(true);
  });

  it('«Quitar del carrito» quita solo esa línea; «Ajustar a 1» baja la cantidad y se vuelve a cotizar', async () => {
    twoLines();
    quoteSpy = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(shortQuote());
    await mount();
    quoteSpy.mockResolvedValue(quoteOf([line('v-m-neg', 3, 1)]));
    await act(async () => btn(/^Quitar del carrito$/).click());
    await flush();
    let items = useECommerceStore.getState().items;
    expect(items.map((i) => i.variantId)).toEqual(['v-m-neg']);
    expect(host.textContent).toMatch(/Quitamos Camiseta Básica \(S, Blanco\)/);
    expect(host.querySelectorAll('.checkout-line-stock')).toHaveLength(1);

    quoteSpy.mockResolvedValue(quoteOf([line('v-m-neg', 1, 1)]));
    await act(async () => btn(/^Ajustar a 1$/).click());
    await flush();
    items = useECommerceStore.getState().items;
    expect(items[0]).toMatchObject({ variantId: 'v-m-neg', quantity: 1 });
    expect(host.querySelectorAll('.checkout-line-stock')).toHaveLength(0);
    expect(host.querySelector('[role="status"]').textContent).toMatch(/cantidad ajustada a 1/);
    expect(submitBtn().disabled).toBe(false);
  });

  it('«Ajustar el carrito al stock disponible» resuelve todas las líneas a la vez', async () => {
    twoLines();
    quoteSpy = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(shortQuote());
    await mount();
    quoteSpy.mockResolvedValue(quoteOf([line('v-m-neg', 1, 1)]));
    await act(async () => btn(/Ajustar el carrito al stock disponible/).click());
    await flush();
    expect(useECommerceStore.getState().items.map((i) => [i.variantId, i.quantity])).toEqual([['v-m-neg', 1]]);
    expect(submitBtn().disabled).toBe(false);
  });

  it('al volver a la pestaña vuelve a cotizar y avisa si otra compra agotó la variante', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 2);
    quoteSpy = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(quoteOf([line('v-m-neg', 2, 5)]));
    await mount();
    expect(host.querySelectorAll('.checkout-line-stock')).toHaveLength(0);
    quoteSpy.mockResolvedValue(quoteOf([line('v-m-neg', 2, 0)]));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    expect(host.querySelector('.checkout-line-stock').textContent).toMatch(/Agotado\.Quitar del carrito/);
  });

  it('si create_order falla por stock (carrera) se vuelve a cotizar y se señala la línea', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 2);
    quoteSpy = vi.spyOn(orderSvc.orderService, 'quote').mockResolvedValue(quoteOf([line('v-m-neg', 2, 5)]));
    useECommerceStore.setState({ createOrder: async () => { throw new orderSvc.OrderError('Stock insuficiente: Camiseta Básica', { hint: 'JM_OUT_OF_STOCK' }); } });
    await mount();
    const set = (name, value) => {
      const el = host.querySelector(`[name="${name}"]`);
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
    };
    set('firstName', 'Ana'); set('lastName', 'Gómez'); set('email', 'ana@example.com'); set('phone', '3001234567');
    set('department', 'Antioquia'); set('city', 'Medellín'); set('address', 'Calle 10 # 20-30');
    await flush();
    quoteSpy.mockResolvedValue(quoteOf([line('v-m-neg', 2, 1)]));
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(host.textContent).toMatch(/Stock insuficiente/);
    expect(host.querySelector('.checkout-line-stock').textContent).toMatch(/Solo quedan 1\.Ajustar a 1/);
    expect(openWompiWidget).not.toHaveBeenCalled();
  });
});

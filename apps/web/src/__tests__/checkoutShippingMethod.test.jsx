// @vitest-environment jsdom
// Selección del método de envío en el checkout: totales, carreras de cotización e idempotencia por método.
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

const STD = { code: 'standard', name: 'Estándar', cost: 12000, free_over_subtotal: 200000, eta_text: '2 a 5 días' };
const EXP = { code: 'express', name: 'Express', cost: 30000, free_over_subtotal: null, eta_text: '24 h' };
const product = makeProduct();
const quoteFor = (method, subtotal = 80000) => {
  const ship = method === 'express' ? 30000 : 12000;
  return { subtotal, discount_total: 0, shipping_cost: ship, total: subtotal + ship, can_checkout: true, lines: [] };
};

let store;
const S = () => store.getState();

beforeEach(async () => {
  vi.resetModules();
  openWompiWidget.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supa.state.rpc = {}; supa.rpc.mockClear();
  ({ useECommerceStore: store } = await import('../store/eCommerceStore.js'));
  await store.persist.rehydrate();
  store.setState({ products: [product], shippingMethods: [STD, EXP] });
});

describe('getTotals por método de envío (store)', () => {
  it('la estimación local usa la tarifa y el umbral del método elegido', () => {
    S().addItem(product, 'M', 'Negro', 3); // 240.000
    expect(S().getTotals('standard')).toMatchObject({ shippingCost: 0, total: 240000, isEstimate: true });
    // express no tiene umbral de envío gratis: cobra aunque el subtotal supere el de estándar
    expect(S().getTotals('express')).toMatchObject({ shippingCost: 30000, total: 270000, freeShippingThreshold: null, isEstimate: true });
  });

  it('sin argumento se comporta como estándar (carrito y resumen)', () => {
    S().addItem(product, 'M', 'Negro', 1);
    expect(S().getTotals()).toMatchObject({ shippingCost: 12000, total: 92000 });
  });

  it('una cotización de la BD de otro método NO se muestra como definitiva', async () => {
    supa.state.rpc.quote_cart = ({ p_shipping_method }) => ({ data: quoteFor(p_shipping_method), error: null });
    S().addItem(product, 'M', 'Negro', 1);
    await S().refreshQuote({ shippingMethod: 'standard' });
    expect(S().getTotals('standard')).toMatchObject({ shippingCost: 12000, isEstimate: false });
    const exp = S().getTotals('express');
    expect(exp.isEstimate).toBe(true);
    expect(exp.shippingCost).toBe(30000);
  });

  it('una cotización lenta y antigua no pisa a la más reciente', async () => {
    const pending = {};
    supa.state.rpc.quote_cart = ({ p_shipping_method }) => new Promise((resolve) => {
      pending[p_shipping_method] = () => resolve({ data: quoteFor(p_shipping_method), error: null });
    });
    S().addItem(product, 'M', 'Negro', 1);
    const first = S().refreshQuote({ shippingMethod: 'standard' });
    const second = S().refreshQuote({ shippingMethod: 'express' });
    await vi.waitFor(() => expect(Object.keys(pending)).toHaveLength(2));
    pending.express(); await second;
    pending.standard(); expect(await first).toBeNull();
    expect(S().quote.shippingMethod).toBe('express');
    expect(S().getTotals('express')).toMatchObject({ shippingCost: 30000, total: 110000, isEstimate: false });
  });
});

describe('CheckoutPage con varios métodos activos', () => {
  let host, root, createOrder, refreshQuote;
  const setup = async () => {
    createOrder = vi.fn(async () => ({ id: 'o1', order_number: 'JM-1', public_token: 't' }));
    refreshQuote = vi.fn(async () => null);
    store.setState({ loadProducts: async () => {}, refreshQuote, createOrder });
    const { CheckoutPage } = await import('../pages/CheckoutPage.jsx');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    S().addItem(product, 'M', 'Negro', 1);
    await act(async () => root.render(<CheckoutPage />));
  };
  const setField = (name, value) => {
    const el = host.querySelector(`[name="${name}"]`);
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };
  const fill = () => {
    for (const [k, v] of [['firstName', 'Ana'], ['lastName', 'Pérez'], ['email', 'a@b.co'], ['phone', '3001234567'],
      ['department', 'Antioquia'], ['city', 'Medellín'], ['address', 'Calle 10 # 20-30']]) setField(k, v);
  };
  const submit = async () => {
    await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  };
  const radio = (i) => host.querySelectorAll('input[name="shipping"]')[i];

  it('muestra ambos métodos, recotiza al cambiar y el total refleja el método elegido', async () => {
    await setup();
    expect(host.querySelectorAll('input[name="shipping"]')).toHaveLength(2);
    expect(radio(0).checked).toBe(true);
    await act(async () => { radio(1).click(); });
    expect(radio(1).checked).toBe(true);
    expect(refreshQuote).toHaveBeenLastCalledWith(expect.objectContaining({ shippingMethod: 'express' }));
    expect(host.textContent).toContain('110.000'); // 80.000 + 30.000 (estimación con la tarifa express)
  });

  it('crea el pedido con el método elegido y cambia la clave de idempotencia al cambiar de método', async () => {
    await setup();
    fill();
    await submit();
    const a = createOrder.mock.calls[0][0];
    expect(a.shippingMethod).toBe('standard');
    await act(async () => { radio(1).click(); });
    await submit();
    const b = createOrder.mock.calls[1][0];
    expect(b.shippingMethod).toBe('express');
    expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it('si el método elegido se desactiva, vuelve a estándar en vez de pedir uno inexistente', async () => {
    await setup();
    await act(async () => { radio(1).click(); });
    await act(async () => { store.setState({ shippingMethods: [STD] }); });
    expect(host.querySelectorAll('input[name="shipping"]')).toHaveLength(1);
    expect(radio(0).checked).toBe(true);
    fill();
    await submit();
    expect(createOrder.mock.calls.at(-1)[0].shippingMethod).toBe('standard');
  });
});

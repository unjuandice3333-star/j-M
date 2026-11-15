// @vitest-environment jsdom
// Ejecución 158 (D136): posventa en «Mis pedidos»: guía de envío en la tarjeta y solicitud de cambio por WhatsApp
// dentro de los 30 días desde la entrega (política publicada). Solo se simula Supabase; página y store son reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { orders: [], ordersError: null, rpc: {}, calls: [], selects: [] };
  const from = (table) => {
    const q = {
      select: (cols) => { state.selects.push({ table, cols }); return q; },
      eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, in: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (r, j) => {
        if (table !== 'online_orders') return Promise.resolve({ data: [], error: null }).then(r, j);
        const err = state.ordersError; state.ordersError = null;
        return Promise.resolve(err ? { data: null, error: err } : { data: state.orders.map((o) => ({ ...o })), error: null }).then(r, j);
      },
    };
    return q;
  };
  const rpc = vi.fn(async (name, args) => {
    state.calls.push({ name, args });
    const h = state.rpc[name];
    if (!h) return { data: [], error: null };
    try { return { data: typeof h === 'function' ? h(args) : h, error: null }; } catch (e) { return { data: null, error: e }; }
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
const openWompiWidget = vi.fn();
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const order = (over = {}) => ({
  id: ORDER_ID, order_number: 'JM-9', public_token: TOKEN, status: 'payment_pending', total: 92000, subtotal: 80000,
  discount_total: 0, shipping_cost: 12000, shipping_method_code: 'standard', created_at: new Date().toISOString(),
  payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
  online_order_items: [{ product_name: 'Blusa', size_code: 'M', color_name: 'Negro', quantity: 1, unit_price: 80000, line_total: 80000 }],
  ...over,
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  openWompiWidget.mockReset();
  supa = fakeSupabase();
  localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);

const mount = async () => {
  const { useAuthStore } = await import('../store/authStore');
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana Pérez', phone: '3001234567', role: 'customer' } });
  const { AccountPage } = await import('../pages/AccountPage');
  await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta']}><AccountPage /></MemoryRouter>); });
  await flush();
};


import { exchangeWindow, exchangeRequestUrl, trackingInfo } from '../utils/orderAftercare';

const DAY = 864e5;

describe('orderAftercare', () => {
  it('plazo de cambio: abierto antes de 30 días, cerrado después, null si no está entregado', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    expect(exchangeWindow({ status: 'delivered', delivered_at: new Date(now - 29 * DAY).toISOString() }, now).state).toBe('open');
    expect(exchangeWindow({ status: 'delivered', delivered_at: new Date(now - 31 * DAY).toISOString() }, now).state).toBe('closed');
    expect(exchangeWindow({ status: 'shipped', delivered_at: null }, now)).toBeNull();
    expect(exchangeWindow({ status: 'delivered', delivered_at: null }, now)).toBeNull();
    expect(exchangeWindow({ status: 'delivered', delivered_at: 'basura' }, now)).toBeNull();
  });
  it('el enlace de WhatsApp lleva el número del pedido y las prendas', () => {
    const url = exchangeRequestUrl(order({ order_number: 'JM-77' }));
    expect(url.startsWith('https://wa.me/')).toBe(true);
    const text = decodeURIComponent(url.split('?text=')[1]);
    expect(text).toContain('JM-77');
    expect(text).toContain('Blusa (talla M, Negro)');
  });
  it('guía: solo en enviado/entregado y el enlace solo si es https', () => {
    expect(trackingInfo({ status: 'paid', tracking_number: '123' })).toBeNull();
    expect(trackingInfo({ status: 'shipped', tracking_number: '  ' })).toBeNull();
    expect(trackingInfo({ status: 'shipped', carrier: 'Servientrega', tracking_number: '123', tracking_url: 'javascript:alert(1)' }))
      .toEqual({ carrier: 'Servientrega', number: '123', url: null });
    expect(trackingInfo({ status: 'delivered', tracking_number: '9', tracking_url: 'https://t.co/9' }).url).toBe('https://t.co/9');
  });
});

describe('«Mis pedidos»: posventa', () => {
  it('pedido enviado: muestra transportadora, guía y enlace de rastreo; sin cambio todavía', async () => {
    supa.state.orders = [order({ status: 'shipped', carrier: 'Servientrega', tracking_number: 'SV-123', tracking_url: 'https://rastreo.example/SV-123', payment_expires_at: null })];
    await mount();
    const t = q('order-tracking');
    expect(t).not.toBeNull();
    expect(t.textContent).toContain('Servientrega');
    expect(t.textContent).toContain('SV-123');
    expect(t.querySelector('a').getAttribute('href')).toBe('https://rastreo.example/SV-123');
    expect(t.querySelector('a').getAttribute('rel')).toContain('noopener');
    expect(q('order-exchange')).toBeNull();
    expect(q('order-exchange-closed')).toBeNull();
  });

  it('pedido entregado hace 3 días: ofrece «Solicitar cambio» con el número del pedido', async () => {
    supa.state.orders = [order({ status: 'delivered', order_number: 'JM-42', delivered_at: new Date(Date.now() - 3 * DAY).toISOString(), payment_expires_at: null })];
    await mount();
    const link = q('order-exchange-link');
    expect(link).not.toBeNull();
    expect(decodeURIComponent(link.getAttribute('href'))).toContain('JM-42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toContain('del pedido JM-42');
    expect(q('order-exchange').querySelector('a[href="/cambios-y-devoluciones"]')).not.toBeNull();
    expect(q('order-exchange-closed')).toBeNull();
  });

  it('pedido entregado hace 40 días: indica que el plazo terminó y no ofrece el enlace', async () => {
    supa.state.orders = [order({ status: 'delivered', delivered_at: new Date(Date.now() - 40 * DAY).toISOString(), payment_expires_at: null })];
    await mount();
    expect(q('order-exchange-link')).toBeNull();
    expect(q('order-exchange-closed').textContent).toContain('30 días');
  });

  it('pedido pendiente de pago: ni guía ni cambio', async () => {
    supa.state.orders = [order()];
    await mount();
    expect(q('order-tracking')).toBeNull();
    expect(q('order-exchange')).toBeNull();
  });
});

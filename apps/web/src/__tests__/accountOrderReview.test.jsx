// @vitest-environment jsdom
// Ejecución 125 (D98): «Mis pedidos» marca el pedido pagado que la tienda revisa («Pago recibido · en revisión» + aviso)
// y lee needs_attention (RLS: solo sus pedidos). Utilidad orderReview pura.
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

const mount = async () => {
  const { useAuthStore } = await import('../store/authStore');
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana Pérez', phone: '3001234567', role: 'customer' } });
  const { AccountPage } = await import('../pages/AccountPage');
  await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta']}><AccountPage /></MemoryRouter>); });
  await flush();
};


import { orderReviewKind, orderReviewMessage } from '../utils/orderReview';

describe('orderReview', () => {
  it('clasifica según la marca y el estado', () => {
    expect(orderReviewKind({ status: 'paid', under_review: true })).toBe('fulfillment');
    expect(orderReviewKind({ status: 'processing', needs_attention: true })).toBe('fulfillment');
    expect(orderReviewKind({ status: 'expired', needs_attention: true })).toBe('refund');
    expect(orderReviewKind({ status: 'shipped', needs_attention: true })).toBeNull();
    expect(orderReviewKind({ status: 'paid', needs_attention: false })).toBeNull();
    expect(orderReviewKind({ status: 'paid' })).toBeNull();
    expect(orderReviewKind(null)).toBeNull();
    // under_review (get_order_public) tiene prioridad sobre needs_attention
    expect(orderReviewKind({ status: 'paid', under_review: false, needs_attention: true })).toBeNull();
  });
  it('mensaje sin correo usa una fórmula genérica', () => {
    expect(orderReviewMessage({ status: 'paid', under_review: true })).toContain('te contactaremos');
    expect(orderReviewMessage({ status: 'paid', under_review: false })).toBeNull();
  });
});

describe('Mis pedidos: pedido en revisión', () => {
  it('lee needs_attention y muestra la insignia y el aviso solo en el pedido marcado', async () => {
    supa.state.orders = [
      order({ id: 'o-1', order_number: 'JM-1', status: 'paid', needs_attention: true, paid_at: new Date().toISOString() }),
      order({ id: 'o-2', order_number: 'JM-2', status: 'paid', needs_attention: false, paid_at: new Date().toISOString() }),
    ];
    await mount();
    expect(supa.state.selects.find((s) => s.table === 'online_orders').cols).toContain('needs_attention');
    const notices = container.querySelectorAll('[data-testid="order-review-notice"]');
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain('te escribiremos a ana@correo.com');
    expect(container.textContent).toContain('Pago recibido · en revisión');
    expect(container.textContent).toContain('Compra completada'); // el otro pedido
  });
});

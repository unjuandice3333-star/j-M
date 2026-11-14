// @vitest-environment jsdom
// Ejecución 127: un pedido `refunded` dice al cliente, en la confirmación/seguimiento y en «Mis pedidos», que el dinero
// vuelve (con el monto) y, si no llegó a despacharse, que no se enviará; sin «Pedido cerrado» ni promesa de despacho.
// Solo se simulan Supabase y el widget de Wompi; páginas, stores y servicios son reales.
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



const renderConfirmation = async () => {
  const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/checkout/confirmacion?order=JM-9&token=${TOKEN}`]}><OrderConfirmationPage /></MemoryRouter>);
  });
  await flush();
};

const publicOrder = (over = {}) => ({
  id: ORDER_ID, order_number: 'JM-9', status: 'refunded', status_label: 'Reembolsado', customer_name: 'Ana', customer_email: 'ana@x.co',
  payment_expires_at: null, under_review: false,
  shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method: 'standard' },
  subtotal: 80000, discount_total: 0, shipping_cost: 12000, total: 92000, items: [],
  timeline: [{ to_status: 'payment_pending' }, { to_status: 'paid' }, { to_status: 'refunded' }], ...over,
});
const refundNotice = () => container.querySelector('[data-testid="order-refund-notice"]');

import { orderRefundMessage, orderWasShipped } from '../utils/orderReview';
import { formatCOP } from '../utils/currency';

describe('orderRefundMessage', () => {
  it('solo para refunded; con monto y «no se enviará» si no se despachó', () => {
    expect(orderRefundMessage({ status: 'paid', total: 1000 }, formatCOP)).toBeNull();
    expect(orderRefundMessage({ status: 'cancelled', total: 1000 }, formatCOP)).toBeNull();
    expect(orderRefundMessage(null)).toBeNull();
    const m = orderRefundMessage({ status: 'refunded', total: 92000 }, formatCOP);
    expect(m).toContain(`Registramos la devolución de ${formatCOP(92000)}.`);
    expect(m).toContain('Este pedido no se enviará.');
    expect(orderRefundMessage({ status: 'refunded', total: 92000 })).toContain('Registramos la devolución. ');
  });
  it('despachado (guía, fechas o historial): sin «no se enviará»', () => {
    expect(orderWasShipped({ shipped_at: '2026-11-01' })).toBe(true);
    expect(orderWasShipped({ tracking: { tracking_number: 'G1' } })).toBe(true);
    expect(orderWasShipped({ timeline: [{ to_status: 'delivered' }] })).toBe(true);
    expect(orderWasShipped({ timeline: [{ to_status: 'paid' }], tracking: null })).toBe(false);
    expect(orderRefundMessage({ status: 'refunded', total: 5, delivered_at: '2026-11-02' }, formatCOP)).not.toContain('no se enviará');
  });
});

describe('Confirmación: pedido reembolsado', () => {
  it('título y aviso claros, sin «Pedido cerrado» ni promesa de despacho', async () => {
    supa.state.rpc.get_order_public = publicOrder();
    await renderConfirmation();
    expect(container.textContent).toContain('Pedido reembolsado · JM-9');
    expect(container.textContent).not.toContain('Pedido cerrado');
    expect(container.textContent).not.toContain('cuando despachemos');
    expect(refundNotice().textContent).toContain(`Registramos la devolución de ${formatCOP(92000)}`);
    expect(refundNotice().textContent).toContain('Este pedido no se enviará.');
    expect(container.querySelector('[aria-label="Estado del pedido"]')).toBeNull();
    expect(container.textContent).not.toContain('Pagar ahora');
  });
  it('sin status_label (fuente mínima): igual dice «Reembolsado»', async () => {
    supa.state.rpc.get_order_public = publicOrder({ status_label: undefined });
    await renderConfirmation();
    expect(container.textContent).toContain('Reembolsado');
  });
  it('reembolsado tras el envío: conserva la guía y no dice «no se enviará»', async () => {
    supa.state.rpc.get_order_public = publicOrder({ timeline: [{ to_status: 'shipped' }, { to_status: 'refunded' }], tracking: { carrier: 'Servientrega', tracking_number: 'G-77' } });
    await renderConfirmation();
    expect(refundNotice().textContent).not.toContain('no se enviará');
    expect(container.textContent).toContain('G-77');
  });
});

describe('Mis pedidos: pedido reembolsado', () => {
  it('insignia «Reembolsado» y aviso solo en ese pedido', async () => {
    supa.state.orders = [
      order({ id: 'o-1', order_number: 'JM-1', status: 'refunded', needs_attention: false, paid_at: new Date().toISOString() }),
      order({ id: 'o-2', order_number: 'JM-2', status: 'paid', needs_attention: false, paid_at: new Date().toISOString() }),
    ];
    await mount();
    const notices = container.querySelectorAll('[data-testid="order-refund-notice"]');
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain('Reembolso registrado.');
    expect(notices[0].textContent).toContain(`de ${formatCOP(92000)}`);
    expect(notices[0].textContent).toContain('Este pedido no se enviará.');
    expect(container.textContent).toContain('Reembolsado');
  });
});

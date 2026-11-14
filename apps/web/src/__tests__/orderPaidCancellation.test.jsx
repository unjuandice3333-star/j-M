// @vitest-environment jsdom
// Ejecución 128: pedido cancelado por el admin DESPUÉS de pagado → el cliente lee que el dinero vuelve (monto, plazo) y
// que no se enviará; un pedido cancelado sin pago conserva «Este pedido fue cancelado.». Supabase y Wompi simulados.
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
  id: ORDER_ID, order_number: 'JM-9', status: 'cancelled', status_label: 'Cancelado', customer_name: 'Ana', customer_email: 'ana@x.co',
  payment_expires_at: null, under_review: false,
  shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method: 'standard' },
  subtotal: 80000, discount_total: 0, shipping_cost: 12000, total: 92000, items: [],
  timeline: [{ to_status: 'payment_pending' }, { to_status: 'paid' }, { to_status: 'cancelled' }], ...over,
});
const refundNotice = () => container.querySelector('[data-testid="order-refund-notice"]');

import { orderPaidCancellationMessage, orderWasPaid } from '../utils/orderReview';
import { formatCOP } from '../utils/currency';

describe('orderPaidCancellationMessage', () => {
  it('solo cancelado con pago; con monto, plazo y «no se enviará»', () => {
    expect(orderPaidCancellationMessage({ status: 'cancelled', total: 1000 }, formatCOP)).toBeNull();
    expect(orderPaidCancellationMessage({ status: 'refunded', paid_at: 'x', total: 1000 }, formatCOP)).toBeNull();
    expect(orderPaidCancellationMessage({ status: 'paid', paid_at: 'x', total: 1000 }, formatCOP)).toBeNull();
    expect(orderPaidCancellationMessage(null)).toBeNull();
    const m = orderPaidCancellationMessage({ status: 'cancelled', paid_at: '2026-11-01', total: 92000 }, formatCOP);
    expect(m).toContain(`registramos la devolución de ${formatCOP(92000)}.`);
    expect(m).toContain('algunos días hábiles');
    expect(m).toContain('Este pedido no se enviará.');
  });
  it('el pago se detecta por paid_at o por el historial', () => {
    expect(orderWasPaid({ timeline: [{ to_status: 'payment_pending' }, { to_status: 'paid' }] })).toBe(true);
    expect(orderWasPaid({ timeline: [{ to_status: 'payment_pending' }, { to_status: 'cancelled' }] })).toBe(false);
    expect(orderWasPaid({ paid_at: '2026-11-01' })).toBe(true);
  });
  it('pago recibido después de cerrado (en revisión): lo cubre el aviso de revisión, no este', () => {
    expect(orderPaidCancellationMessage({ status: 'cancelled', paid_at: 'x', needs_attention: true, total: 5 }, formatCOP)).toBeNull();
  });
});

describe('Confirmación: pedido cancelado después de pagado', () => {
  it('título «Pedido cancelado» y aviso de devolución, sin «Pedido cerrado» ni promesa de despacho', async () => {
    supa.state.rpc.get_order_public = publicOrder();
    await renderConfirmation();
    expect(container.textContent).toContain('Pedido cancelado · JM-9');
    expect(container.textContent).not.toContain('Pedido cerrado');
    expect(container.textContent).not.toContain('Este pedido fue cancelado.');
    expect(container.textContent).not.toContain('cuando despachemos');
    expect(refundNotice().textContent).toContain(`registramos la devolución de ${formatCOP(92000)}`);
    expect(refundNotice().textContent).toContain('Este pedido no se enviará.');
    expect(container.textContent).not.toContain('Pagar ahora');
  });
  it('cancelado sin pago: conserva el texto anterior y no promete devolución', async () => {
    supa.state.rpc.get_order_public = publicOrder({ timeline: [{ to_status: 'payment_pending' }, { to_status: 'cancelled' }] });
    await renderConfirmation();
    expect(container.textContent).toContain('Este pedido fue cancelado.');
    expect(container.textContent).toContain('Pedido cerrado · JM-9');
    expect(refundNotice()).toBeNull();
  });
});

describe('Mis pedidos: pedido cancelado después de pagado', () => {
  it('aviso de devolución solo en el cancelado con pago', async () => {
    supa.state.orders = [
      order({ id: 'o-1', order_number: 'JM-1', status: 'cancelled', needs_attention: false, paid_at: new Date().toISOString() }),
      order({ id: 'o-2', order_number: 'JM-2', status: 'cancelled', needs_attention: false, paid_at: null }),
    ];
    await mount();
    const notices = container.querySelectorAll('[data-testid="order-refund-notice"]');
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toContain('Pedido cancelado · devolución registrada.');
    expect(notices[0].textContent).toContain(`de ${formatCOP(92000)}`);
    expect(notices[0].textContent).toContain('Este pedido no se enviará.');
  });
});

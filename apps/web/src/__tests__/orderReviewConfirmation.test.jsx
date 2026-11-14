// @vitest-environment jsdom
// Ejecución 125 (D98): la confirmación/seguimiento de un pedido pagado que la tienda debe revisar (p. ej. pagado tarde
// sin stock) avisa al cliente en lugar de prometer el despacho; sin detalle interno. Pedido cerrado con un pago
// recibido: aviso de devolución. Solo se simulan Supabase y el widget de Wompi; página, store y orderService son reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { rpc: {}, calls: [] };
  const rpc = vi.fn(async (name, args) => {
    state.calls.push({ name, args });
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    try { return { data: typeof h === 'function' ? h(args) : h, error: null }; }
    catch (e) { return { data: null, error: e }; }
  });
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, then: (r, j) => Promise.resolve({ data: [], error: null }).then(r, j) };
  return { state, rpc, from: () => q, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
const openWompiWidget = vi.fn();
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pending = (over = {}) => ({
  id: ORDER_ID, order_number: 'JM-7', status: 'payment_pending', status_label: 'Pendiente de pago',
  customer_name: 'Ana', customer_email: 'ana@x.co', payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
  shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method: 'standard' },
  subtotal: 80000, discount_total: 0, shipping_cost: 12000, total: 92000, items: [], timeline: [], ...over,
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
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };

const renderAt = async () => {
  const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/checkout/confirmacion?order=JM-7&token=${TOKEN}`]}><OrderConfirmationPage /></MemoryRouter>);
  });
  await flush();
};


const paid = (over = {}) => pending({ status: 'paid', status_label: 'Pagado', paid_at: new Date().toISOString(), ...over });
const notice = () => container.querySelector('[data-testid="order-review-notice"]');

describe('Confirmación: pedido en revisión', () => {
  it('pagado y en revisión: aviso con el correo, sin prometer el despacho', async () => {
    supa.state.rpc.get_order_public = paid({ under_review: true });
    await renderAt();
    expect(notice()).not.toBeNull();
    expect(notice().textContent).toContain('Pedido en revisión.');
    expect(notice().textContent).toContain('Estamos revisando la disponibilidad de tu pedido y te escribiremos a ana@x.co');
    expect(container.textContent).not.toContain('cuando despachemos tu pedido');
    expect(container.textContent).toContain('¡Gracias por tu compra!');
  });

  it('pagado sin revisión: confirmación normal', async () => {
    supa.state.rpc.get_order_public = paid({ under_review: false });
    await renderAt();
    expect(notice()).toBeNull();
    expect(container.textContent).toContain('Te avisaremos a ana@x.co cuando despachemos tu pedido.');
  });

  it('respuesta sin el campo (BD sin la migración 20261115120000): confirmación normal', async () => {
    supa.state.rpc.get_order_public = paid();
    await renderAt();
    expect(notice()).toBeNull();
    expect(container.textContent).toContain('cuando despachemos tu pedido');
  });

  it('pedido cancelado con un pago recibido: aviso de devolución', async () => {
    supa.state.rpc.get_order_public = pending({ status: 'cancelled', status_label: 'Cancelado', under_review: true });
    await renderAt();
    expect(notice().textContent).toContain('gestionar la devolución');
    expect(container.textContent).toContain('Este pedido fue cancelado.');
  });

  it('enviado (aunque tenga la marca): sin aviso', async () => {
    supa.state.rpc.get_order_public = paid({ status: 'shipped', status_label: 'Enviado', under_review: true });
    await renderAt();
    expect(notice()).toBeNull();
  });
});

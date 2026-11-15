// @vitest-environment jsdom
// Ejecución 155 (D133): en el detalle de pedido del admin, «GUARDAR CAMBIOS», «MARCAR COMO REVISADO» y «REEMBOLSAR Y
// CERRAR» se deshabilitan mientras guardan. Con un error general el detalle sigue abierto y Chromium dejaba el foco en
// <body>. jsdom conserva el foco en un botón deshabilitado: la pérdida se simula con blur() (igual que D130–D132).
// Se simula Supabase solo para cargar la lista; las acciones fallan con un error de red del servicio.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, rpcCalls: [] };
  const from = vi.fn((table) => {
    const rec = { table, eq: [], range: null, count: null, head: false };
    const q = {
      select: (_cols, opts) => { rec.count = opts?.count ?? null; rec.head = !!opts?.head; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: () => q, order: () => q, limit: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        const total = rows.length;
        if (rec.range) rows = rows.slice(rec.range[0], rec.range[1] + 1);
        return Promise.resolve({ data: rec.head ? null : rows, error: null, count: rec.count === 'exact' ? total : null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (name, args) => {
    state.rpcCalls.push([name, args]);
    const h = state.rpc[name];
    if (typeof h === 'function') return h(args);
    if (h === undefined) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ITEM = { variant_id: 'v-1', product_name: 'Polo Piqué', sku: 'JM-POL-001-BEIGE-M', size_code: 'M', color_name: 'Beige', unit_price: 80000, quantity: 2, line_total: 160000, image_url: null };
const ev = (event_type, created_at, extra = {}) => ({ event_type, from_status: null, to_status: null, actor: 'webhook', note: null, metadata: {}, created_at, ...extra });
const LATE_PAID = [
  ev('ORDER_CREATED', '2026-11-14T10:00:00Z', { to_status: 'payment_pending', actor: 'customer' }),
  ev('STATUS_CHANGED', '2026-11-14T11:00:00Z', { from_status: 'payment_pending', to_status: 'expired', actor: 'system', note: 'Ventana de pago vencida' }),
  ev('PAID_WITHOUT_STOCK', '2026-11-14T11:05:00Z', { from_status: 'expired', to_status: 'paid', metadata: { shortages: [{ variant_id: 'v-1', quantity: 2, available: 1 }] } }),
  ev('STATUS_CHANGED', '2026-11-14T11:05:00Z', { from_status: 'expired', to_status: 'paid' }),
];
const order = (extra = {}) => ({
  id: 'id-1', order_number: 'JM-000001', customer_name: 'Ana', customer_email: 'ana@x.co', customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 160000, discount_total: 0, shipping_cost: 0, total: 160000, coupon_code: null, status: 'paid',
  created_at: '2026-11-14T10:00:00Z', paid_at: '2026-11-14T11:05:00Z', needs_attention: true, tracking_number: null, carrier: null,
  tracking_url: null, user_id: null, online_order_items: [ITEM], payment_transactions: [{ reference: 'JM-000001-1', status: 'APPROVED' }],
  order_events: LATE_PAID, ...extra,
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.rpc.get_order_status_catalog = { transitions: [
    { from: 'paid', to: 'processing', actor: 'admin', requires_note: false },
    { from: 'paid', to: 'refunded', actor: 'admin', requires_note: true },
  ] };
  supa.state.rpc.admin_expire_pending_orders = 0;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const setup = async (method) => {
  const { adminService } = await import('../services/adminService');
  const d = deferred();
  const spy = vi.spyOn(adminService, method).mockReturnValue(d.promise);
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/admin/pedidos']}><Routes><Route path="/admin/pedidos" element={<AdminOrdersPage />} /></Routes></MemoryRouter>);
  });
  await flush();
  await act(async () => { [...container.querySelectorAll('tbody tr button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  return { d, spy };
};
const type = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const pressAndLoseFocus = async (btn) => {
  btn.focus();
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); btn.blur(); });
  expect(document.activeElement).toBe(document.body);
};
const failWith = async (d) => { await act(async () => { d.reject(new Error('Sin conexión con el servidor')); }); await flush(); };
const dialog = () => container.querySelector('[role="dialog"]');

describe('detalle de pedido del admin: error general al guardar → foco en el botón pulsado', () => {
  it('«GUARDAR CAMBIOS» (cambio de estado) con error de red', async () => {
    supa.state.tables.online_orders = [order()];
    const { d, spy } = await setup('transitionOrder');
    await type(container.querySelector('#order-next-status'), 'processing');
    const save = [...dialog().querySelectorAll('button')].find((b) => b.textContent.includes('GUARDAR CAMBIOS'));
    await pressAndLoseFocus(save);
    expect(spy).toHaveBeenCalled();
    await failWith(d);
    expect(dialog()).not.toBeNull();
    expect(container.querySelector('#order-modal-error').textContent).toContain('Sin conexión');
    expect(save.disabled).toBe(false);
    expect(document.activeElement).toBe(save);
  });

  it('«MARCAR COMO REVISADO» con error de red', async () => {
    supa.state.tables.online_orders = [order({ needs_attention: true })];
    const { d, spy } = await setup('resolveOrderAttention');
    await type(container.querySelector('#order-resolve-note'), 'Repuse 1 unidad');
    const btn = container.querySelector('[data-testid="order-resolve-attention"]');
    await pressAndLoseFocus(btn);
    expect(spy).toHaveBeenCalled();
    await failWith(d);
    expect(container.querySelector('#order-resolve-error').textContent).toContain('Sin conexión');
    expect(document.activeElement).toBe(btn);
  });

  it('«REEMBOLSAR Y CERRAR» con error de red', async () => {
    supa.state.tables.online_orders = [order({ needs_attention: true })];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { d, spy } = await setup('refundOrderAttention');
    await type(container.querySelector('#order-resolve-note'), 'Sin polo');
    const btn = container.querySelector('[data-testid="order-refund-attention"]');
    expect(btn).not.toBeNull();
    await pressAndLoseFocus(btn);
    expect(spy).toHaveBeenCalled();
    await failWith(d);
    expect(container.querySelector('#order-resolve-error').textContent).toContain('Sin conexión');
    expect(document.activeElement).toBe(btn);
  });

  it('si el admin ya movió el foco a otro sitio, no se le arrastra', async () => {
    supa.state.tables.online_orders = [order()];
    const { d } = await setup('transitionOrder');
    await type(container.querySelector('#order-next-status'), 'processing');
    const save = [...dialog().querySelectorAll('button')].find((b) => b.textContent.includes('GUARDAR CAMBIOS'));
    await pressAndLoseFocus(save);
    const note = container.querySelector('#order-note');
    note.focus();
    await failWith(d);
    expect(document.activeElement).toBe(note);
  });
});

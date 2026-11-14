// @vitest-environment jsdom
// Ejecución 129 (D102): el detalle del pedido del admin muestra el registro de devolución (order_refunds): monto,
// motivo, fecha, estado (registrada ≠ devuelta) y si el inventario se repuso; avisa que el dinero se devuelve en Wompi.
// Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { refundRecords, refundTotal, hasPendingRefund, refundStockText, refundStatusLabel, validateProviderRefundId } from '../utils/orderRefunds';

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

const REFUND = { id: 'ref-1', amount: 160000, reason: 'Cliente desistió', status: 'requested', restock: true, provider_refund_id: null, created_at: '2026-11-14T12:00:00Z' };
const order = (extra = {}) => ({
  id: 'id-1', order_number: 'JM-000001', customer_name: 'Ana', customer_email: 'ana@x.co', customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 160000, discount_total: 0, shipping_cost: 0, total: 160000, coupon_code: null, status: 'cancelled',
  created_at: '2026-11-14T10:00:00Z', paid_at: '2026-11-14T11:00:00Z', needs_attention: false, tracking_number: null, carrier: null,
  tracking_url: null, user_id: null, online_order_items: [], payment_transactions: [{ reference: 'JM-000001-1', status: 'APPROVED' }],
  order_events: [], order_refunds: [REFUND], ...extra,
});

describe('utils/orderRefunds', () => {
  it('ordena por fecha, normaliza y distingue registrada de devuelta', () => {
    const recs = refundRecords(order({ order_refunds: [
      { ...REFUND, created_at: '2026-11-15T00:00:00Z', status: 'processed', provider_refund_id: 'W-9', amount: '5000', restock: false },
      { ...REFUND, reason: '  ' },
    ] }));
    expect(recs.map((r) => r.createdAt)).toEqual(['2026-11-14T12:00:00Z', '2026-11-15T00:00:00Z']);
    expect(recs[0]).toMatchObject({ amount: 160000, reason: 'Sin motivo', pending: true, restock: true, statusLabel: 'Registrada · pendiente de hacer en Wompi' });
    expect(recs[1]).toMatchObject({ amount: 5000, pending: false, restock: false, providerRefundId: 'W-9', statusLabel: 'Devuelta' });
    expect(refundTotal(recs)).toBe(165000);
    expect(hasPendingRefund(recs)).toBe(true);
    expect(refundStockText(recs[1])).toMatch(/devolución/);
    expect(refundStatusLabel('rejected')).toBe('Rechazada');
  });

  it('las rechazadas no suman; sin registros no hay nada pendiente', () => {
    const recs = refundRecords(order({ order_refunds: [{ ...REFUND, status: 'rejected' }] }));
    expect(refundTotal(recs)).toBe(0);
    expect(hasPendingRefund(recs)).toBe(false);
    expect(refundRecords(order({ order_refunds: undefined }))).toEqual([]);
  });
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.rpc.get_order_status_catalog = { transitions: [] };
  supa.state.rpc.admin_expire_pending_orders = 0;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const render = async () => {
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/admin/pedidos']}><Routes><Route path="/admin/pedidos" element={<AdminOrdersPage />} /></Routes></MemoryRouter>);
  });
  await flush();
};
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(); };
const openFirst = async () => { await click([...container.querySelectorAll('tbody tr button')][0]); };

describe('AdminOrdersPage: devolución registrada', () => {
  it('pedido pagado y cancelado: monto, motivo, estado pendiente, inventario y la transacción a devolver en Wompi', async () => {
    supa.state.tables.online_orders = [order()];
    await render();
    await openFirst();
    const box = container.querySelector('[data-testid="order-refunds"]');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('DEVOLUCIÓN REGISTRADA');
    expect(box.textContent).toContain('Motivo: Cliente desistió');
    expect(box.textContent).toContain('Inventario repuesto al cancelar');
    expect(container.querySelector('[data-testid="order-refund-status"]').textContent).toBe('Estado: Registrada · pendiente de hacer en Wompi');
    expect(container.querySelector('[data-testid="order-refund-pending"]').textContent).toContain('JM-000001-1');
  });

  it('devolución ya hecha: muestra el id de Wompi y no pide hacerla', async () => {
    supa.state.tables.online_orders = [order({ status: 'refunded', order_refunds: [{ ...REFUND, status: 'processed', provider_refund_id: 'W-77' }] })];
    await render();
    await openFirst();
    expect(container.querySelector('[data-testid="order-refund-status"]').textContent).toBe('Estado: Devuelta · Wompi W-77');
    expect(container.querySelector('[data-testid="order-refund-pending"]')).toBeNull();
  });

  it('pedido cancelado sin pago: no hay sección de devolución', async () => {
    supa.state.tables.online_orders = [order({ paid_at: null, payment_transactions: [], order_refunds: [] })];
    await render();
    await openFirst();
    expect(container.querySelector('[data-testid="order-refunds"]')).toBeNull();
  });
});

describe('validateProviderRefundId (misma regla que admin_mark_refund_processed)', () => {
  it('obligatorio, sin espacios internos, ≤ 100 caracteres', () => {
    expect(validateProviderRefundId('  ')).toMatch(/Escribe el id/);
    expect(validateProviderRefundId('id con espacios')).toMatch(/solo admite/);
    expect(validateProviderRefundId('a'.repeat(101))).toMatch(/solo admite/);
    expect(validateProviderRefundId('  12345-1700000000-99999 ')).toBeNull();
  });
});

const input = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('AdminOrdersPage: marcar la devolución como hecha en Wompi (ejecución 130)', () => {
  it('sin id: error enlazado al campo, foco en él y sin llamar a la BD', async () => {
    supa.state.tables.online_orders = [order()];
    await render();
    await openFirst();
    await click(container.querySelector('[data-testid="order-refund-mark-processed"]'));
    const field = container.querySelector('[data-testid="order-refund-provider-id"]');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('order-refund-error-ref-1');
    expect(container.querySelector('#order-refund-error-ref-1').textContent).toMatch(/Escribe el id/);
    expect(document.activeElement).toBe(field);
    expect(supa.state.rpcCalls.some(([n]) => n === 'admin_mark_refund_processed')).toBe(false);
  });

  it('con id: llama a la RPC con la devolución y el id recortado, y avisa', async () => {
    supa.state.tables.online_orders = [order()];
    supa.state.rpc.admin_mark_refund_processed = { refund_id: 'ref-1', status: 'processed' };
    await render();
    await openFirst();
    await input(container.querySelector('[data-testid="order-refund-provider-id"]'), '  W-12345  ');
    await click(container.querySelector('[data-testid="order-refund-mark-processed"]'));
    expect(supa.state.rpcCalls.find(([n]) => n === 'admin_mark_refund_processed')[1])
      .toEqual({ p_refund_id: 'ref-1', p_provider_refund_id: 'W-12345' });
    expect(container.textContent).toContain('JM-000001: devolución de');
    expect(container.textContent).toContain('marcada como hecha en Wompi');
  });

  it('la BD la rechaza (otro admin ya la marcó): muestra el motivo junto al campo', async () => {
    supa.state.tables.online_orders = [order()];
    supa.state.rpc.admin_mark_refund_processed = () => ({ data: null, error: { message: 'La devolución ya no está pendiente', hint: 'JM_REFUND_NOT_PENDING', code: 'P0001' } });
    await render();
    await openFirst();
    await input(container.querySelector('[data-testid="order-refund-provider-id"]'), 'W-1');
    await click(container.querySelector('[data-testid="order-refund-mark-processed"]'));
    expect(container.querySelector('[data-testid="order-refund-error"]').textContent).toMatch(/ya no está pendiente/);
  });

  it('devolución ya hecha: sin campo ni botón', async () => {
    supa.state.tables.online_orders = [order({ order_refunds: [{ ...REFUND, status: 'processed', provider_refund_id: 'W-77' }] })];
    await render();
    await openFirst();
    expect(container.querySelector('[data-testid="order-refund-mark-processed"]')).toBeNull();
  });
});


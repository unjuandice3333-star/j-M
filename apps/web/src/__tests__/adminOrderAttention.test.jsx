// @vitest-environment jsdom
// Ejecución 124 (D97): un pedido «requiere revisión» explica la causa (pago tardío sin stock, pago a reembolsar,
// pago anulado) leída de order_events, el historial usa nombres legibles y el admin cierra la revisión con un motivo
// (admin_resolve_order_attention). Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { attentionReasons, eventText, validateResolveNote, canRefundFromAttention } from '../utils/orderAttention';

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

describe('utils/orderAttention', () => {
  it('pago tardío sin stock: causa con la línea (SKU, talla, color), lo pagado, lo disponible y lo que falta', () => {
    const [r] = attentionReasons(order());
    expect(r.kind).toBe('stock');
    expect(r.lines).toEqual([{ variantId: 'v-1', label: 'Polo Piqué · JM-POL-001-BEIGE-M · Talla M · Beige', quantity: 2, available: 1, missing: 1 }]);
  });

  it('reembolso y anulación se explican con su referencia; sin marca no hay causas', () => {
    const o = order({ order_events: [
      ev('PAYMENT_REQUIRES_REFUND', '2026-11-14T12:00:00Z', { metadata: { reference: 'JM-000001-2', order_status: 'cancelled' } }),
      ev('PAYMENT_VOIDED_AFTER_PAID', '2026-11-14T12:01:00Z', { metadata: { reference: 'JM-000001-1' } }),
    ] });
    const rs = attentionReasons(o);
    expect(rs.map((r) => r.kind)).toEqual(['refund', 'voided']);
    expect(rs[0].detail).toContain('JM-000001-2');
    expect(rs[0].detail).toContain('cancelado');
    expect(attentionReasons(order({ needs_attention: false }))).toEqual([]);
  });

  it('solo cuentan las causas posteriores al último cierre; sin causa reconocible hay una genérica', () => {
    const resolved = [...LATE_PAID, ev('ATTENTION_RESOLVED', '2026-11-14T13:00:00Z', { actor: 'admin', note: 'repuesto' })];
    expect(attentionReasons(order({ order_events: resolved })).map((r) => r.kind)).toEqual(['other']);
    const again = [...resolved, ev('PAYMENT_VOIDED_AFTER_PAID', '2026-11-14T14:00:00Z', { metadata: { reference: 'R' } })];
    expect(attentionReasons(order({ order_events: again })).map((r) => r.kind)).toEqual(['voided']);
  });

  it('historial legible y nota de cierre validada como en la BD', () => {
    expect(eventText(LATE_PAID[2], { paid: 'Pagado' })).toBe('Pagado sin stock suficiente → Pagado · Wompi (webhook)');
    expect(eventText(LATE_PAID[1], { expired: 'Vencido' })).toBe('Cambio de estado → Vencido · sistema · Ventana de pago vencida');
    expect(validateResolveNote('   ')).toMatch(/Escribe/);
    expect(validateResolveNote('a'.repeat(501))).toMatch(/500/);
    expect(validateResolveNote(' ok ')).toBeNull();
  });

  it('ejecución 126: el atajo de reembolso solo con marca y si la máquina de estados permite → refunded', () => {
    const tr = [{ from: 'paid', to: 'refunded', actor: 'admin' }, { from: 'paid', to: 'processing', actor: 'admin' }];
    expect(canRefundFromAttention(order(), tr)).toBe(true);
    expect(canRefundFromAttention(order({ needs_attention: false }), tr)).toBe(false);
    expect(canRefundFromAttention(order({ status: 'cancelled' }), tr)).toBe(false);
    expect(canRefundFromAttention(order(), [])).toBe(false);
    expect(eventText(ev('ATTENTION_RESOLVED', '2026-11-14T13:00:00Z', { actor: 'admin', note: 'sin polo', metadata: { refunded: true } })))
      .toBe('Revisión cerrada con reembolso · admin · sin polo');
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
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const openFirst = async () => { await click([...container.querySelectorAll('tbody tr button')][0]); };

describe('AdminOrdersPage: revisión del pedido', () => {
  it('el detalle explica el faltante y el historial no muestra códigos internos', async () => {
    supa.state.tables.online_orders = [order()];
    await render();
    await openFirst();
    const box = container.querySelector('[data-testid="order-attention"]');
    expect(box).not.toBeNull();
    expect(box.textContent).toContain('El pago llegó cuando ya no había stock');
    expect(container.querySelector('[data-testid="order-attention-shortage"]').textContent)
      .toBe('Polo Piqué · JM-POL-001-BEIGE-M · Talla M · Beige: pagó 2, había 1 disponible · faltan 1');
    const history = [...container.querySelectorAll('[data-testid="order-event"]')].map((li) => li.textContent).join('\n');
    expect(history).toContain('Pagado sin stock suficiente → Pagado · Wompi (webhook)');
    expect(history).not.toContain('PAID_WITHOUT_STOCK');
  });

  it('sin motivo no llama a la BD; con motivo cierra la revisión y recarga la lista', async () => {
    supa.state.tables.online_orders = [order()];
    supa.state.rpc.admin_resolve_order_attention = ({ p_order_id }) => {
      supa.state.tables.online_orders = supa.state.tables.online_orders.map((o) => (o.id === p_order_id ? { ...o, needs_attention: false } : o));
      return { data: { order_id: p_order_id, needs_attention: false }, error: null };
    };
    await render();
    await openFirst();
    await click(container.querySelector('[data-testid="order-resolve-attention"]'));
    const input = container.querySelector('#order-resolve-note');
    expect(container.querySelector('#order-resolve-error').textContent).toMatch(/Escribe cómo se resolvió/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('order-resolve-error');
    expect(supa.state.rpcCalls.some(([n]) => n === 'admin_resolve_order_attention')).toBe(false);

    await type(input, '  Repuse 1 unidad y despaché  ');
    await click(container.querySelector('[data-testid="order-resolve-attention"]'));
    expect(supa.state.rpcCalls.find(([n]) => n === 'admin_resolve_order_attention')[1])
      .toEqual({ p_order_id: 'id-1', p_note: 'Repuse 1 unidad y despaché' });
    expect(container.querySelector('[data-testid="order-attention"]')).toBeNull();
    expect(container.querySelector('[role="status"]').textContent).toBe('JM-000001: revisión cerrada.');
    expect(container.textContent).not.toContain('REQUIERE REVISIÓN');
  });

  it('si otro admin ya la cerró, se avisa en el detalle sin cerrarlo', async () => {
    supa.state.tables.online_orders = [order()];
    supa.state.rpc.admin_resolve_order_attention = () => ({ data: null, error: { message: 'x', hint: 'JM_ATTENTION_NOT_REQUIRED' } });
    await render();
    await openFirst();
    await type(container.querySelector('#order-resolve-note'), 'ok');
    await click(container.querySelector('[data-testid="order-resolve-attention"]'));
    expect(container.querySelector('#order-resolve-error').textContent).toMatch(/otro administrador/);
  });

  it('ejecución 126: «Reembolsar y cerrar» confirma, llama a la RPC atómica con el motivo y recarga', async () => {
    supa.state.tables.online_orders = [order()];
    supa.state.rpc.get_order_status_catalog = { transitions: [{ from: 'paid', to: 'refunded', actor: 'admin', requires_note: true }] };
    supa.state.rpc.admin_refund_order_attention = ({ p_order_id }) => {
      supa.state.tables.online_orders = supa.state.tables.online_orders.map((o) => (o.id === p_order_id ? { ...o, status: 'refunded', needs_attention: false } : o));
      return { data: { order_id: p_order_id, status: 'refunded', needs_attention: false }, error: null };
    };
    const confirm = vi.spyOn(window, 'confirm');
    await render();
    await openFirst();
    const btn = container.querySelector('[data-testid="order-refund-attention"]');
    expect(btn).not.toBeNull();
    // Sin motivo: aviso enlazado y sin confirmación ni llamada.
    await click(btn);
    expect(container.querySelector('#order-resolve-error').textContent).toMatch(/Escribe/);
    expect(confirm).not.toHaveBeenCalled();
    await type(container.querySelector('#order-resolve-note'), '  Sin polo: reembolsado en Wompi  ');
    // Cancelar la confirmación no llama a la BD.
    confirm.mockReturnValueOnce(false);
    await click(container.querySelector('[data-testid="order-refund-attention"]'));
    expect(confirm.mock.calls[0][0]).toMatch(/JM-000001.*\$\s?160\.000/s);
    expect(supa.state.rpcCalls.some(([n]) => n === 'admin_refund_order_attention')).toBe(false);
    confirm.mockReturnValueOnce(true);
    await click(container.querySelector('[data-testid="order-refund-attention"]'));
    expect(supa.state.rpcCalls.find(([n]) => n === 'admin_refund_order_attention')[1])
      .toEqual({ p_order_id: 'id-1', p_note: 'Sin polo: reembolsado en Wompi' });
    expect(supa.state.rpcCalls.some(([n]) => n === 'admin_transition_order' || n === 'admin_resolve_order_attention')).toBe(false);
    expect(container.querySelector('[role="status"]').textContent).toBe('JM-000001: reembolso registrado y revisión cerrada.');
    expect(container.textContent).not.toContain('REQUIERE REVISIÓN');
    confirm.mockRestore();
  });

  it('ejecución 126: sin transición → refunded (pedido cancelado con pago a reembolsar) no se ofrece el atajo', async () => {
    supa.state.tables.online_orders = [order({ status: 'cancelled', order_events: [ev('PAYMENT_REQUIRES_REFUND', '2026-11-14T12:00:00Z', { metadata: { reference: 'R', order_status: 'cancelled' } })] })];
    supa.state.rpc.get_order_status_catalog = { transitions: [{ from: 'paid', to: 'refunded', actor: 'admin', requires_note: true }] };
    await render();
    await openFirst();
    expect(container.querySelector('[data-testid="order-attention"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="order-refund-attention"]')).toBeNull();
    expect(container.querySelector('[data-testid="order-resolve-attention"]')).not.toBeNull();
  });

  it('un pedido sin marca no muestra el panel de revisión', async () => {
    supa.state.tables.online_orders = [order({ needs_attention: false, order_events: [] })];
    await render();
    await openFirst();
    expect(container.querySelector('[data-testid="order-attention"]')).toBeNull();
  });
});

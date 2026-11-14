// @vitest-environment jsdom
// Ejecución 131: devoluciones registradas que siguen pendientes de hacer en Wompi (`order_refunds.status = 'requested'`):
// tarjeta «DEVOLUCIONES PENDIENTES» del dashboard (conteo + monto, enlace a `/admin/pedidos?devolucion=pendiente`) y
// filtro en pedidos (embebido `pending_refunds:order_refunds!inner(id)` filtrado por estado). Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { summarizePendingRefunds, pendingRefundFromParam } from '../utils/orderRefunds';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, selects: [], fail: {} };
  const from = vi.fn((table) => {
    const rec = { table, eq: [], range: null, count: null, head: false, select: '' };
    const q = {
      select: (cols, opts) => { rec.select = cols; rec.count = opts?.count ?? null; rec.head = !!opts?.head; state.selects.push([table, cols]); return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: () => q, order: () => q, limit: () => q, maybeSingle: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        if (state.fail[table]) return Promise.resolve({ data: null, error: { message: 'fallo' }, count: null }).then(res, rej);
        let rows = table === 'order_refunds'
          ? (state.tables.online_orders ?? []).flatMap((o) => (o.order_refunds ?? []).map((r) => ({ ...r, order_id: o.id })))
          : state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => {
          // Embebido !inner con alias: solo filas padre con alguna devolución en ese estado (como PostgREST).
          if (c === 'pending_refunds.status') rows = rows.filter((r) => (r.order_refunds ?? []).some((x) => x.status === v));
          else rows = rows.filter((r) => r[c] === v);
        });
        const total = rows.length;
        if (rec.range) rows = rows.slice(rec.range[0], rec.range[1] + 1);
        return Promise.resolve({ data: rec.head ? null : rows, error: null, count: rec.count === 'exact' ? total : null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (name) => {
    const h = state.rpc[name];
    if (h === undefined) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const refund = (extra = {}) => ({ id: `ref-${Math.random()}`, amount: 160000, reason: 'Cliente desistió', status: 'requested', restock: true, provider_refund_id: null, created_at: '2026-11-14T12:00:00Z', ...extra });
const order = (n, extra = {}) => ({
  id: `id-${n}`, order_number: `JM-00000${n}`, customer_name: `Cliente ${n}`, customer_email: `c${n}@x.co`, customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 160000, discount_total: 0, shipping_cost: 0, total: 160000, coupon_code: null, status: 'cancelled',
  created_at: `2026-11-14T1${n}:00:00Z`, paid_at: '2026-11-14T11:00:00Z', needs_attention: false, tracking_number: null, carrier: null,
  tracking_url: null, user_id: null, online_order_items: [], payment_transactions: [], order_events: [], order_refunds: [], ...extra,
});

describe('utils/orderRefunds: devoluciones pendientes', () => {
  it('cuenta solo las `requested`, suma su monto y cuenta pedidos distintos', () => {
    expect(summarizePendingRefunds([
      { order_id: 'a', amount: '1000', status: 'requested' },
      { order_id: 'a', amount: 500, status: 'requested' },
      { order_id: 'b', amount: 2000, status: 'requested' },
      { order_id: 'c', amount: 9000, status: 'processed' },
      { order_id: 'd', amount: 9000, status: 'rejected' },
    ])).toEqual({ count: 3, amount: 3500, orders: 2 });
    expect(summarizePendingRefunds(null)).toEqual({ count: 0, amount: 0, orders: 0 });
  });
  it('solo `?devolucion=pendiente` activa el filtro', () => {
    expect(pendingRefundFromParam('pendiente')).toBe(true);
    expect(pendingRefundFromParam('1')).toBe(false);
    expect(pendingRefundFromParam(null)).toBe(false);
  });
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.tables.online_orders = [];
  supa.state.rpc.get_order_status_catalog = { transitions: [] };
  supa.state.rpc.admin_expire_pending_orders = 0;
  supa.state.rpc.admin_dashboard_metrics = { gross_sales: 0, paid_orders: 0, average_ticket: 0, units_sold: 0, orders_by_status: {}, low_stock_variants: 0, needs_attention: 0, top_products: [] };
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(); };
let lastLocation = null;
const LocationProbe = () => { lastLocation = useLocation(); return null; };

const renderDashboard = async () => {
  const { AdminDashboardPage } = await import('../pages/admin/AdminDashboardPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/admin']}><Routes>
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/pedidos" element={<LocationProbe />} />
    </Routes></MemoryRouter>);
  });
  await flush();
};
const renderOrders = async (url = '/admin/pedidos') => {
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/admin/pedidos" element={<><AdminOrdersPage /><LocationProbe /></>} /></Routes></MemoryRouter>);
  });
  await flush();
};
const refundCard = () => container.querySelector('a[aria-label^="Ver pedidos con devolución pendiente en Wompi"]');

describe('AdminDashboardPage: DEVOLUCIONES PENDIENTES', () => {
  it('muestra conteo y monto pendientes (de cualquier fecha) y enlaza al filtro de pedidos', async () => {
    supa.state.tables.online_orders = [
      order(1, { order_refunds: [refund({ amount: 160000 })] }),
      order(2, { order_refunds: [refund({ amount: 40000 }), refund({ amount: 9000, status: 'processed' })] }),
    ];
    await renderDashboard();
    const card = refundCard();
    expect(card).not.toBeNull();
    expect(card.getAttribute('href')).toBe('/admin/pedidos?devolucion=pendiente');
    expect(card.getAttribute('aria-label')).toBe('Ver pedidos con devolución pendiente en Wompi: 2 devoluciones');
    expect(card.textContent).toMatch(/200\.000 por devolver en Wompi/);
    expect(card.querySelector('[data-warn]').getAttribute('data-warn')).toBe('true');
    await click(card);
    expect(lastLocation.pathname).toBe('/admin/pedidos');
    expect(lastLocation.search).toBe('?devolucion=pendiente');
  });

  it('sin devoluciones pendientes: 0, sin alerta', async () => {
    supa.state.tables.online_orders = [order(1, { order_refunds: [refund({ status: 'processed' })] })];
    await renderDashboard();
    const card = refundCard();
    expect(card.getAttribute('aria-label')).toMatch(/: 0 devoluciones$/);
    expect(card.textContent).toContain('Nada pendiente de devolver en Wompi');
    expect(card.querySelector('[data-warn]').getAttribute('data-warn')).toBe('false');
  });

  it('si no se puede leer order_refunds lo dice (no muestra 0) y el resto del panel carga', async () => {
    supa.state.fail.order_refunds = true;
    await renderDashboard();
    const card = refundCard();
    expect(card.textContent).toContain('No se pudo contar las devoluciones pendientes.');
    expect(card.querySelector('[data-warn]').getAttribute('data-warn')).toBe('true');
    expect(container.textContent).toContain('VENTAS PAGADAS');
  });
});

describe('AdminOrdersPage: ?devolucion=pendiente', () => {
  const seed = () => {
    supa.state.tables.online_orders = [
      order(1, { order_refunds: [refund()] }),
      order(2, { order_refunds: [refund({ status: 'processed', provider_refund_id: 'W-1' })] }),
      order(3, { status: 'paid' }),
    ];
  };
  const rowNumbers = () => [...container.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
  const checkbox = () => [...container.querySelectorAll('label')].find((l) => l.textContent.startsWith('Solo con devolución pendiente en Wompi'));

  it('el enlace del dashboard filtra en la BD con un embebido !inner aparte y marca la fila', async () => {
    seed();
    await renderOrders('/admin/pedidos?devolucion=pendiente');
    expect(rowNumbers()).toEqual(['JM-000001']);
    expect(checkbox().querySelector('input').checked).toBe(true);
    expect(checkbox().textContent).toBe('Solo con devolución pendiente en Wompi (1)');
    const sel = supa.state.selects.filter(([t]) => t === 'online_orders').map(([, c]) => c).find((c) => c.includes('!inner'));
    expect(sel).toMatch(/pending_refunds:order_refunds!inner \( id \)/);
    // El detalle conserva TODAS las devoluciones del pedido (embebido sin filtrar).
    expect(sel).toMatch(/order_refunds \( id, amount, reason, status/);
    expect(container.querySelectorAll('[data-testid="order-row-pending-refund"]').length).toBe(1);
  });

  it('desmarcar el filtro quita el parámetro y muestra todos; marcarlo lo vuelve a poner', async () => {
    seed();
    await renderOrders('/admin/pedidos?devolucion=pendiente&estado=cancelled');
    await click(checkbox().querySelector('input'));
    expect(new URLSearchParams(lastLocation.search).get('devolucion')).toBeNull();
    expect(new URLSearchParams(lastLocation.search).get('estado')).toBe('cancelled');
    expect(rowNumbers().sort()).toEqual(['JM-000001', 'JM-000002']);
    await click(checkbox().querySelector('input'));
    expect(new URLSearchParams(lastLocation.search).get('devolucion')).toBe('pendiente');
    expect(rowNumbers()).toEqual(['JM-000001']);
  });

  it('otro valor de ?devolucion= se ignora', async () => {
    seed();
    await renderOrders('/admin/pedidos?devolucion=1');
    expect(rowNumbers().length).toBe(3);
    expect(checkbox().querySelector('input').checked).toBe(false);
  });
});

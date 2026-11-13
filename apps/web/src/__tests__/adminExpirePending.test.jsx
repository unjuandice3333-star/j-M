// @vitest-environment jsdom
// Ejecución 122 (D95): el panel del admin vence los pedidos `payment_pending` con la ventana de pago cumplida
// (admin_expire_pending_orders) ANTES de leer pedidos, inventario y métricas: sin pg_cron esos pedidos seguían
// «Pago pendiente» y su reserva bloqueaba stock. Si la función falla o no existe, el panel carga igual.
// Solo se simula Supabase; la BD falsa aplica la misma regla que expire_pending_orders.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, log: [], expireError: null, expireCalls: 0 };
  const from = vi.fn((table) => {
    const rec = { eq: [], range: null, count: null, head: false };
    const q = {
      select: (_c, opts) => { rec.count = opts?.count ?? null; rec.head = !!opts?.head; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: () => q, order: () => q, limit: () => q, in: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        state.log.push(`from:${table}`);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        const total = rows.length;
        if (rec.range) rows = rows.slice(rec.range[0], rec.range[1] + 1);
        return Promise.resolve({ data: rec.head ? null : rows, error: null, count: rec.count === 'exact' ? total : null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (name) => {
    state.log.push(`rpc:${name}`);
    if (name === 'admin_expire_pending_orders') {
      state.expireCalls += 1;
      if (state.expireError) return { data: null, error: state.expireError };
      let n = 0;
      for (const o of state.tables.online_orders ?? []) {
        if (o.status === 'payment_pending' && new Date(o.payment_expires_at) <= new Date()) {
          o.status = 'expired'; n += 1;
          for (const it of o.items) { const i = state.tables.inventories.find((x) => x.variant_id === it.variant_id); i.reserved -= it.quantity; }
        }
      }
      return { data: n, error: null };
    }
    const h = state.rpc[name];
    return h ? { data: h, error: null } : { data: null, error: { message: `rpc ${name} no programada` } };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const past = () => new Date(Date.now() - 60e3).toISOString();
const future = () => new Date(Date.now() + 30 * 60e3).toISOString();
const order = (n, status, expiresAt, items = []) => ({
  id: `id-${n}`, order_number: `JM-${n}`, customer_name: `Cliente ${n}`, customer_email: `c${n}@x.co`, customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 100000, discount_total: 0, shipping_cost: 0, total: 100000, coupon_code: null, status, payment_expires_at: expiresAt,
  created_at: '2026-01-01T10:00:00Z', paid_at: null, needs_attention: false, tracking_number: null, carrier: null,
  tracking_url: null, notes: null, user_id: null, online_order_items: [], payment_transactions: [], order_events: [], items,
});
const inv = (sku, stock, reserved) => ({
  id: `inv-${sku}`, stock, reserved, min_stock: 1, location_shelf: null, variant_id: `v-${sku}`, branch_id: 'b1', updated_at: '2026-01-01',
  variants: { id: `v-${sku}`, sku, is_active: true, color_id: 'c1', sizes: { code: 'M' },
    products: { id: 'p1', name: 'Polo', reference: 'POL', status: 'active', product_colors: [{ color_id: 'c1', colors: { name: 'Negro' } }] } },
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.tables.inventories = [inv('POL-1', 2, 2)];
  supa.state.tables.online_orders = [
    order(1, 'payment_pending', past(), [{ variant_id: 'v-POL-1', quantity: 1 }]),
    order(2, 'payment_pending', future(), [{ variant_id: 'v-POL-1', quantity: 1 }]),
  ];
  supa.state.rpc.get_order_status_catalog = { transitions: [] };
  supa.state.rpc.admin_dashboard_metrics = { orders_by_status: {}, gross_sales: 0, paid_orders: 0, average_ticket: 0, units_sold: 0, low_stock_variants: 0, needs_attention: 0 };
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); }); };
const renderAt = async (url) => {
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  const { AdminDashboardPage } = await import('../pages/admin/AdminDashboardPage');
  const { AdminInventoryPage } = await import('../pages/admin/AdminInventoryPage');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/pedidos" element={<AdminOrdersPage />} />
          <Route path="/admin/inventario" element={<AdminInventoryPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
};
const firstIndex = (entry) => supa.state.log.indexOf(entry);

describe('servicio: expirePendingOrders', () => {
  it('devuelve cuántos vencieron y avisa al menú solo si hubo alguno', async () => {
    const { expirePendingOrders, ORDERS_CHANGED_EVENT } = await import('../services/adminService');
    const seen = vi.fn(); window.addEventListener(ORDERS_CHANGED_EVENT, seen);
    expect(await expirePendingOrders()).toBe(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(await expirePendingOrders()).toBe(0);
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(ORDERS_CHANGED_EVENT, seen);
  });

  it('nunca lanza: error de la BD o función ausente → null', async () => {
    supa.state.expireError = { code: 'PGRST202', message: 'Could not find the function' };
    const { expirePendingOrders } = await import('../services/adminService');
    await expect(expirePendingOrders()).resolves.toBeNull();
    supa.rpc.mockImplementationOnce(async () => { throw new TypeError('Failed to fetch'); });
    await expect(expirePendingOrders()).resolves.toBeNull();
  });

  it('llamadas simultáneas comparten una sola solicitud', async () => {
    const { expirePendingOrders } = await import('../services/adminService');
    const [a, b] = await Promise.all([expirePendingOrders(), expirePendingOrders()]);
    expect([a, b]).toEqual([1, 1]);
    expect(supa.state.expireCalls).toBe(1);
  });
});

describe('panel: vence antes de leer', () => {
  it('/admin/pedidos: el pedido con la ventana cumplida se lista como «Vencido» y el vigente sigue pendiente', async () => {
    await renderAt('/admin/pedidos');
    expect(supa.state.expireCalls).toBe(1);
    expect(firstIndex('rpc:admin_expire_pending_orders')).toBeLessThan(firstIndex('from:online_orders'));
    const row = (n) => [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(`JM-${n}`));
    expect(row(1).textContent).toContain('Vencido');
    expect(row(2).textContent).toContain('Pago pendiente');
  });

  it('/admin/inventario: «reservado» ya no cuenta la reserva del pedido vencido', async () => {
    await renderAt('/admin/inventario');
    expect(firstIndex('rpc:admin_expire_pending_orders')).toBeLessThan(firstIndex('from:inventories'));
    expect(container.textContent).toContain('stock 2 · reservado 1');
  });

  it('dashboard: vence una sola vez antes de las métricas y del conteo «por preparar»', async () => {
    await renderAt('/admin');
    expect(supa.state.expireCalls).toBe(1);
    const expireAt = firstIndex('rpc:admin_expire_pending_orders');
    expect(expireAt).toBeLessThan(firstIndex('rpc:admin_dashboard_metrics'));
    expect(expireAt).toBeLessThan(firstIndex('from:online_orders'));
  });

  it('si la función no existe en la BD, pedidos e inventario cargan igual (sin vencer nada)', async () => {
    supa.state.expireError = { code: 'PGRST202', message: 'Could not find the function' };
    await renderAt('/admin/pedidos');
    const rows = [...container.querySelectorAll('tbody tr')];
    expect(rows.some((tr) => tr.textContent.includes('JM-1') && tr.textContent.includes('Pago pendiente'))).toBe(true);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await renderAt('/admin/inventario');
    expect(container.textContent).toContain('stock 2 · reservado 2');
  });
});

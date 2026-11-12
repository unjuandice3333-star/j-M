// @vitest-environment jsdom
// Ejecución 76: la pestaña de estado de /admin/pedidos vive en la URL (`?estado=paid`) y el dashboard tiene una tarjeta
// «Por preparar» (pedidos pagados de cualquier fecha) que lleva a esa pestaña. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, failHeadCount: false, queries: [] };
  const from = vi.fn((table) => {
    const rec = { table, eq: [], or: null, range: null, count: null, head: false };
    const q = {
      select: (_cols, opts) => { rec.count = opts?.count ?? null; rec.head = !!opts?.head; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: (f) => { rec.or = f; return q; }, order: () => q, limit: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        state.queries.push(rec);
        if (rec.head && state.failHeadCount) return Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(res, rej);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        if (rec.or) {
          const needle = rec.or.match(/ilike\.\*(.*?)\*/)?.[1]?.toLowerCase() ?? '';
          rows = rows.filter((r) => [r.order_number, r.customer_name, r.customer_email].some((v) => String(v ?? '').toLowerCase().includes(needle)));
        }
        const total = rows.length;
        if (rec.range) rows = rows.slice(rec.range[0], rec.range[1] + 1);
        return Promise.resolve({ data: rec.head ? null : rows, error: null, count: rec.count === 'exact' ? total : null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (name) => {
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const order = (n, status, extra = {}) => ({
  id: `id-${n}`, order_number: `JM-${n}`, customer_name: `Cliente ${n}`, customer_email: `c${n}@x.co`, customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 100000, discount_total: 0, shipping_cost: 0, total: 100000, coupon_code: null, status,
  created_at: '2026-01-01T10:00:00Z', paid_at: null, needs_attention: false, tracking_number: null, carrier: null,
  tracking_url: null, notes: null, user_id: null, online_order_items: [], payment_transactions: [], order_events: [], ...extra,
});

const METRICS = { gross_sales: 0, paid_orders: 0, average_ticket: 0, units_sold: 0, orders_by_status: {},
  low_stock_variants: 0, needs_attention: 0, top_products: [] };

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.rpc.get_order_status_catalog = { transitions: [] };
  supa.state.rpc.admin_dashboard_metrics = METRICS;
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };

let currentLocation;
const LocationProbe = () => { currentLocation = useLocation(); return null; };

const renderAt = async (url) => {
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  const { AdminDashboardPage } = await import('../pages/admin/AdminDashboardPage');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <Routes>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/pedidos" element={<AdminOrdersPage />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
};

const pressedTab = () => [...container.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent);
const tab = (prefix) => [...container.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.startsWith(prefix));
const orderNumbers = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent.trim()).filter(Boolean);
const lastListQuery = () => supa.state.queries.filter((x) => x.table === 'online_orders' && x.range && x.count === 'exact').pop();

describe('Pedidos: pestaña de estado desde la URL', () => {
  beforeEach(() => {
    supa.state.tables.online_orders = [order(1, 'paid'), order(2, 'shipped'), order(3, 'paid'), order(4, 'payment_pending')];
  });

  it('?estado=paid abre la pestaña «Pagado» y filtra en la BD', async () => {
    await renderAt('/admin/pedidos?estado=paid');
    expect(pressedTab()).toEqual(['Pagado (2)']);
    expect(lastListQuery().eq).toEqual([['status', 'paid']]);
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-3']);
  });

  it('un estado desconocido en la URL muestra todos los pedidos', async () => {
    await renderAt('/admin/pedidos?estado=borrado');
    expect(pressedTab()).toEqual(['Todos (4)']);
    expect(lastListQuery().eq).toEqual([]);
  });

  it('cambiar de pestaña actualiza la URL y «Todos» la limpia', async () => {
    await renderAt('/admin/pedidos');
    await act(async () => { tab('Enviado').click(); });
    await flush();
    expect(currentLocation.search).toBe('?estado=shipped');
    expect(orderNumbers()).toEqual(['JM-2']);
    await act(async () => { tab('Todos').click(); });
    await flush();
    expect(currentLocation.search).toBe('');
    expect(orderNumbers()).toHaveLength(4);
  });
});

describe('Pedidos: búsqueda y método de envío desde la URL (ejecución 82)', () => {
  beforeEach(() => {
    supa.state.tables.online_orders = [
      order(1, 'paid', { customer_name: 'Ana Pérez' }), order(2, 'paid', { customer_name: 'Luis Gómez', shipping_method_code: 'express' }),
      order(3, 'shipped', { customer_name: 'Ana Ruiz', shipping_method_code: 'express' }),
    ];
  });
  const input = () => container.querySelector('input[aria-label="Buscar pedidos"]');
  const typeInto = async (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };

  it('?q= llena el campo y filtra en la BD, combinable con ?estado=', async () => {
    await renderAt('/admin/pedidos?estado=paid&q=ana');
    expect(input().value).toBe('ana');
    expect(lastListQuery().or).toContain('ilike.*ana*');
    expect(lastListQuery().eq).toEqual([['status', 'paid']]);
    expect(orderNumbers()).toEqual(['JM-1']);
  });

  it('escribir en el campo actualiza ?q= tras el debounce y vaciarlo lo quita', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderAt('/admin/pedidos?estado=paid');
      await typeInto(input(), 'luis');
      expect(currentLocation.search).toBe('?estado=paid');
      await act(async () => { vi.advanceTimersByTime(350); });
      await flush();
      expect(new URLSearchParams(currentLocation.search).get('q')).toBe('luis');
      expect(new URLSearchParams(currentLocation.search).get('estado')).toBe('paid');
      expect(orderNumbers()).toEqual(['JM-2']);
      await typeInto(input(), '');
      await act(async () => { vi.advanceTimersByTime(350); });
      await flush();
      expect(currentLocation.search).toBe('?estado=paid');
      expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-2']);
    } finally { vi.useRealTimers(); }
  });

  it('?envio= selecciona el método y filtra en la BD; «Todos los envíos» lo quita', async () => {
    await renderAt('/admin/pedidos?envio=express');
    const select = container.querySelector('select[aria-label="Filtrar por método de envío"]');
    expect(select.value).toBe('express');
    expect(lastListQuery().eq).toEqual([['shipping_method_code', 'express']]);
    expect(orderNumbers().sort()).toEqual(['JM-2', 'JM-3']);
    await act(async () => { select.value = 'todos'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(currentLocation.search).toBe('');
    expect(orderNumbers()).toHaveLength(3);
  });

  it('un método desconocido en ?envio= se muestra seleccionado (no se oculta el filtro)', async () => {
    await renderAt('/admin/pedidos?envio=retirado');
    const select = container.querySelector('select[aria-label="Filtrar por método de envío"]');
    expect(select.value).toBe('retirado');
    expect(orderNumbers()).toEqual([]);
  });
});

describe('Dashboard: tarjeta «Por preparar»', () => {
  it('cuenta los pagados de cualquier fecha y lleva a la pestaña «Pagado»', async () => {
    // Pedidos pagados fuera del periodo elegido: las métricas del periodo no los incluyen, la tarjeta sí.
    supa.state.tables.online_orders = [order(1, 'paid', { created_at: '2025-01-01T00:00:00Z' }), order(2, 'paid'), order(3, 'delivered')];
    await renderAt('/admin');
    const card = container.querySelector('a[data-kpi-link="true"]');
    expect(card.getAttribute('href')).toBe('/admin/pedidos?estado=paid');
    expect(card.textContent).toContain('POR PREPARAR');
    expect(card.textContent).toContain('2 pedidos');
    expect(card.querySelector('[data-warn]').dataset.warn).toBe('true');
    const head = supa.state.queries.find((x) => x.head);
    expect(head.eq).toEqual([['status', 'paid']]);

    await act(async () => { card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
    await flush();
    expect(currentLocation.pathname).toBe('/admin/pedidos');
    expect(pressedTab()).toEqual(['Pagado (2)']);
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-2']);
  });

  it('sin pedidos por preparar la tarjeta no alerta', async () => {
    supa.state.tables.online_orders = [order(1, 'delivered')];
    await renderAt('/admin');
    const card = container.querySelector('a[data-kpi-link="true"]');
    expect(card.textContent).toContain('0 pedidos');
    expect(container.querySelectorAll('[data-warn="true"]').length).toBe(0);
  });

  it('si el conteo falla avisa en la tarjeta y el resto del panel sigue', async () => {
    supa.state.tables.online_orders = [order(1, 'paid')];
    supa.state.failHeadCount = true;
    await renderAt('/admin');
    const card = container.querySelector('a[data-kpi-link="true"]');
    expect(card.textContent).toContain('No se pudo contar los pedidos pagados.');
    expect(container.textContent).toContain('VENTAS PAGADAS');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

// @vitest-environment jsdom
// Listas del admin: filtro de pedidos (estado, método de envío, texto/guía), columna de envío,
// atribución de pedidos a clientes y KPIs del dashboard sin flechas de tendencia inventadas.
// Solo se simula Supabase; utilidades, servicios y páginas son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, errors: {}, queries: [] };
  // Emula lo justo de PostgREST: eq, or(…ilike…), range y count exact; registra cada consulta.
  const from = vi.fn((table) => {
    const rec = { table, eq: [], or: null, range: null, count: null };
    const q = {
      select: (_cols, opts) => { rec.count = opts?.count ?? null; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: (f) => { rec.or = f; return q; }, order: () => q, limit: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        state.queries.push(rec);
        if (state.errors[table]) return Promise.resolve({ data: null, error: state.errors[table] }).then(res, rej);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        if (rec.or) {
          const conds = rec.or.split(',').map((c) => /^([a-z_]+)\.ilike\.\*(.*)\*$/.exec(c));
          rows = rows.filter((r) => conds.some(([, col, t]) => String(r[col] ?? '').toLowerCase().includes(t.toLowerCase())));
        }
        const total = rows.length;
        if (rec.range) rows = rows.slice(rec.range[0], rec.range[1] + 1);
        return Promise.resolve({ data: rows, error: null, count: rec.count === 'exact' ? total : null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (name, args) => {
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: typeof h === 'function' ? h(args) : h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STANDARD = { code: 'standard', name: 'Envío estándar nacional', cost: 15000, is_active: true, sort_order: 1 };
const EXPRESS = { code: 'express', name: 'Envío express 24 h', cost: 30000, is_active: false, sort_order: 2 };

const order = (n, extra = {}) => ({
  id: `id-${n}`, order_number: `JM-${n}`, customer_name: `Cliente ${n}`, customer_email: `c${n}@x.co`, customer_phone: '300',
  shipping_department: 'Antioquia', shipping_city: 'Medellín', shipping_address: 'Cra 1', shipping_neighborhood: null,
  shipping_method_code: 'standard', subtotal: 100000, discount_total: 0, shipping_cost: 15000, total: 115000,
  status: 'paid', created_at: '2026-11-01T10:00:00Z', tracking_number: null, payment_transactions: [], online_order_items: [], order_events: [],
  ...extra,
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const setSelect = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
const setInput = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('filterAdminOrders / shippingMethodOptions', () => {
  it('filtra por estado, método y texto (incluida la guía)', async () => {
    const { filterAdminOrders } = await import('../utils/adminLists');
    const list = [order(1), order(2, { shipping_method_code: 'express', status: 'shipped', tracking_number: 'GU-777' }), order(3, { status: 'payment_pending' })];
    expect(filterAdminOrders(list).map((o) => o.order_number)).toEqual(['JM-1', 'JM-2', 'JM-3']);
    expect(filterAdminOrders(list, { method: 'express' }).map((o) => o.order_number)).toEqual(['JM-2']);
    expect(filterAdminOrders(list, { method: 'standard', status: 'paid' }).map((o) => o.order_number)).toEqual(['JM-1']);
    expect(filterAdminOrders(list, { query: ' gu-777 ' }).map((o) => o.order_number)).toEqual(['JM-2']);
    expect(filterAdminOrders(list, { query: 'C3@X.CO' }).map((o) => o.order_number)).toEqual(['JM-3']);
    expect(filterAdminOrders(null)).toEqual([]);
  });

  it('opciones: configurados por orden y luego códigos que solo aparecen en pedidos', async () => {
    const { shippingMethodOptions } = await import('../utils/adminLists');
    const list = [order(1, { shipping_method_code: 'pickup' }), order(2, { shipping_method_code: null }), order(3)];
    expect(shippingMethodOptions(list, [EXPRESS, STANDARD])).toEqual(['standard', 'express', 'pickup']);
    expect(shippingMethodOptions([], undefined)).toEqual([]);
  });
});

describe('buildCustomers', () => {
  it('un pedido con user_id no se atribuye a otra cuenta por coincidir el correo', async () => {
    const { buildCustomers } = await import('../utils/adminLists');
    const profiles = [{ id: 'u1', email: 'Ana@X.co' }, { id: 'u2', email: 'luis@x.co' }];
    const orders = [
      order(1, { user_id: 'u2', customer_email: 'ana@x.co', total: 50000 }), // de u2 aunque use el correo de Ana
      order(2, { user_id: null, customer_email: ' ANA@x.co ', total: 100000, shipping_city: 'Cali' }), // invitado → Ana
      order(3, { user_id: 'u1', total: 20000, status: 'payment_pending' }),
    ];
    const [ana, luis] = buildCustomers(profiles, orders);
    expect(ana.orders.map((o) => o.order_number)).toEqual(['JM-2', 'JM-3']);
    expect(ana.ordersCount).toBe(1);
    expect(ana.totalSpent).toBe(100000);
    expect(ana.city).toBe('Cali');
    expect(luis.orders.map((o) => o.order_number)).toEqual(['JM-1']);
    expect(luis.totalSpent).toBe(50000);
  });

  it('perfil sin correo no recoge pedidos de invitado sin correo', async () => {
    const { buildCustomers } = await import('../utils/adminLists');
    const [c] = buildCustomers([{ id: 'u9', email: null }], [order(1, { user_id: null, customer_email: null })]);
    expect(c.orders).toEqual([]);
    expect(c.avgTicket).toBe(0);
    expect(c.city).toBe('—');
  });
});

describe('Admin de pedidos', () => {
  const renderPage = async () => {
    const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
    await act(async () => { root.render(<MemoryRouter><AdminOrdersPage /></MemoryRouter>); });
    await flush();
  };

  it('muestra la columna de envío y filtra por método', async () => {
    supa.state.tables.online_orders = [order(1), order(2, { shipping_method_code: 'express' })];
    supa.state.tables.shipping_methods = [STANDARD, EXPRESS];
    supa.state.rpc.get_order_status_catalog = { transitions: [] };
    await renderPage();
    const cells = () => [...container.querySelectorAll('[data-testid="order-row-shipping"]')].map((td) => td.textContent.trim());
    expect(cells()).toEqual(['Envío estándar nacional', 'Envío express 24 h']);
    const sel = container.querySelector('select[aria-label="Filtrar por método de envío"]');
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Todos los envíos', 'Envío estándar nacional', 'Envío express 24 h']);
    setSelect(sel, 'express');
    await flush();
    expect(cells()).toEqual(['Envío express 24 h']);
    const last = supa.state.queries.filter((x) => x.table === 'online_orders' && x.count === 'exact').pop();
    expect(last.eq).toEqual([['shipping_method_code', 'express']]);
  });

  it('pagina con «Cargar más», cuenta todos los pedidos y filtra en la BD', async () => {
    const { ADMIN_ORDERS_PAGE_SIZE } = await import('../utils/adminLists');
    const N = ADMIN_ORDERS_PAGE_SIZE * 2 + 10;
    const many = Array.from({ length: N }, (_, i) => order(i + 1, i % 10 === 0 ? { status: 'shipped' } : {}));
    many[N - 1] = order(N, { tracking_number: 'SERV-123', status: 'shipped' });
    supa.state.tables.online_orders = many;
    supa.state.tables.shipping_methods = [STANDARD];
    supa.state.rpc.get_order_status_catalog = { transitions: [] };
    await renderPage();
    const rows = () => container.querySelectorAll('[data-testid="order-row-shipping"]').length;
    const info = () => container.querySelector('[data-testid="orders-page-info"]').textContent;
    const more = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Cargar más pedidos');
    expect(rows()).toBe(ADMIN_ORDERS_PAGE_SIZE);
    expect(info()).toContain(`Mostrando ${ADMIN_ORDERS_PAGE_SIZE} de ${N} pedidos`);
    // Conteos de las pestañas y del título sobre TODOS los pedidos, no solo los cargados.
    expect(container.querySelector('h1').textContent).toBe(`PEDIDOS (${N})`);
    const shippedTab = [...container.querySelectorAll('button')].find((b) => b.textContent.startsWith('Enviado'));
    expect(shippedTab.textContent).toBe(`Enviado (${many.filter((o) => o.status === 'shipped').length})`);
    await act(async () => { more().click(); }); await flush();
    expect(rows()).toBe(ADMIN_ORDERS_PAGE_SIZE * 2);
    await act(async () => { more().click(); }); await flush();
    expect(rows()).toBe(N);
    expect(more()).toBeUndefined();
    // La búsqueda va a la BD: encuentra un pedido aunque no estuviera entre los cargados.
    supa.state.queries.length = 0;
    setInput(container.querySelector('input[aria-label="Buscar pedidos"]'), 'serv-123');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await flush();
    expect(rows()).toBe(1);
    expect(container.textContent).toContain(`JM-${N}`);
    const q = supa.state.queries.find((x) => x.table === 'online_orders' && x.or);
    expect(q.or).toContain('tracking_number.ilike.*serv-123*');
    expect(q.range).toEqual([0, ADMIN_ORDERS_PAGE_SIZE - 1]);
    // Pestaña de estado → filtro eq en la BD y página reiniciada.
    await act(async () => { shippedTab.click(); }); await flush();
    const q2 = supa.state.queries.filter((x) => x.table === 'online_orders' && x.count === 'exact').pop();
    expect(q2.eq).toEqual([['status', 'shipped']]);
  });

  it('la búsqueda neutraliza caracteres de la sintaxis de PostgREST', async () => {
    const { orderSearchFilter, sanitizeOrSearch } = await import('../utils/adminLists');
    expect(sanitizeOrSearch('a,b),status.eq.paid')).toBe('a b status.eq.paid');
    expect(orderSearchFilter('x),id.eq.(1')).not.toMatch(/[()]/);
    expect(orderSearchFilter('  ')).toBeNull();
  });
});

describe('fetchAllRows', () => {
  it('lee todas las páginas hasta una incompleta y marca el tope', async () => {
    const { fetchAllRows } = await import('../utils/adminLists');
    supa.state.tables.t = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const r = await fetchAllRows(() => supa.from('t').select('id'));
    expect(r.data.length).toBe(2500);
    expect(r.capped).toBe(false);
    expect(supa.state.queries.map((x) => x.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    const c = await fetchAllRows(() => supa.from('t').select('id'), { pageSize: 1000, maxRows: 2000 });
    expect(c.data.length).toBe(2000);
    expect(c.capped).toBe(true);
    supa.state.errors.t = { message: 'x' };
    expect((await fetchAllRows(() => supa.from('t').select('id'))).error).toEqual({ message: 'x' });
  });
});

describe('Admin de clientes', () => {
  it('carga más de 1000 clientes y sus pedidos (antes PostgREST los cortaba)', async () => {
    supa.state.tables.profiles = Array.from({ length: 1205 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.co`, full_name: `U${i}`, role: 'customer', created_at: '2026-10-01T00:00:00Z' }));
    supa.state.tables.online_orders = [order(1, { user_id: 'u1204' })];
    const { AdminCustomersPage } = await import('../pages/admin/AdminCustomersPage');
    await act(async () => { root.render(<MemoryRouter><AdminCustomersPage /></MemoryRouter>); });
    await flush();
    expect(container.querySelector('h1').textContent).toBe('CLIENTES (1205)');
    expect(supa.state.queries.filter((x) => x.table === 'profiles').map((x) => x.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it('muestra error si fallan las direcciones en vez de «sin direcciones»', async () => {
    supa.state.tables.profiles = [{ id: 'u1', email: 'ana@x.co', full_name: 'Ana', role: 'customer', created_at: '2026-10-01T00:00:00Z' }];
    supa.state.tables.online_orders = [order(1, { user_id: 'u1' })];
    supa.state.errors.customer_addresses = { message: 'boom' };
    const { AdminCustomersPage } = await import('../pages/admin/AdminCustomersPage');
    await act(async () => { root.render(<MemoryRouter><AdminCustomersPage /></MemoryRouter>); });
    await flush();
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ver detalle');
    await act(async () => { btn.click(); });
    await flush();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('No se pudieron cargar las direcciones.');
    expect(dialog.textContent).not.toContain('Sin direcciones guardadas.');
  });
});

describe('Dashboard del admin', () => {
  it('los KPI no muestran flechas de tendencia y las alertas se marcan solo si existen', async () => {
    supa.state.tables.online_orders = [];
    supa.state.rpc.admin_dashboard_metrics = { gross_sales: 0, paid_orders: 0, average_ticket: 0, units_sold: 0,
      orders_by_status: {}, low_stock_variants: 0, needs_attention: 0, top_products: [] };
    const { AdminDashboardPage } = await import('../pages/admin/AdminDashboardPage');
    await act(async () => { root.render(<MemoryRouter><AdminDashboardPage /></MemoryRouter>); });
    await flush();
    expect(container.textContent).toContain('VENTAS PAGADAS');
    expect(container.querySelector('.lucide-arrow-up-right, .lucide-arrow-down-right')).toBeNull();
    expect(container.querySelectorAll('[data-warn="true"]').length).toBe(0);
  });
});

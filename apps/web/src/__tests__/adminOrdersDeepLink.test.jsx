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
      maybeSingle: () => {
        state.queries.push(rec);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then: (res, rej) => {
        state.queries.push(rec);
        if (rec.head && state.failHeadCount) return Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(res, rej);
        let rows = state.tables[table] ?? [];
        rec.eq.forEach(([c, v]) => { rows = rows.filter((r) => r[c] === v); });
        // Ejecución 88: filtro de cliente (user_id de la cuenta o pedido de invitado con su correo), opcionalmente con búsqueda.
        const cust = rec.or && /user_id\.eq\.([0-9a-f-]+)(?:,and\(user_id\.is\.null,customer_email\.eq\."(.*?)"\))?/.exec(rec.or);
        if (cust) rows = rows.filter((r) => (r.user_id ? r.user_id === cust[1] : cust[2] !== undefined && r.customer_email === cust[2]));
        if (rec.or && /ilike/.test(rec.or)) {
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

describe('Pedidos: filtro por cupón desde la URL (ejecución 87)', () => {
  beforeEach(() => {
    supa.state.tables.online_orders = [
      order(1, 'paid', { coupon_code: 'JM10' }), order(2, 'paid'), order(3, 'shipped', { coupon_code: 'JM10' }), order(4, 'paid', { coupon_code: 'OTRO' }),
    ];
  });
  const chip = () => container.querySelector('[data-testid="orders-coupon-filter"]');

  it('?cupon= filtra en la BD por coupon_code (normalizado) y muestra el filtro activo', async () => {
    await renderAt('/admin/pedidos?cupon=%20jm10%20');
    expect(lastListQuery().eq).toEqual([['coupon_code', 'JM10']]);
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-3']);
    expect(chip().textContent).toContain('Cupón: JM10');
  });

  it('se combina con ?estado= y quitar el filtro conserva los demás parámetros', async () => {
    await renderAt('/admin/pedidos?estado=paid&cupon=JM10');
    expect(lastListQuery().eq).toEqual([['status', 'paid'], ['coupon_code', 'JM10']]);
    expect(orderNumbers()).toEqual(['JM-1']);
    await act(async () => { chip().querySelector('button').click(); });
    await flush();
    expect(currentLocation.search).toBe('?estado=paid');
    expect(chip()).toBeNull();
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-2', 'JM-4']);
  });

  it('un código inválido en ?cupon= se ignora (no se envía a la BD)', async () => {
    await renderAt('/admin/pedidos?cupon=a*b,or(');
    expect(lastListQuery().eq).toEqual([]);
    expect(chip()).toBeNull();
    expect(orderNumbers()).toHaveLength(4);
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

describe('Pedidos de un cliente (?cliente=)', () => {
  const ANA = '11111111-1111-4111-8111-111111111111';
  const LUIS = '22222222-2222-4222-8222-222222222222';
  beforeEach(() => {
    supa.state.tables.profiles = [{ id: ANA, email: 'Ana@X.co', full_name: 'Ana Ruiz' }, { id: LUIS, email: 'luis@x.co', full_name: 'Luis' }];
    supa.state.tables.online_orders = [
      order(1, 'paid', { user_id: ANA, customer_email: 'otro@x.co' }), // su cuenta, aunque pagó con otro correo
      order(2, 'payment_pending', { customer_email: 'ana@x.co' }), // invitado con su correo
      order(3, 'paid', { user_id: LUIS, customer_email: 'ana@x.co' }), // otra cuenta con su correo: no es de Ana
      order(4, 'delivered', { customer_email: 'luis@x.co' }),
    ];
  });
  const chip = () => container.querySelector('[data-testid="orders-customer-filter"]');

  it('aplica en la BD la misma atribución que la lista de clientes y muestra su nombre', async () => {
    await renderAt(`/admin/pedidos?cliente=${ANA}`);
    expect(lastListQuery().or).toBe(`user_id.eq.${ANA},and(user_id.is.null,customer_email.eq."ana@x.co")`);
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-2']);
    expect(chip().textContent).toContain('Cliente: Ana Ruiz');
  });

  it('se combina con la búsqueda en un único filtro y quitarlo conserva los demás parámetros', async () => {
    await renderAt(`/admin/pedidos?estado=paid&q=JM-1&cliente=${ANA}`);
    expect(lastListQuery().or).toBe(`and(or(user_id.eq.${ANA},and(user_id.is.null,customer_email.eq."ana@x.co")),or(order_number.ilike.*JM-1*,customer_name.ilike.*JM-1*,customer_email.ilike.*JM-1*,customer_phone.ilike.*JM-1*,tracking_number.ilike.*JM-1*))`);
    expect(orderNumbers()).toEqual(['JM-1']);
    await act(async () => { chip().querySelector('button').click(); });
    await flush();
    expect(currentLocation.search).toBe('?estado=paid&q=JM-1');
    expect(chip()).toBeNull();
  });

  it('un cliente inexistente filtra solo por su id (no muestra pedidos ajenos) y un id inválido se ignora', async () => {
    const GHOST = '33333333-3333-4333-8333-333333333333';
    await renderAt(`/admin/pedidos?cliente=${GHOST}`);
    expect(lastListQuery().or).toBe(`user_id.eq.${GHOST}`);
    expect(orderNumbers()).toEqual([]);
    expect(chip().textContent).toContain('no encontrado');
    act(() => root.unmount()); root = createRoot(container);
    await renderAt('/admin/pedidos?cliente=1,or(x');
    expect(lastListQuery().or).toBeNull();
    expect(chip()).toBeNull();
    expect(orderNumbers()).toHaveLength(4);
  });
});

// Ejecución 89: el detalle del pedido enlaza a la ficha del cliente (cuenta) o a la búsqueda por su correo (invitado).
describe('Detalle del pedido: enlace al cliente', () => {
  const ANA = '11111111-1111-4111-8111-111111111111';
  const openOrder = async (n) => {
    const row = [...container.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td')?.textContent.trim() === `JM-${n}`);
    await act(async () => { row.querySelector('td:last-child button').click(); });
    await flush();
    return container.querySelector('[data-testid="order-customer-link"]');
  };
  beforeEach(() => {
    supa.state.tables.online_orders = [order(1, 'paid', { user_id: ANA }), order(2, 'paid', { customer_email: 'ana+1@x.co' })];
  });

  it('pedido con cuenta → ficha del cliente; pedido de invitado → búsqueda por correo en todos los roles', async () => {
    await renderAt('/admin/pedidos');
    const a = await openOrder(1);
    expect(a.getAttribute('href')).toBe(`/admin/clientes?cliente=${ANA}`);
    expect(a.textContent).toBe('Ver ficha del cliente');
    act(() => root.unmount()); root = createRoot(container);
    await renderAt('/admin/pedidos');
    const b = await openOrder(2);
    expect(b.getAttribute('href')).toBe('/admin/clientes?q=ana%2B1%40x.co&rol=todos');
    expect(b.textContent).toBe('Buscar cliente por correo');
  });
});

// Ejecución 90: en el detalle del pedido el cupón enlaza a /admin/descuentos y cada SKU a /admin/productos.
describe('Detalle del pedido: enlaces a cupón y productos', () => {
  const item = (sku) => ({ product_name: 'Blusa', sku, size_code: 'M', color_name: 'Negro', unit_price: 50000, quantity: 1, line_total: 50000, image_url: null });
  const open = async (n) => {
    const row = [...container.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('td')?.textContent.trim() === `JM-${n}`);
    await act(async () => { row.querySelector('td:last-child button').click(); });
    await flush();
  };
  beforeEach(() => {
    supa.state.tables.online_orders = [
      order(1, 'paid', { coupon_code: 'JM10', discount_total: 10000, online_order_items: [item('BL-01-M-NEG'), item('BL-01-L-NEG')] }),
      order(2, 'paid', { online_order_items: [item('')] }),
    ];
  });

  it('cupón → /admin/descuentos?q=CÓDIGO y cada línea → /admin/productos?q=SKU', async () => {
    await renderAt('/admin/pedidos');
    await open(1);
    const coupon = container.querySelector('[data-testid="order-coupon-link"]');
    expect(coupon.getAttribute('href')).toBe('/admin/descuentos?q=JM10');
    expect(coupon.textContent).toBe('JM10');
    expect(container.querySelector('[data-testid="order-item-sku-0"]').getAttribute('href')).toBe('/admin/productos?q=BL-01-M-NEG');
    expect(container.querySelector('[data-testid="order-item-sku-1"]').getAttribute('href')).toBe('/admin/productos?q=BL-01-L-NEG');
  });

  it('sin cupón ni SKU no hay enlaces', async () => {
    await renderAt('/admin/pedidos');
    await open(2);
    expect(container.querySelector('[data-testid="order-coupon-link"]')).toBeNull();
    expect(container.querySelector('[data-testid="order-item-sku-0"]')).toBeNull();
  });
});

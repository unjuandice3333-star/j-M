// @vitest-environment jsdom
// Ejecución 77: las alertas del dashboard llevan a listas ya filtradas: stock bajo/agotado → /admin/inventario?stock=alerta
// (misma regla que admin_dashboard_metrics.low_stock_variants) y pedidos con needs_attention → /admin/pedidos?revision=1.
// Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, queries: [] };
  const from = vi.fn((table) => {
    const rec = { table, eq: [], range: null, count: null, head: false };
    const q = {
      select: (_cols, opts) => { rec.count = opts?.count ?? null; rec.head = !!opts?.head; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      or: () => q, order: () => q, limit: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        state.queries.push(rec);
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
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const order = (n, extra = {}) => ({
  id: `id-${n}`, order_number: `JM-${n}`, customer_name: `Cliente ${n}`, customer_email: `c${n}@x.co`, customer_phone: '300',
  shipping_address: 'Cra 1', shipping_city: 'Bogotá', shipping_department: 'Bogotá D.C.', shipping_method_code: 'standard',
  subtotal: 100000, discount_total: 0, shipping_cost: 0, total: 100000, coupon_code: null, status: 'paid',
  created_at: '2026-01-01T10:00:00Z', paid_at: null, needs_attention: false, tracking_number: null, carrier: null,
  tracking_url: null, notes: null, user_id: null, online_order_items: [], payment_transactions: [], order_events: [], ...extra,
});

const inv = (sku, stock, reserved, min, { variantActive = true, productStatus = 'active' } = {}) => ({
  id: `inv-${sku}`, stock, reserved, min_stock: min, location_shelf: null, variant_id: `v-${sku}`, branch_id: 'b1',
  variants: { id: `v-${sku}`, sku, is_active: variantActive, color_id: 'c1', sizes: { code: 'M' },
    products: { id: 'p1', name: 'Polo', reference: 'POL', status: productStatus, product_colors: [{ color_id: 'c1', colors: { name: 'Negro' } }] } },
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  supa.state.tables.shipping_methods = [];
  supa.state.rpc.get_order_status_catalog = { transitions: [] };
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
  const { AdminInventoryPage } = await import('../pages/admin/AdminInventoryPage');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
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

const click = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
  await flush();
};
const rowSkus = () => [...container.querySelectorAll('tbody tr td:first-child div:nth-child(2)')].map((d) => d.textContent.replace('SKU: ', ''));
const stockSelect = () => container.querySelector('select[aria-label="Filtrar por estado de stock"]');
const orderNumbers = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')?.textContent.trim()).filter(Boolean);
const attentionBox = () => [...container.querySelectorAll('label')].find((l) => l.textContent.startsWith('Solo los que requieren revisión'));
const lastListQuery = () => supa.state.queries.filter((x) => x.table === 'online_orders' && x.range && x.count === 'exact').pop();

const INVENTORY = [
  inv('OK-1', 20, 0, 5), // normal
  inv('LOW-1', 6, 2, 5), // disponible 4 ≤ 5 → alerta
  inv('OUT-1', 3, 3, 2), // disponible 0 → alerta y agotada
  inv('OFF-1', 1, 0, 5, { variantActive: false }), // variante inactiva: la métrica del dashboard no la cuenta
];

describe('Inventario: filtro de stock desde la URL', () => {
  beforeEach(() => { supa.state.tables.inventories = INVENTORY; });

  it('?stock=alerta muestra solo las variantes activas en el mínimo o por debajo', async () => {
    await renderAt('/admin/inventario?stock=alerta');
    expect(stockSelect().value).toBe('alerta');
    expect(rowSkus().sort()).toEqual(['LOW-1', 'OUT-1']);
    expect(stockSelect().textContent).toContain('Stock bajo o agotado (2)');
  });

  it('?stock=agotado muestra las agotadas y un valor desconocido muestra todas', async () => {
    await renderAt('/admin/inventario?stock=agotado');
    expect(rowSkus()).toEqual(['OUT-1']);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await renderAt('/admin/inventario?stock=raro');
    expect(stockSelect().value).toBe('todos');
    expect(rowSkus()).toHaveLength(4);
  });

  it('cambiar el filtro actualiza la URL y «Todas» la limpia', async () => {
    await renderAt('/admin/inventario');
    const sel = stockSelect();
    await act(async () => { sel.value = 'alerta'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(currentLocation.search).toBe('?stock=alerta');
    expect(rowSkus()).toHaveLength(2);
    await act(async () => { sel.value = 'todos'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(currentLocation.search).toBe('');
    expect(rowSkus()).toHaveLength(4);
  });

  it('sin coincidencias lo dice en vez de «no hay registros»', async () => {
    supa.state.tables.inventories = [inv('OK-1', 20, 0, 5)];
    await renderAt('/admin/inventario?stock=alerta');
    expect(container.textContent).toContain('Ninguna variante coincide con el filtro.');
    expect(container.textContent).not.toContain('No hay registros');
  });
});

describe('Pedidos: «requieren revisión» desde la URL', () => {
  beforeEach(() => {
    supa.state.tables.online_orders = [order(1, { needs_attention: true }), order(2), order(3, { needs_attention: true, status: 'shipped' })];
  });

  it('?revision=1 marca la casilla, filtra en la BD y cuenta los pendientes', async () => {
    await renderAt('/admin/pedidos?revision=1');
    expect(attentionBox().querySelector('input').checked).toBe(true);
    expect(attentionBox().textContent).toContain('(2)');
    expect(lastListQuery().eq).toEqual([['needs_attention', true]]);
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-3']);
  });

  it('se combina con la pestaña de estado y desmarcar limpia el parámetro', async () => {
    await renderAt('/admin/pedidos?estado=paid&revision=1');
    expect(lastListQuery().eq).toEqual([['status', 'paid'], ['needs_attention', true]]);
    expect(orderNumbers()).toEqual(['JM-1']);
    await click(attentionBox().querySelector('input'));
    expect(currentLocation.search).toBe('?estado=paid');
    expect(orderNumbers().sort()).toEqual(['JM-1', 'JM-2']);
  });
});

describe('Dashboard: tarjetas de alertas enlazadas', () => {
  const metrics = (low, attention) => ({ gross_sales: 0, paid_orders: 0, average_ticket: 0, units_sold: 0, orders_by_status: {},
    low_stock_variants: low, needs_attention: attention, top_products: [] });
  const card = (href) => container.querySelector(`a[href="${href}"]`);

  it('stock bajo lleva al inventario filtrado con las mismas variantes que cuenta la métrica', async () => {
    supa.state.rpc.admin_dashboard_metrics = metrics(2, 0);
    supa.state.tables.online_orders = [];
    supa.state.tables.inventories = INVENTORY;
    await renderAt('/admin');
    const stock = card('/admin/inventario?stock=alerta');
    expect(stock.textContent).toContain('ALERTAS DE STOCK');
    expect(stock.textContent).toContain('2 variantes');
    expect(stock.querySelector('[data-warn]').dataset.warn).toBe('true');
    expect(card('/admin/pedidos?revision=1').querySelector('[data-warn]').dataset.warn).toBe('false');
    await click(stock);
    expect(currentLocation.pathname).toBe('/admin/inventario');
    expect(rowSkus()).toHaveLength(2);
  });

  it('pedidos por revisar llevan a la lista filtrada', async () => {
    supa.state.rpc.admin_dashboard_metrics = metrics(0, 1);
    supa.state.tables.online_orders = [order(1, { needs_attention: true }), order(2)];
    await renderAt('/admin');
    const rev = card('/admin/pedidos?revision=1');
    expect(rev.textContent).toContain('REQUIEREN REVISIÓN');
    expect(rev.textContent).toContain('1 pedido');
    expect(rev.querySelector('[data-warn]').dataset.warn).toBe('true');
    await click(rev);
    expect(currentLocation.pathname).toBe('/admin/pedidos');
    expect(attentionBox().querySelector('input').checked).toBe(true);
    expect(orderNumbers()).toEqual(['JM-1']);
  });
});

// Ejecución 78: las tarjetas KPI del inventario son botones del mismo filtro y cuentan con la misma regla que el dashboard.
describe('Inventario: tarjetas KPI como filtro', () => {
  beforeEach(() => { supa.state.tables.inventories = INVENTORY; });
  const kpi = (title) => [...container.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.startsWith(title));

  it('«ALERTAS DE STOCK» cuenta lo mismo que la métrica (agotadas incluidas, inactivas fuera)', async () => {
    await renderAt('/admin/inventario');
    expect(kpi('ALERTAS DE STOCK').textContent).toContain('2 variantes');
    expect(kpi('VARIANTES AGOTADAS').textContent).toContain('1 variante');
    expect(kpi('ALERTAS DE STOCK').getAttribute('aria-pressed')).toBe('false');
  });

  it('pulsar una tarjeta filtra y pone la URL; pulsarla otra vez quita el filtro', async () => {
    await renderAt('/admin/inventario');
    await click(kpi('ALERTAS DE STOCK'));
    expect(currentLocation.search).toBe('?stock=alerta');
    expect(stockSelect().value).toBe('alerta');
    expect(rowSkus().sort()).toEqual(['LOW-1', 'OUT-1']);
    expect(kpi('ALERTAS DE STOCK').getAttribute('aria-pressed')).toBe('true');
    await click(kpi('VARIANTES AGOTADAS'));
    expect(currentLocation.search).toBe('?stock=agotado');
    expect(rowSkus()).toEqual(['OUT-1']);
    expect(kpi('ALERTAS DE STOCK').getAttribute('aria-pressed')).toBe('false');
    await click(kpi('VARIANTES AGOTADAS'));
    expect(currentLocation.search).toBe('');
    expect(rowSkus()).toHaveLength(4);
  });

  it('las unidades disponibles no restan las sobrevendidas', async () => {
    supa.state.tables.inventories = [inv('A', 5, 0, 1), inv('NEG', 1, 3, 1)];
    await renderAt('/admin/inventario');
    expect(container.textContent).toContain('UNIDADES DISPONIBLES');
    expect(container.textContent).toContain('5 uds');
  });
});

// Ejecución 80: búsqueda del inventario sin tildes y en la URL (`?q=`), combinable con `?stock=`.
describe('Inventario: búsqueda sin tildes y en la URL', () => {
  const invNamed = (sku, name, reference, shelf, stock = 20) => {
    const row = inv(sku, stock, 0, 5);
    row.location_shelf = shelf;
    row.variants.products = { ...row.variants.products, name, reference };
    return row;
  };
  beforeEach(() => {
    supa.state.tables.inventories = [
      invNamed('CAM-01', 'Camisa Algodón', 'REF-CAM', 'Estante A'),
      invNamed('PAN-01', 'Pantalón Lino', 'REF-PAN', 'Bodega Norte', 2),
      invNamed('POL-01', 'Polo Básico', 'REF-POL', null),
    ];
  });
  const searchBox = () => container.querySelector('input[aria-label="Buscar en inventario"]');
  const type = async (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await flush();
  };

  it('?q= sin tildes ni mayúsculas encuentra el nombre con tilde', async () => {
    await renderAt('/admin/inventario?q=PANTALON');
    expect(searchBox().value).toBe('PANTALON');
    expect(rowSkus()).toEqual(['PAN-01']);
  });

  it('busca por referencia del producto y por ubicación', async () => {
    await renderAt('/admin/inventario?q=ref-cam');
    expect(rowSkus()).toEqual(['CAM-01']);
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await renderAt('/admin/inventario?q=bodega norte');
    expect(rowSkus()).toEqual(['PAN-01']);
  });

  it('escribir pone ?q= en la URL junto a ?stock= y borrar la quita', async () => {
    await renderAt('/admin/inventario?stock=alerta');
    expect(rowSkus()).toEqual(['PAN-01']);
    await type(searchBox(), 'camisa');
    expect(new URLSearchParams(currentLocation.search).get('q')).toBe('camisa');
    expect(new URLSearchParams(currentLocation.search).get('stock')).toBe('alerta');
    expect(container.textContent).toContain('Ninguna variante coincide con el filtro.');
    await type(searchBox(), '');
    expect(currentLocation.search).toBe('?stock=alerta');
    expect(rowSkus()).toEqual(['PAN-01']);
  });
});

describe('Inventario: cada variante enlaza a su producto (ejecución 91)', () => {
  it('el SKU lleva a /admin/productos?q=<sku>', async () => {
    supa.state.tables.inventories = [inv('POL-NEG-M', 5, 0, 1)];
    await renderAt('/admin/inventario');
    const link = container.querySelector('a[data-testid="inventory-sku-inv-POL-NEG-M"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/admin/productos?q=POL-NEG-M');
    expect(rowSkus()).toEqual(['POL-NEG-M']);
  });
});

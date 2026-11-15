// @vitest-environment jsdom
// Ejecución 145: «Mis pedidos» paginado. Antes se pedían todos los pedidos (y sus líneas) sin límite: PostgREST corta en
// max_rows (1000) sin avisar. Ahora: 20 por página, «Ver más pedidos» amplía, el contador muestra el total real,
// un fallo al cargar más conserva la lista y el foco pasa al primer pedido nuevo.
// Solo se simulan Supabase y Wompi; página, store y orderService son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function fakeSupabase() {
  const state = { orders: [], failNext: false, reads: [] };
  const from = (table) => {
    let range = null; let countExact = false;
    const q = {
      select: (_cols, opts) => { countExact = opts?.count === 'exact'; return q; },
      eq: () => q, order: () => q, limit: () => q, or: () => q, in: () => q,
      range: (a, b) => { range = [a, b]; return q; },
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (r, j) => {
        if (table !== 'online_orders') return Promise.resolve({ data: [], error: null }).then(r, j);
        state.reads.push(range);
        if (state.failNext) { state.failNext = false; return Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }).then(r, j); }
        const rows = range ? state.orders.slice(range[0], range[1] + 1) : state.orders;
        return Promise.resolve({ data: rows.map((o) => ({ ...o })), error: null, count: countExact ? state.orders.length : null }).then(r, j);
      },
    };
    return q;
  };
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn() } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const makeOrders = (n) => Array.from({ length: n }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, order_number: `JM-${String(n - i).padStart(6, '0')}`,
  public_token: `t${i}`, status: 'delivered', total: 50000, subtotal: 50000, discount_total: 0, shipping_cost: 0,
  shipping_method_code: 'standard', created_at: new Date(Date.now() - i * 60e3).toISOString(), online_order_items: [],
}));

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const cards = () => container.querySelectorAll('[data-order-id]');
const moreButton = () => q('orders-load-more')?.querySelector('button') ?? null;
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };

const mount = async () => {
  const { useAuthStore } = await import('../store/authStore');
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana', role: 'customer' } });
  const { AccountPage } = await import('../pages/AccountPage');
  await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta']}><AccountPage /></MemoryRouter>); });
  await flush();
};

describe('«Mis pedidos» paginado', () => {
  it('orderService pide un rango acotado (limit + 1) y el total exacto', async () => {
    supa.state.orders = makeOrders(25);
    const { orderService } = await import('../services/orderService');
    const res = await orderService.getMyOrders({ limit: 20 });
    expect(supa.state.reads.at(-1)).toEqual([0, 20]);
    expect(res.orders).toHaveLength(20);
    expect(res).toMatchObject({ total: 25, hasMore: true });
    const all = await orderService.getMyOrders({ limit: 40 });
    expect(all).toMatchObject({ total: 25, hasMore: false });
    expect(all.orders).toHaveLength(25);
  });

  it('muestra 20, el contador con el total y «Ver más» hasta cargarlos todos; el foco pasa al primer pedido nuevo', async () => {
    supa.state.orders = makeOrders(45);
    await mount();
    expect(cards()).toHaveLength(20);
    expect(container.textContent).toContain('Mostrando 20 de 45 pedidos');
    expect(container.textContent).toMatch(/MIS PEDIDOS/i);
    expect(container.textContent).toContain('45');
    await click(moreButton());
    expect(cards()).toHaveLength(40);
    expect(document.activeElement.getAttribute('data-order-id')).toBe(supa.state.orders[20].id);
    await click(moreButton());
    expect(cards()).toHaveLength(45);
    expect(document.activeElement.getAttribute('data-order-id')).toBe(supa.state.orders[40].id);
    expect(q('orders-load-more')).toBeNull();
    // Sin duplicados y en orden
    expect([...cards()].map((c) => c.getAttribute('data-order-id'))).toEqual(supa.state.orders.map((o) => o.id));
  });

  it('con 20 o menos pedidos no ofrece «Ver más»', async () => {
    supa.state.orders = makeOrders(20);
    await mount();
    expect(cards()).toHaveLength(20);
    expect(q('orders-load-more')).toBeNull();
  });

  it('si falla «Ver más», conserva la lista, avisa junto al botón y se puede reintentar', async () => {
    supa.state.orders = makeOrders(30);
    await mount();
    supa.state.failNext = true;
    await click(moreButton());
    expect(cards()).toHaveLength(20);
    const alert = q('orders-load-more').querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(moreButton().getAttribute('aria-describedby')).toBe(alert.id);
    await click(moreButton());
    expect(cards()).toHaveLength(30);
    expect(q('orders-load-more')).toBeNull();
    // El reintento pidió la página ampliada una sola vez (no saltó a 60)
    expect(supa.state.reads.at(-1)).toEqual([0, 40]);
  });
});

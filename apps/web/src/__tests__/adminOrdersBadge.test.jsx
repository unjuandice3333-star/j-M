// @vitest-environment jsdom
// Ejecución 75: insignia «pedidos por preparar» (status = 'paid') en el menú del admin. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

function fakeSupabase() {
  const state = { orders: [], reviews: [], error: null, heads: [], rpcError: null, rpcCalls: [] };
  const from = vi.fn((table) => {
    const rec = { eq: [], head: false };
    const q = {
      select: (_cols, opts) => { if (opts?.head) rec.head = true; return q; },
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      then: (res, rej) => {
        if (state.error) return Promise.resolve({ data: null, count: null, error: state.error }).then(res, rej);
        const rows = table === 'online_orders' ? state.orders : state.reviews;
        state.heads.push({ table, head: rec.head, eq: rec.eq });
        const count = rows.filter((r) => rec.eq.every(([c, v]) => r[c] === v)).length;
        return Promise.resolve({ data: null, count, error: null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (fn, args) => {
    state.rpcCalls.push([fn, args]);
    if (state.rpcError) return { data: null, error: state.rpcError };
    const o = state.orders.find((x) => x.id === args.p_order_id);
    if (o) o.status = args.p_to;
    return { data: { ok: true }, error: null };
  });
  return { state, from, rpc, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const ordersBadge = (c) => c.querySelector('[aria-label$="por preparar"]');

describe('servicio: countOrdersToPrepare y evento al cambiar de estado', () => {
  beforeEach(() => { supa = fakeSupabase(); });

  it('cuenta solo pedidos pagados con una consulta HEAD (sin descargar filas)', async () => {
    supa.state.orders = [{ id: 'o1', status: 'paid' }, { id: 'o2', status: 'paid' }, { id: 'o3', status: 'processing' }];
    const { countOrdersToPrepare } = await import('../services/adminService');
    expect(await countOrdersToPrepare()).toBe(2);
    expect(supa.state.heads.at(-1)).toEqual({ table: 'online_orders', head: true, eq: [['status', 'paid']] });
  });

  it('un error de la BD sube como error (no como 0)', async () => {
    supa.state.error = { code: '42501', message: 'permission denied' };
    const { countOrdersToPrepare } = await import('../services/adminService');
    await expect(countOrdersToPrepare()).rejects.toThrow();
  });

  it('transitionOrder avisa al menú solo cuando la BD acepta el cambio', async () => {
    const { adminService, ORDERS_CHANGED_EVENT } = await import('../services/adminService');
    const seen = vi.fn();
    window.addEventListener(ORDERS_CHANGED_EVENT, seen);
    supa.state.orders = [{ id: 'o1', status: 'paid' }];
    await adminService.transitionOrder('o1', 'processing');
    expect(seen).toHaveBeenCalledTimes(1);
    supa.state.rpcError = { code: 'P0001', message: 'JM_INVALID_TRANSITION' };
    await expect(adminService.transitionOrder('o1', 'delivered')).rejects.toBeTruthy();
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener(ORDERS_CHANGED_EVENT, seen);
  });
});

describe('insignia de pedidos por preparar en el menú del admin', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

  const render = async () => {
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await flush();
  };

  it('muestra los pagados en «Pedidos», baja al preparar uno y se oculta en 0', async () => {
    supa.state.orders = [{ id: 'o1', status: 'paid' }, { id: 'o2', status: 'paid' }, { id: 'o3', status: 'shipped' }];
    await render();
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin/pedidos');
    expect(ordersBadge(link).textContent).toBe('2');
    expect(ordersBadge(link).getAttribute('aria-label')).toBe('2 pedidos por preparar');
    const { adminService } = await import('../services/adminService');
    await act(async () => { await adminService.transitionOrder('o1', 'processing'); });
    await flush();
    expect(ordersBadge(container).textContent).toBe('1');
    expect(ordersBadge(container).getAttribute('aria-label')).toBe('1 pedido por preparar');
    await act(async () => { await adminService.transitionOrder('o2', 'processing'); });
    await flush();
    expect(ordersBadge(container)).toBeNull();
  });

  it('se reconsulta periódicamente: un pago que llega por webhook aparece sin navegar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await render();
    expect(ordersBadge(container)).toBeNull();
    supa.state.orders.push({ id: 'o9', status: 'paid' });
    const { ORDERS_POLL_MS } = await import('../services/adminService');
    await act(async () => { vi.advanceTimersByTime(ORDERS_POLL_MS); });
    await flush();
    expect(ordersBadge(container).textContent).toBe('1');
  });

  it('muestra 99+ con más de 99 pedidos', async () => {
    supa.state.orders = Array.from({ length: 120 }, (_, i) => ({ id: `o${i}`, status: 'paid' }));
    await render();
    expect(ordersBadge(container).textContent).toBe('99+');
    expect(ordersBadge(container).getAttribute('aria-label')).toBe('120 pedidos por preparar');
  });

  it('si el conteo falla no muestra insignia ni rompe el menú', async () => {
    supa.state.error = { code: '42501', message: 'denied' };
    await render();
    expect(container.textContent).toContain('Pedidos');
    expect(ordersBadge(container)).toBeNull();
  });

  it('al desmontar deja de reconsultar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await render();
    const before = supa.state.heads.filter((h) => h.table === 'online_orders').length;
    act(() => root.unmount());
    root = createRoot(container);
    const { ORDERS_POLL_MS } = await import('../services/adminService');
    vi.advanceTimersByTime(ORDERS_POLL_MS * 3);
    expect(supa.state.heads.filter((h) => h.table === 'online_orders').length).toBe(before);
  });
});

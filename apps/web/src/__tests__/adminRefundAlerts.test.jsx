// @vitest-environment jsdom
// Ejecución 132 (pendiente 0(cc)): la campana y el menú «Pedidos» del admin avisan de las devoluciones registradas que
// siguen pendientes de hacer en Wompi (`order_refunds.status = 'requested'`). Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

function fakeSupabase() {
  const state = { orders: [], reviews: [], refunds: [], refundError: null, refundReads: 0 };
  const from = vi.fn((table) => {
    const rec = { eq: [], range: null };
    const q = {
      select: () => q,
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      order: () => q,
      range: (a, b) => { rec.range = [a, b]; return q; },
      then: (res, rej) => {
        const match = (r) => rec.eq.every(([c, v]) => r[c] === v);
        if (table === 'order_refunds') {
          state.refundReads += 1;
          if (state.refundError) return Promise.resolve({ data: null, error: state.refundError }).then(res, rej);
          const rows = state.refunds.filter(match);
          const [a, b] = rec.range ?? [0, rows.length - 1];
          return Promise.resolve({ data: rows.slice(a, b + 1), error: null }).then(res, rej);
        }
        const rows = table === 'online_orders' ? state.orders : state.reviews;
        return Promise.resolve({ data: null, count: rows.filter(match).length, error: null }).then(res, rej);
      },
    };
    return q;
  });
  const rpc = vi.fn(async (fn, args) => {
    if (fn === 'admin_mark_refund_processed') {
      const r = state.refunds.find((x) => x.id === args.p_refund_id);
      if (r) r.status = 'processed';
    }
    return { data: { ok: true }, error: null };
  });
  return { state, from, rpc, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('campana: aviso de devoluciones pendientes (puro)', () => {
  it('lista las devoluciones con enlace al filtro, entre pedidos y reseñas', async () => {
    const { adminNotificationItems, adminNotificationsLabel } = await import('../components/Common/AdminNotifications');
    expect(adminNotificationItems({ pendingRefunds: 0 })).toEqual([]);
    expect(adminNotificationItems({ ordersToPrepare: 1, pendingRefunds: 2, pendingReviews: 1 }).map((i) => i.key)).toEqual(['pedidos', 'devoluciones', 'reviews']);
    expect(adminNotificationItems({ pendingRefunds: 1 })).toEqual([
      { key: 'devoluciones', to: '/admin/pedidos?devolucion=pendiente', text: '1 devolución pendiente en Wompi' },
    ]);
    expect(adminNotificationsLabel({ pendingRefunds: 3 })).toBe('Avisos: 3 devoluciones pendientes en Wompi');
  });
});

describe('<AdminNotifications> con devoluciones', () => {
  let container; let root; let loc;
  const Where = () => { loc = useLocation(); return null; };
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('suma las devoluciones a la insignia y el enlace abre el filtro', async () => {
    const { AdminNotifications } = await import('../components/Common/AdminNotifications');
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/admin/dashboard']}>
          <Routes><Route path="*" element={<><AdminNotifications ordersToPrepare={1} pendingRefunds={2} /><Where /></>} /></Routes>
        </MemoryRouter>
      );
    });
    expect(container.querySelector('[data-testid="admin-notifications-badge"]').textContent).toBe('3');
    const btn = container.querySelector('[data-testid="admin-notifications"]');
    act(() => btn.click());
    const link = container.querySelector('[data-testid="admin-notification-devoluciones"]');
    expect(link.textContent).toBe('2 devoluciones pendientes en Wompi');
    act(() => link.click());
    expect(loc.pathname + loc.search).toBe('/admin/pedidos?devolucion=pendiente');
  });
});

describe('menú y campana del AdminLayout', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

  const render = async () => {
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await flush();
  };
  const refundBadge = () => container.querySelector('[data-testid="admin-nav-refund-badge"]');
  const bellLabel = () => container.querySelector('[data-testid="admin-notifications-label"]').textContent;

  it('cuenta solo las `requested`, se distingue de «por preparar» y desaparece al marcarlas hechas', async () => {
    supa.state.orders = [{ id: 'o1', status: 'paid' }];
    supa.state.refunds = [
      { id: 'r1', order_id: 'o2', amount: 50000, status: 'requested' },
      { id: 'r2', order_id: 'o3', amount: 30000, status: 'requested' },
      { id: 'r3', order_id: 'o4', amount: 10000, status: 'processed' },
    ];
    await render();
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin/pedidos');
    expect(link.contains(refundBadge())).toBe(true);
    expect(refundBadge().getAttribute('aria-label')).toBe('2 devoluciones pendientes en Wompi');
    expect(link.querySelector('[aria-label$="por preparar"]').textContent).toBe('1');
    expect(bellLabel()).toBe('Avisos: 1 pedido pagado por preparar, 2 devoluciones pendientes en Wompi');
    expect(container.querySelector('[data-testid="admin-notifications-badge"]').textContent).toBe('3');

    const { adminService } = await import('../services/adminService');
    await act(async () => { await adminService.markRefundProcessed('r1', 'W-1'); });
    await flush();
    expect(refundBadge().getAttribute('aria-label')).toBe('1 devolución pendiente en Wompi');
    await act(async () => { await adminService.markRefundProcessed('r2', 'W-2'); });
    await flush();
    expect(refundBadge()).toBeNull();
    expect(bellLabel()).toBe('Avisos: 1 pedido pagado por preparar');
  });

  it('una devolución registrada por otro administrador aparece con el sondeo', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await render();
    expect(refundBadge()).toBeNull();
    supa.state.refunds.push({ id: 'r9', order_id: 'o9', amount: 1000, status: 'requested' });
    const { ORDERS_POLL_MS } = await import('../services/adminService');
    await act(async () => { vi.advanceTimersByTime(ORDERS_POLL_MS); });
    await flush();
    expect(refundBadge().getAttribute('aria-label')).toBe('1 devolución pendiente en Wompi');
  });

  it('si la lectura falla (p. ej. tabla sin migrar) no hay aviso y el menú funciona', async () => {
    supa.state.refundError = { code: 'PGRST205', message: 'relation not found' };
    supa.state.orders = [{ id: 'o1', status: 'paid' }];
    await render();
    expect(supa.state.refundReads).toBeGreaterThan(0);
    expect(refundBadge()).toBeNull();
    expect(container.textContent).toContain('Pedidos');
    expect(bellLabel()).toBe('Avisos: 1 pedido pagado por preparar');
  });
});

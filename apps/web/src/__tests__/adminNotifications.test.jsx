// @vitest-environment jsdom
// Ejecución 105 (pendiente 0(be)): la campana del admin es un aviso real (pedidos por preparar + reseñas por moderar).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AdminNotifications, adminNotificationItems, adminNotificationsLabel } from '../components/Common/AdminNotifications';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('funciones puras', () => {
  it('solo lista lo que tiene pendientes, con enlaces a las listas filtradas', () => {
    expect(adminNotificationItems({ ordersToPrepare: 0, pendingReviews: 0 })).toEqual([]);
    expect(adminNotificationItems({ ordersToPrepare: 2, pendingReviews: 1 })).toEqual([
      { key: 'pedidos', to: '/admin/pedidos?estado=paid', text: '2 pedidos pagados por preparar' },
      { key: 'reviews', to: '/admin/reviews?estado=pending', text: '1 reseña por moderar' },
    ]);
    expect(adminNotificationItems({ ordersToPrepare: 1 }).map((i) => i.text)).toEqual(['1 pedido pagado por preparar']);
  });
  it('nombre accesible con y sin pendientes', () => {
    expect(adminNotificationsLabel({})).toBe('Avisos: sin pendientes');
    expect(adminNotificationsLabel({ ordersToPrepare: 3, pendingReviews: 2 })).toBe('Avisos: 3 pedidos pagados por preparar, 2 reseñas por moderar');
  });
});

describe('<AdminNotifications>', () => {
  let container; let root; let loc;
  const Where = () => { loc = useLocation(); return null; };
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const render = (props) => act(() => {
    root.render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes><Route path="*" element={<><AdminNotifications {...props} /><a href="#fuera">fuera</a><Where /></>} /></Routes>
      </MemoryRouter>
    );
  });
  const btn = () => container.querySelector('[data-testid="admin-notifications"]');

  it('es un botón con nombre accesible y total en la insignia (99+ si es grande)', () => {
    render({ ordersToPrepare: 2, pendingReviews: 3 });
    expect(btn().tagName).toBe('BUTTON');
    expect(btn().textContent).toContain('Avisos: 2 pedidos pagados por preparar, 3 reseñas por moderar');
    expect(container.querySelector('[data-testid="admin-notifications-badge"]').textContent).toBe('5');
    expect(btn().getAttribute('aria-expanded')).toBe('false');
    render({ ordersToPrepare: 120, pendingReviews: 0 });
    expect(container.querySelector('[data-testid="admin-notifications-badge"]').textContent).toBe('99+');
  });

  it('sin pendientes no hay insignia y la lista lo dice', () => {
    render({});
    expect(container.querySelector('[data-testid="admin-notifications-badge"]')).toBeNull();
    act(() => btn().click());
    expect(btn().getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#jm-admin-notifications').textContent).toContain('No hay pedidos por preparar, devoluciones pendientes ni reseñas por moderar');
  });

  it('abre la lista y el enlace lleva a la lista filtrada cerrando el panel', () => {
    render({ ordersToPrepare: 1, pendingReviews: 2 });
    act(() => btn().click());
    expect(btn().getAttribute('aria-controls')).toBe('jm-admin-notifications');
    const link = container.querySelector('[data-testid="admin-notification-reviews"]');
    expect(link.getAttribute('href')).toBe('/admin/reviews?estado=pending');
    act(() => link.click());
    expect(loc.pathname + loc.search).toBe('/admin/reviews?estado=pending');
    expect(container.querySelector('#jm-admin-notifications')).toBeNull();
  });

  it('Escape cierra y devuelve el foco al botón', () => {
    render({ ordersToPrepare: 1 });
    act(() => btn().click());
    const link = container.querySelector('[data-testid="admin-notification-pedidos"]');
    link.focus();
    act(() => { link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(container.querySelector('#jm-admin-notifications')).toBeNull();
    expect(document.activeElement).toBe(btn());
  });
});

describe('integración en AdminLayout', () => {
  let container; let root; let supa;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.resetModules(); vi.doUnmock('../config/supabase'); });

  it('la cabecera muestra la campana con los conteos reales de pedidos pagados y reseñas pendientes', async () => {
    const rows = { online_orders: [{ status: 'paid' }, { status: 'paid' }, { status: 'shipped' }], product_reviews: [{ status: 'pending' }] };
    supa = {
      from: (table) => {
        const eqs = [];
        const q = {
          select: () => q,
          eq: (c, v) => { eqs.push([c, v]); return q; },
          then: (res, rej) => Promise.resolve({ data: null, count: (rows[table] || []).filter((r) => eqs.every(([c, v]) => r[c] === v)).length, error: null }).then(res, rej),
        };
        return q;
      },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    };
    vi.doMock('../config/supabase', () => ({ default: supa, supabase: supa }));
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const bell = container.querySelector('header [data-testid="admin-notifications"]');
    expect(bell).not.toBeNull();
    expect(bell.textContent).toContain('Avisos: 2 pedidos pagados por preparar, 1 reseña por moderar');
    expect(container.querySelector('[data-testid="admin-notifications-badge"]').textContent).toBe('3');
  });
});

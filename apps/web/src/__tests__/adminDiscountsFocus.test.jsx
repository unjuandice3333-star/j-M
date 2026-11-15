// @vitest-environment jsdom
// Ejecución 148 (D126): «Activar/Desactivar» un cupón que sale del filtro de estado dejaba el foco en <body>.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const db = { rows: [] };
vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));
vi.mock('../services/couponsAdminService', async (orig) => {
  const real = await orig();
  const svc = {
    list: vi.fn(async () => db.rows.map((r) => ({ ...r }))),
    usage: vi.fn(async () => ({})),
    setActive: vi.fn(async (id, on) => { db.rows.find((r) => r.id === id).is_active = on; }),
    save: vi.fn(),
  };
  return { ...real, couponsAdminService: svc, default: svc };
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cp = (id, code, is_active) => ({ id, code, description: '', discount_type: 'percent', discount_value: 10, min_subtotal: 0, max_uses: null,
  max_uses_per_email: null, used_count: 0, is_active, starts_at: null, expires_at: null, created_at: '2026-11-01T00:00:00Z' });

describe('AdminDiscountsPage: foco tras activar/desactivar (D126)', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const flush = async () => { for (let i = 0; i < 3; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const render = async (url) => {
    const { AdminDiscountsPage } = await import('../pages/admin/AdminDiscountsPage');
    await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><AdminDiscountsPage /></MemoryRouter>); });
    await flush();
  };
  const row = (id) => container.querySelector(`tr[data-row-key="${id}"]`);
  const btn = (scope, label) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const press = async (el) => { el.focus(); await act(async () => { el.click(); }); await flush(); };

  it('en «Activos»: la fila sale → foco en la que ocupó su lugar (no en su botón), luego en el aviso de vacío', async () => {
    db.rows = [cp('a', 'AAA', true), cp('b', 'BBB', true)];
    await render('/admin/descuentos?estado=activos');
    await press(btn(row('a'), 'Desactivar'));
    expect(row('a')).toBeNull();
    expect(document.activeElement).toBe(row('b'));
    await press(btn(row('b'), 'Desactivar'));
    expect(document.activeElement.textContent).toBe('No hay cupones con este filtro.');
  });

  it('en «Todos»: la fila sigue → foco en el mismo botón, ahora «Activar»', async () => {
    db.rows = [cp('a', 'AAA', true)];
    await render('/admin/descuentos');
    await press(btn(row('a'), 'Desactivar'));
    expect(document.activeElement).toBe(btn(row('a'), 'Activar'));
  });
});

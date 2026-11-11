// @vitest-environment jsdom
// Admin del boletín (ejecución 69): filtro, CSV sin inyección de fórmulas, paginación completa,
// baja/reactivación y aviso cuando la RLS no deja actualizar. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { csvCell, filterSubscribers, subscribersToCsv, summarizeSubscribers } from '../utils/newsletterAdmin';

function fakeSupabase() {
  const state = { rows: [], error: null, updateBlocked: false, ranges: [], updates: [] };
  const from = vi.fn(() => {
    const rec = { range: null, update: null, eq: null };
    const q = {
      select: () => q, order: () => q,
      eq: (c, v) => { rec.eq = [c, v]; return q; },
      range: (a, b) => { rec.range = [a, b]; state.ranges.push([a, b]); return q; },
      update: (patch) => { rec.update = patch; return q; },
      then: (res, rej) => {
        if (state.error) return Promise.resolve({ data: null, error: state.error }).then(res, rej);
        if (rec.update) {
          state.updates.push({ id: rec.eq[1], ...rec.update });
          if (state.updateBlocked) return Promise.resolve({ data: [], error: null }).then(res, rej);
          const row = state.rows.find((r) => r.id === rec.eq[1]);
          Object.assign(row, rec.update);
          return Promise.resolve({ data: [{ ...row }], error: null }).then(res, rej);
        }
        const rows = rec.range ? state.rows.slice(rec.range[0], rec.range[1] + 1) : state.rows;
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(res, rej);
      },
    };
    return q;
  });
  return { state, from, rpc: vi.fn() };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sub = (i, extra = {}) => ({ id: `id-${i}`, email: `persona${i}@correo.co`, source: 'home', user_id: null,
  subscribed_at: '2026-11-01T10:00:00Z', unsubscribed_at: null, created_at: '2026-11-01T10:00:00Z', ...extra });

describe('utilidades del boletín', () => {
  const rows = [sub(1), sub(2, { unsubscribed_at: '2026-11-05T00:00:00Z' }), sub(3, { source: 'checkout', email: 'Ana@Correo.co' })];
  it('filtra por estado y texto sin distinguir mayúsculas', () => {
    expect(filterSubscribers(rows, '', 'activos').map((r) => r.id)).toEqual(['id-1', 'id-3']);
    expect(filterSubscribers(rows, '', 'bajas').map((r) => r.id)).toEqual(['id-2']);
    expect(filterSubscribers(rows, 'ana@', 'todos').map((r) => r.id)).toEqual(['id-3']);
    expect(filterSubscribers(rows, 'CHECKOUT', 'activos').map((r) => r.id)).toEqual(['id-3']);
    expect(summarizeSubscribers(rows)).toEqual({ total: 3, active: 2, unsubscribed: 1 });
  });
  it('CSV con BOM, comillas y celdas de fórmula neutralizadas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+57')).toBe("'+57");
    expect(csvCell('a,b')).toBe('"a,b"');
    const csv = subscribersToCsv([sub(1), sub(2, { unsubscribed_at: '2026-11-05T00:00:00Z', user_id: 'u' })]);
    expect(csv.startsWith('\uFEFFcorreo,estado,origen,suscrito,baja,cuenta\r\n')).toBe(true);
    expect(csv).toContain('persona1@correo.co,activo,home,2026-11-01T10:00:00Z,,no\r\n');
    expect(csv).toContain('persona2@correo.co,baja,home,2026-11-01T10:00:00Z,2026-11-05T00:00:00Z,sí\r\n');
  });
});

describe('AdminNewsletterPage', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  const render = async () => {
    const { AdminNewsletterPage } = await import('../pages/admin/AdminNewsletterPage');
    await act(async () => { root.render(<AdminNewsletterPage />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  const button = (label) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent.includes(label));

  it('carga todas las filas por páginas (más de 1000) y muestra el resumen', async () => {
    supa.state.rows = Array.from({ length: 1203 }, (_, i) => sub(i, i % 10 === 0 ? { unsubscribed_at: '2026-11-05T00:00:00Z' } : {}));
    await render();
    expect(supa.state.ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(container.textContent).toContain('BOLETÍN (1082)');
    expect(container.textContent).toContain('121 dados de baja · 1203 en total');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1082);
  });

  it('da de baja tras confirmar y luego reactiva', async () => {
    supa.state.rows = [sub(1)];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await act(async () => { button('Dar de baja persona1@correo.co').click(); });
    expect(supa.state.updates[0].id).toBe('id-1');
    expect(supa.state.updates[0].unsubscribed_at).toMatch(/^\d{4}-/);
    expect(container.querySelector('[role=status]').textContent).toContain('dado de baja');
    expect(container.textContent).toContain('No hay suscriptores con este filtro.');
    const select = container.querySelector('select[aria-label="Filtrar por estado"]');
    await act(async () => { select.value = 'bajas'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { button('Reactivar persona1@correo.co').click(); });
    expect(supa.state.updates[1]).toEqual({ id: 'id-1', unsubscribed_at: null });
    expect(container.querySelector('[role=status]').textContent).toContain('reactivado');
  });

  it('no da de baja si se cancela la confirmación', async () => {
    supa.state.rows = [sub(1)];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render();
    await act(async () => { button('Dar de baja persona1@correo.co').click(); });
    expect(supa.state.updates).toHaveLength(0);
  });

  it('avisa cuando la RLS no deja actualizar (0 filas) y no cambia el estado', async () => {
    supa.state.rows = [sub(1)];
    supa.state.updateBlocked = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await act(async () => { button('Dar de baja persona1@correo.co').click(); });
    expect(container.querySelector('[role=alert]').textContent).toContain('sin permiso');
    expect(container.textContent).toContain('Activo');
  });

  it('explica la migración faltante si la tabla no existe', async () => {
    supa.state.error = { code: 'PGRST205', message: 'not found' };
    await render();
    expect(container.querySelector('[role=alert]').textContent).toContain('20261111140000');
  });

  it('exporta el CSV de la vista filtrada', async () => {
    supa.state.rows = [sub(1), sub(2, { unsubscribed_at: '2026-11-05T00:00:00Z' })];
    const blobs = [];
    globalThis.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x'; });
    globalThis.URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await render();
    await act(async () => { button('Exportar CSV').click(); });
    expect(clicked).toHaveBeenCalledTimes(1);
    const text = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blobs[0]); });
    expect(text).toContain('persona1@correo.co,activo');
    expect(text).not.toContain('persona2@correo.co');
  });
});

// @vitest-environment jsdom
// Ejecución 147 (D125): foco tras una acción por fila en el admin. Antes, al aprobar/rechazar una reseña en
// «Pendiente» (sale de la lista) o al guardar la respuesta (el botón desaparece), el foco caía en <body>.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { restoreRowFocus } from '../hooks/useRowFocusRestore';

describe('restoreRowFocus', () => {
  let box;
  beforeEach(() => {
    box = document.createElement('div');
    box.innerHTML = `
      <article data-row-key="a"><textarea data-row-fallback></textarea><button data-row-action="ok">A</button></article>
      <article data-row-key="b"><textarea data-row-fallback></textarea><button data-row-action="ok">B</button></article>
      <article data-row-key="c"><button data-row-action="ok" disabled>C</button></article>`;
    document.body.appendChild(box);
    document.body.focus();
  });
  afterEach(() => box.remove());
  const row = (k) => box.querySelector(`[data-row-key="${k}"]`);

  it('fila presente: vuelve al mismo control', () => {
    expect(restoreRowFocus(box, { key: 'b', action: 'ok', index: 1 })).toBe(row('b').querySelector('button'));
    expect(document.activeElement).toBe(row('b').querySelector('button'));
  });
  it('control ausente o deshabilitado: respaldo de la fila o la propia fila', () => {
    expect(restoreRowFocus(box, { key: 'a', action: 'reply', index: 0 })).toBe(row('a').querySelector('textarea'));
    document.activeElement.blur();
    expect(restoreRowFocus(box, { key: 'c', action: 'ok', index: 2 })).toBe(row('c'));
    expect(row('c').getAttribute('tabindex')).toBe('-1');
  });
  it('fila que salió de la lista: la que ocupó su lugar (nunca uno de sus botones) o la última', () => {
    row('b').remove();
    expect(restoreRowFocus(box, { key: 'b', action: 'ok', index: 1 })).toBe(row('c'));
    document.activeElement.blur();
    row('c').remove();
    expect(restoreRowFocus(box, { key: 'c', action: 'ok', index: 2 })).toBe(row('a'));
  });
  it('lista vacía: aviso de vacío o el contenedor', () => {
    box.innerHTML = '<p data-row-empty>Nada</p>';
    expect(restoreRowFocus(box, { key: 'a', index: 0 })).toBe(box.querySelector('p'));
    document.activeElement.blur();
    box.innerHTML = '';
    expect(restoreRowFocus(box, { key: 'a', index: 0 })).toBe(box);
  });
  it('no mueve el foco si el usuario ya está en otro sitio', () => {
    const other = document.createElement('input'); document.body.appendChild(other); other.focus();
    expect(restoreRowFocus(box, { key: 'b', action: 'ok', index: 1 })).toBeNull();
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

function fakeSupabase() {
  const state = { rows: [] };
  const from = vi.fn(() => {
    const rec = { range: null, update: null, eq: [], head: false };
    const q = {
      select: (_c, opts) => { if (opts?.head) rec.head = true; return q; },
      order: () => q,
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      range: (a, b) => { rec.range = [a, b]; return q; },
      update: (patch) => { rec.update = patch; return q; },
      then: (res, rej) => {
        const match = (r) => rec.eq.every(([c, v]) => r[c] === v);
        if (rec.head) return Promise.resolve({ data: null, count: state.rows.filter(match).length, error: null }).then(res, rej);
        if (rec.update) {
          const hit = state.rows.filter(match); hit.forEach((r) => Object.assign(r, rec.update));
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null }).then(res, rej);
        }
        const rows = rec.range ? state.rows.slice(rec.range[0], rec.range[1] + 1) : state.rows;
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(res, rej);
      },
    };
    return q;
  });
  return { state, from, rpc: vi.fn(), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}
let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rv = (i, extra = {}) => ({ id: `r${i}`, product_id: 'p1', products: { name: 'Polo', slug: 'polo' }, author_name: `Autor ${i}`, city: 'Bogotá',
  rating: 5, title: `Título ${i}`, comment: 'Buena tela', status: 'pending', admin_reply: null, is_verified_buyer: true, created_at: '2026-11-01T10:00:00Z', ...extra });

describe('AdminReviewsPage: foco tras moderar (D125)', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  const flush = async () => { for (let i = 0; i < 3; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const render = async (url = '/admin/reviews') => {
    const { AdminReviewsPage } = await import('../pages/admin/AdminReviewsPage');
    await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><AdminReviewsPage /></MemoryRouter>); });
    await flush();
  };
  const art = (id) => container.querySelector(`article[data-row-key="${id}"]`);
  const press = async (el) => { el.focus(); await act(async () => { el.click(); }); await flush(); };
  const btn = (scope, label) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === label);

  it('aprobar en «Pendiente» lleva el foco a la reseña que ocupó su lugar, y luego a la anterior y al aviso de vacío', async () => {
    supa.state.rows = [rv(1), rv(2), rv(3)];
    await render();
    await press(btn(art('r1'), 'Aprobar'));
    expect(art('r1')).toBeNull();
    expect(document.activeElement).toBe(art('r2'));
    await press(btn(art('r3'), 'Rechazar'));
    expect(document.activeElement).toBe(art('r2'));
    await press(btn(art('r2'), 'Aprobar'));
    expect(container.querySelectorAll('article').length).toBe(0);
    expect(document.activeElement.textContent).toBe('No hay reseñas con estos filtros.');
  });

  it('en «Todas» la reseña sigue: el foco va a un botón que siga existiendo o a la respuesta', async () => {
    supa.state.rows = [rv(1), rv(2)];
    await render('/admin/reviews?estado=todas');
    await press(btn(art('r1'), 'Aprobar')); // «Aprobar» desaparece al quedar aprobada
    expect(document.activeElement).toBe(art('r1').querySelector('textarea'));
    await press(btn(art('r2'), 'Rechazar'));
    expect(document.activeElement).toBe(art('r2').querySelector('textarea'));
    const ta = art('r2').querySelector('textarea');
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Gracias'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await press(btn(art('r2'), 'Guardar respuesta'));
    expect(btn(art('r2'), 'Guardar respuesta')).toBeUndefined();
    expect(document.activeElement).toBe(art('r2').querySelector('textarea'));
  });
});

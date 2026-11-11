// @vitest-environment jsdom
// /admin/reviews (ejecución 73): filtro por producto y texto sin tildes, contadores por estado, carga paginada,
// «Guardar respuesta» sin cambiar el estado, escritura sin filas (RLS) no presentada como éxito y contador
// de pendientes del menú. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { countReviewsByStatus, filterReviews, normalizeReply, reviewProducts, REVIEW_REPLY_MAX } from '../utils/reviewsAdmin';

function fakeSupabase() {
  const state = { rows: [], error: null, updateBlocked: false, ranges: [], updates: [], heads: [] };
  const from = vi.fn(() => {
    const rec = { range: null, update: null, eq: [], head: false };
    const q = {
      select: (_cols, opts) => { if (opts?.head) rec.head = true; return q; },
      order: () => q,
      eq: (c, v) => { rec.eq.push([c, v]); return q; },
      range: (a, b) => { rec.range = [a, b]; state.ranges.push([a, b]); return q; },
      update: (patch) => { rec.update = patch; return q; },
      then: (res, rej) => {
        if (state.error) return Promise.resolve({ data: null, error: state.error }).then(res, rej);
        const match = (r) => rec.eq.every(([c, v]) => r[c] === v);
        if (rec.head) { state.heads.push(rec.eq); return Promise.resolve({ data: null, count: state.rows.filter(match).length, error: null }).then(res, rej); }
        if (rec.update) {
          state.updates.push({ eq: rec.eq, ...rec.update });
          if (state.updateBlocked) return Promise.resolve({ data: [], error: null }).then(res, rej);
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

const P1 = { id: 'p1', name: 'Polo Clásico' }; const P2 = { id: 'p2', name: 'Pantalón Cargo' };
const rv = (i, extra = {}) => ({ id: `r${i}`, product_id: P1.id, products: { name: P1.name, slug: 'polo' }, author_name: `Autor ${i}`, city: 'Bogotá',
  rating: 5, title: `Título ${i}`, comment: 'Buena tela', status: 'pending', admin_reply: null, is_verified_buyer: true, created_at: '2026-11-01T10:00:00Z', ...extra });

describe('utilidades de reseñas del admin', () => {
  const rows = [rv(1), rv(2, { status: 'approved', product_id: P2.id, products: { name: P2.name }, comment: 'El pantalón quedó perfecto' }),
    rv(3, { status: 'rejected', city: 'Medellín' }), rv(4, { product_id: P2.id, products: { name: P2.name } })];
  it('filtra por estado, producto y texto sin tildes ni mayúsculas', () => {
    expect(filterReviews(rows, { status: 'pending' }).map((r) => r.id)).toEqual(['r1', 'r4']);
    expect(filterReviews(rows, { productId: 'p2' }).map((r) => r.id)).toEqual(['r2', 'r4']);
    expect(filterReviews(rows, { query: 'PANTALON' }).map((r) => r.id)).toEqual(['r2', 'r4']);
    expect(filterReviews(rows, { query: 'medellin' }).map((r) => r.id)).toEqual(['r3']);
    expect(filterReviews(rows, { status: 'approved', productId: 'p1' })).toEqual([]);
  });
  it('cuenta por estado y lista productos ordenados con pendientes', () => {
    expect(countReviewsByStatus(rows)).toEqual({ todas: 4, pending: 2, approved: 1, rejected: 1 });
    expect(reviewProducts(rows)).toEqual([{ id: 'p2', name: 'Pantalón Cargo', total: 2, pending: 1 }, { id: 'p1', name: 'Polo Clásico', total: 2, pending: 1 }]);
  });
  it('normaliza la respuesta y rechaza la demasiado larga', () => {
    expect(normalizeReply('  Gracias  ')).toEqual({ value: 'Gracias' });
    expect(normalizeReply('   ')).toEqual({ value: null });
    expect(normalizeReply('x'.repeat(REVIEW_REPLY_MAX + 1)).error).toMatch(/no puede superar/);
  });
});

describe('AdminReviewsPage', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const render = async () => {
    const { AdminReviewsPage } = await import('../pages/admin/AdminReviewsPage');
    await act(async () => { root.render(<AdminReviewsPage />); });
    await flush();
  };
  const button = (label, scope = container) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label));
  const card = (title) => [...container.querySelectorAll('article')].find((a) => a.textContent.includes(title));
  const change = async (el, value) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  };

  it('carga todas las páginas (más de 1000) y muestra contadores por estado', async () => {
    supa.state.rows = Array.from({ length: 1005 }, (_, i) => rv(i, i % 5 === 0 ? { status: 'approved' } : {}));
    await render();
    expect(supa.state.ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(button('Pendiente').textContent).toBe('Pendiente (804)');
    expect(button('Aprobada').textContent).toBe('Aprobada (201)');
    expect(button('Todas').textContent).toBe('Todas (1005)');
    expect(container.querySelectorAll('article').length).toBe(804);
  });

  it('filtra por producto y por texto; los contadores siguen al filtro', async () => {
    supa.state.rows = [rv(1), rv(2, { product_id: 'p2', products: { name: P2.name }, title: 'Talla exacta' }), rv(3, { status: 'approved', product_id: 'p2', products: { name: P2.name } })];
    await render();
    const select = container.querySelector('select[aria-label="Filtrar por producto"]');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Todos los productos', 'Pantalón Cargo (2 · 1 pendiente)', 'Polo Clásico (1 · 1 pendiente)']);
    await change(select, 'p2');
    expect(button('Todas').textContent).toBe('Todas (2)');
    expect([...container.querySelectorAll('article')].map((a) => a.getAttribute('aria-label'))).toEqual(['Reseña de Autor 2: Talla exacta']);
    await change(select, '');
    await change(container.querySelector('input[aria-label="Buscar reseñas"]'), 'TITULO 1');
    expect(container.querySelectorAll('article').length).toBe(1);
    expect(card('Título 1')).toBeTruthy();
    await change(container.querySelector('input[aria-label="Buscar reseñas"]'), 'nada que coincida');
    expect(container.textContent).toContain('No hay reseñas con estos filtros.');
  });

  it('aprueba con respuesta y avisa al menú para recontar', async () => {
    supa.state.rows = [rv(1)];
    const heard = vi.fn(); window.addEventListener('jm:admin-reviews-changed', heard);
    await render();
    await change(card('Título 1').querySelector('textarea'), '  ¡Gracias!  ');
    await act(async () => { button('Aprobar', card('Título 1')).click(); });
    await flush();
    expect(supa.state.updates[0]).toMatchObject({ eq: [['id', 'r1']], status: 'approved', admin_reply: '¡Gracias!' });
    expect(container.querySelector('[role="status"]').textContent).toBe('Reseña de Autor 1: aprobada.');
    expect(button('Pendiente').textContent).toBe('Pendiente (0)');
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('jm:admin-reviews-changed', heard);
  });

  it('guarda solo la respuesta de una reseña aprobada sin cambiar su estado', async () => {
    supa.state.rows = [rv(1, { status: 'approved', admin_reply: 'Gracias' })];
    await render();
    await act(async () => { button('Aprobada').click(); });
    expect(button('Guardar respuesta', card('Título 1'))).toBeUndefined(); // sin cambios no se ofrece
    await change(card('Título 1').querySelector('textarea'), 'Gracias, Autor 1');
    await act(async () => { button('Guardar respuesta', card('Título 1')).click(); });
    await flush();
    expect(supa.state.updates).toEqual([{ eq: [['id', 'r1']], admin_reply: 'Gracias, Autor 1' }]);
    expect(supa.state.rows[0].status).toBe('approved');
    expect(container.querySelector('[role="status"]').textContent).toContain('Respuesta guardada');
  });

  it('si la RLS no deja escribir (0 filas) muestra error y no finge éxito', async () => {
    supa.state.rows = [rv(1)]; supa.state.updateBlocked = true;
    await render();
    await act(async () => { button('Rechazar', card('Título 1')).click(); });
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/no tiene permisos de administrador/);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(button('Pendiente').textContent).toBe('Pendiente (1)');
  });

  it('bloquea la respuesta demasiado larga', async () => {
    supa.state.rows = [rv(1)];
    await render();
    await change(card('Título 1').querySelector('textarea'), 'x'.repeat(REVIEW_REPLY_MAX + 1));
    expect(button('Aprobar', card('Título 1')).disabled).toBe(true);
    expect(card('Título 1').textContent).toContain(`Máximo ${REVIEW_REPLY_MAX} caracteres`);
  });
});

describe('contador de pendientes en el menú del admin', () => {
  let container; let root;
  beforeEach(() => { supa = fakeSupabase(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

  it('muestra las pendientes, se actualiza con el evento y se oculta en 0', async () => {
    supa.state.rows = [rv(1), rv(2), rv(3, { status: 'approved' })];
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const badge = () => container.querySelector('[aria-label$="pendientes"], [aria-label$="pendiente"]');
    expect(badge().textContent).toBe('2');
    expect(badge().getAttribute('aria-label')).toBe('2 reseñas pendientes');
    expect(supa.state.heads).toContainEqual([['status', 'pending']]);
    supa.state.rows.forEach((r) => { r.status = 'approved'; });
    await act(async () => { window.dispatchEvent(new Event('jm:admin-reviews-changed')); await new Promise((r) => setTimeout(r, 0)); });
    expect(badge()).toBeNull();
  });

  it('si el conteo falla no muestra contador ni rompe el menú', async () => {
    supa.state.error = { code: '42501', message: 'denied' };
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(container.textContent).toContain('Reviews');
    expect(container.querySelector('[aria-label$="pendientes"]')).toBeNull();
  });
});

// @vitest-environment jsdom
// Ejecución 71: el cliente opina sobre productos que compró (my_product_reviewables / submit_product_review).
// Antes ningún cliente podía crear una reseña. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let supa;
let items;
let submitError;

function fakeSupabase() {
  const rpc = vi.fn(async (name, args) => {
    if (name === 'my_product_reviewables') return { data: items.map((i) => ({ ...i })), error: null };
    if (name === 'submit_product_review') {
      if (submitError) return { data: null, error: submitError };
      const it = items.find((i) => i.order_item_id === args.p_order_item_id);
      it.review = { id: 'r-1', status: 'pending', rating: args.p_rating, title: args.p_title, comment: args.p_comment, admin_reply: null };
      return { data: { id: 'r-1', status: 'pending' }, error: null };
    }
    return { data: null, error: { message: 'rpc no programada' } };
  });
  return { rpc, auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } };
}

vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const form = () => host.querySelector('[data-testid="review-form"]');
const setValue = (el, v) => act(async () => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const submit = async () => { await act(async () => { form().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const submitCalls = () => supa.rpc.mock.calls.filter(([n]) => n === 'submit_product_review');

async function mount(loggedIn = true) {
  const { useAuthStore } = await import('../store/authStore.js');
  useAuthStore.setState({ isLoggedIn: loggedIn, isLoading: false, user: loggedIn ? { id: 'u1', email: 'ana@correo.com' } : null });
  const { ProductReviewForm } = await import('../components/Product/ProductReviewForm.jsx');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter><ProductReviewForm productId="p1" /></MemoryRouter>); });
  await flush();
}

const fill = async () => {
  await click(form().querySelector('[aria-label="4 de 5 estrellas"]'));
  await setValue(form().querySelector('#review-title'), '  Muy cómoda ');
  await setValue(form().querySelector('#review-comment'), 'La tela es gruesa y el corte perfecto.');
};

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  supa = fakeSupabase();
  submitError = null;
  items = [{ order_item_id: 'oi-1', order_number: 'JM-001001', purchased_at: '2026-11-01T10:00:00Z', size_code: 'M', color_name: 'Negro', review: null }];
});

describe('ProductReviewForm', () => {
  it('sin sesión invita a iniciar sesión y no consulta compras', async () => {
    await mount(false);
    expect(form().textContent).toContain('Inicia sesión');
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('sin compras del producto explica que solo opinan compradores', async () => {
    items = [];
    await mount();
    expect(supa.rpc).toHaveBeenCalledWith('my_product_reviewables', { p_product_id: 'p1' });
    expect(form().textContent).toContain('Solo los clientes que compraron este producto pueden opinar');
    expect(form().querySelector('form')).toBeNull();
  });

  it('valida en pantalla antes de llamar a la RPC', async () => {
    await mount();
    await submit();
    expect(submitCalls()).toHaveLength(0);
    expect(form().textContent).toContain('Elige una calificación');
    expect(form().textContent).toContain('El título debe tener');
    expect(form().textContent).toContain('El comentario debe tener');
  });

  it('envía la reseña con el artículo comprado y muestra que queda pendiente', async () => {
    await mount();
    expect(form().textContent).toContain('JM-001001 — Negro · M');
    await fill();
    await submit();
    expect(submitCalls()[0][1]).toEqual({ p_order_item_id: 'oi-1', p_rating: 4, p_title: 'Muy cómoda',
      p_comment: 'La tela es gruesa y el corte perfecto.', p_city: null });
    expect(host.querySelector('[role="status"]').textContent).toContain('Recibimos tu opinión');
    expect(host.querySelector('[data-testid="my-review"]').textContent).toContain('pendiente de aprobación');
    expect(form().querySelector('form')).toBeNull();
  });

  it('con varias compras deja elegir cuál reseñar', async () => {
    items.push({ order_item_id: 'oi-2', order_number: 'JM-001002', purchased_at: '2026-10-01T10:00:00Z', size_code: 'L', color_name: 'Blanco', review: null });
    await mount();
    const sel = form().querySelector('#review-item');
    expect(sel.options).toHaveLength(2);
    await act(async () => { sel.value = 'oi-2'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await fill();
    await submit();
    expect(submitCalls()[0][1].p_order_item_id).toBe('oi-2');
    expect(form().querySelector('form')).not.toBeNull(); // queda oi-1 por reseñar
  });

  it('muestra el estado de reseñas ya enviadas (rechazada) sin formulario', async () => {
    items[0].review = { id: 'r-9', status: 'rejected', rating: 1, title: 'Mala', comment: 'No me gustó nada.', admin_reply: 'Lo sentimos' };
    await mount();
    expect(form().textContent).toContain('no fue publicada');
    expect(form().textContent).toContain('Respuesta de J&M: Lo sentimos');
    expect(form().querySelector('form')).toBeNull();
  });

  it('traduce el rechazo de la BD (ya reseñado) a un mensaje claro', async () => {
    submitError = { code: 'P0001', hint: 'JM_ALREADY_REVIEWED', message: 'Ya opinaste sobre esta compra' };
    await mount();
    await fill();
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toContain('Ya enviaste una opinión sobre esta compra');
  });

  it('traduce el rechazo por producto retirado del catálogo (JM_PRODUCT_INACTIVE)', async () => {
    submitError = { code: 'P0001', hint: 'JM_PRODUCT_INACTIVE', message: 'Este producto ya no está disponible en la tienda' };
    await mount();
    await fill();
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toContain('Este producto ya no está disponible en la tienda');
  });

  it('si la migración no está aplicada, no muestra nada', async () => {
    supa.rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }));
    await mount();
    expect(form()).toBeNull();
  });
});

describe('reviewsService.validateReview', () => {
  it('aplica los mismos límites que la RPC', async () => {
    const { validateReview } = await import('../services/reviewsService.js');
    expect(validateReview({ rating: 5, title: 'Genial', comment: 'Me encantó la tela.' })).toEqual({});
    expect(Object.keys(validateReview({ rating: 6, title: 'ab', comment: 'corto', city: 'x'.repeat(81) })).sort())
      .toEqual(['city', 'comment', 'rating', 'title']);
  });
});

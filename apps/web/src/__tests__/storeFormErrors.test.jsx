// @vitest-environment jsdom
// Ejecución 112 (D83): formularios de la tienda con aviso único — restablecer contraseña, cupón de /carrito, boletín y
// reseña de producto. El aviso queda enlazado al campo que lo causa (aria-invalid + aria-describedby) y el foco va a
// ese campo. Antes: aviso suelto sin enlazar, foco en el botón, y el cupón vacío no decía nada.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const frame = () => act(() => new Promise((r) => requestAnimationFrame(() => r())));
const setValue = (el, v) => act(async () => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = async (formEl) => {
  await act(async () => { formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
  await frame();
};
/** El control está marcado inválido y su aria-describedby apunta a un elemento visible con `text`. */
const expectLinked = (el, text) => {
  expect(el.getAttribute('aria-invalid')).toBe('true');
  const id = el.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  const msg = document.getElementById(id);
  expect(msg).not.toBeNull();
  expect(msg.textContent).toMatch(text);
};

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supa = makeSupabaseMock();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

describe('Restablecer contraseña', () => {
  const mount = async (updateError = null) => {
    supa.auth = {
      ...supa.auth,
      getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      updateUser: vi.fn(async () => ({ data: null, error: updateError })),
    };
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage.jsx');
    await act(async () => { root.render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>); });
    await flush();
  };
  const pw = () => host.querySelector('input[name="password"]');
  const confirm = () => host.querySelector('input[name="confirm"]');

  it('contraseña corta: aviso enlazado a «Nueva contraseña» y foco en ella', async () => {
    await mount();
    await submit(host.querySelector('form'));
    expectLinked(pw(), /al menos 8/);
    expect(confirm().getAttribute('aria-invalid')).toBe('false');
    expect(document.activeElement).toBe(pw());
    expect(supa.auth.updateUser).not.toHaveBeenCalled();
  });

  it('no coinciden: aviso enlazado a «Repite la contraseña» y foco en ella', async () => {
    await mount();
    await setValue(pw(), 'Segura123');
    await setValue(confirm(), 'Segura124');
    await submit(host.querySelector('form'));
    expectLinked(confirm(), /no coinciden/);
    expect(pw().getAttribute('aria-invalid')).toBe('false');
    expect(document.activeElement).toBe(confirm());
  });

  it('la BD la rechaza por repetida: aviso enlazado a la contraseña nueva', async () => {
    await mount({ code: 'same_password', message: 'New password should be different from the old password.' });
    await setValue(pw(), 'Segura123');
    await setValue(confirm(), 'Segura123');
    await submit(host.querySelector('form'));
    expect(supa.auth.updateUser).toHaveBeenCalledTimes(1);
    expectLinked(pw(), /distinta de la actual/);
    expect(document.activeElement).toBe(pw());
  });
});

describe('Cupón de /carrito', () => {
  let useECommerceStore;
  const mount = async (applyCoupon) => {
    vi.doMock('react-router-dom', () => ({
      Link: ({ to, children }) => React.createElement('a', { href: to }, children),
      useNavigate: () => vi.fn(),
    }));
    ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
    await useECommerceStore.persist.rehydrate();
    useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {}, applyCoupon });
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    const { CartPage } = await import('../pages/CartPage.jsx');
    await act(async () => { root.render(<CartPage />); });
    await flush();
  };
  const input = () => host.querySelector('input[aria-label="Código del cupón"]');
  const couponForm = () => input().closest('form');

  it('sin código: avisa, enlaza el aviso al campo y no consulta la BD', async () => {
    const applyCoupon = vi.fn();
    await mount(applyCoupon);
    await submit(couponForm());
    expect(applyCoupon).not.toHaveBeenCalled();
    expectLinked(input(), /Escribe el código/);
    expect(document.getElementById(input().getAttribute('aria-describedby')).getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(input());
    vi.doUnmock('react-router-dom');
  });

  it('código rechazado: aviso enlazado y foco en el campo; al escribir otro sigue editable', async () => {
    const applyCoupon = vi.fn(async () => ({ success: false, message: 'El cupón NOEXISTE no existe o venció.' }));
    await mount(applyCoupon);
    await setValue(input(), 'noexiste');
    await submit(couponForm());
    expect(applyCoupon).toHaveBeenCalledWith('noexiste');
    expectLinked(input(), /no existe o venció/);
    expect(document.activeElement).toBe(input());
    vi.doUnmock('react-router-dom');
  });
});

describe('Boletín', () => {
  it('correo inválido: aviso enlazado al campo y foco en él', async () => {
    const { NewsletterSignup } = await import('../components/Home/NewsletterSignup.jsx');
    await act(async () => { root.render(<NewsletterSignup source="home" />); });
    const email = host.querySelector('input[type=email]');
    await setValue(email, 'ana@');
    host.querySelector('button[type=submit]').focus();
    await submit(host.querySelector('form'));
    expectLinked(email, /nombre@dominio/);
    expect(document.activeElement).toBe(email);
    expect(supa.rpc).not.toHaveBeenCalled();
  });
});

describe('Reseña de producto', () => {
  const mount = async () => {
    supa.rpc = vi.fn(async (name) => (name === 'my_product_reviewables'
      ? { data: [{ order_item_id: 'oi1', order_number: 'JM-1', color: 'Negro', size: 'M', review: null }], error: null }
      : { data: null, error: { message: 'no programada' } }));
    const { useAuthStore } = await import('../store/authStore.js');
    useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: 'u1', email: 'ana@correo.com' } });
    const { ProductReviewForm } = await import('../components/Product/ProductReviewForm.jsx');
    await act(async () => { root.render(<MemoryRouter><ProductReviewForm productId="p1" /></MemoryRouter>); });
    await flush();
  };

  it('sin calificación ni texto: cada error enlazado a su campo y foco en la primera estrella', async () => {
    await mount();
    const form = host.querySelector('[data-testid="review-form"] form');
    await submit(form);
    const firstStar = form.querySelector('[aria-label="1 de 5 estrellas"]');
    expect(firstStar.getAttribute('aria-describedby')).toBe('review-rating-error');
    expect(document.getElementById('review-rating-error')).not.toBeNull();
    expect(form.querySelector('fieldset').getAttribute('aria-describedby')).toBe('review-rating-error');
    expectLinked(form.querySelector('#review-title'), /./);
    expectLinked(form.querySelector('#review-comment'), /./);
    expect(form.querySelector('#review-city').getAttribute('aria-invalid')).toBe('false');
    expect(document.activeElement).toBe(firstStar);
    expect(supa.rpc.mock.calls.some(([n]) => n === 'submit_product_review')).toBe(false);
  });

  it('con calificación: el foco va al primer campo de texto con error', async () => {
    await mount();
    const form = host.querySelector('[data-testid="review-form"] form');
    await act(async () => { form.querySelector('[aria-label="4 de 5 estrellas"]').click(); });
    await submit(form);
    expect(document.getElementById('review-rating-error')).toBeNull();
    expect(document.activeElement).toBe(form.querySelector('#review-title'));
  });
});

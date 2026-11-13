// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => vi.fn(),
}));
const openWompiWidget = vi.fn(async () => ({}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CheckoutPage, host, root, createOrder;

beforeEach(async () => {
  vi.resetModules();
  openWompiWidget.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  createOrder = vi.fn(async () => ({ id: 'o1', orderNumber: 'JM-1' }));
  useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {}, createOrder });
  ({ CheckoutPage } = await import('../pages/CheckoutPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const mount = () => act(() => root.render(<CheckoutPage />));
const setField = (name, value) => {
  const el = host.querySelector(`[name="${name}"]`);
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const submit = async () => {
  const form = host.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
};

describe('CheckoutPage (UI)', () => {
  it('carrito vacío: no muestra el formulario de pago', () => {
    mount();
    expect(host.textContent).toMatch(/No tienes productos en el carrito/i);
    expect(host.querySelector('form')).toBeNull();
  });

  it('formulario vacío: marca los campos y NO crea el pedido', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    mount();
    await submit();
    expect(host.textContent).toMatch(/Revisa los campos marcados/);
    expect(createOrder).not.toHaveBeenCalled();
    expect(openWompiWidget).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it('errores: cada campo inválido apunta a su mensaje (aria-describedby) y el foco va al primero', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    mount();
    setField('firstName', 'Ana');
    setField('lastName', 'Pérez');
    setField('email', 'sin-arroba');
    await submit();
    const email = host.querySelector('[name="email"]');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const msg = host.querySelector(`#${email.getAttribute('aria-describedby')}`);
    expect(msg?.textContent).toBe('Escribe un correo válido.');
    expect(document.activeElement).toBe(email);
    expect(host.querySelector('[name="firstName"]').hasAttribute('aria-describedby')).toBe(false);
    const invalid = [...host.querySelectorAll('[aria-invalid="true"]')];
    expect(invalid.every((i) => host.querySelector(`#${i.getAttribute('aria-describedby')}`)?.getAttribute('role') === 'alert')).toBe(true);
    // al corregir el campo desaparece el error y la referencia
    setField('email', 'ana@correo.co');
    expect(email.hasAttribute('aria-describedby')).toBe(false);
  });

  it('formulario válido: crea el pedido con envío y cliente y abre el pago', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    mount();
    setField('firstName', 'Ana');
    setField('lastName', 'Pérez Gómez');
    setField('email', 'Ana@Correo.com');
    setField('phone', '3001234567');
    setField('department', 'Antioquia');
    setField('city', 'Medellín');
    setField('address', 'Calle 10 # 20-30');
    await submit();
    expect(createOrder).toHaveBeenCalledTimes(1);
    const arg = createOrder.mock.calls[0][0];
    expect(arg.customer).toEqual({ name: 'Ana Pérez Gómez', email: 'ana@correo.com', phone: '3001234567' });
    expect(arg.shipping).toMatchObject({ department: 'Antioquia', city: 'Medellín', address: 'Calle 10 # 20-30' });
    expect(arg.idempotencyKey).toBeTruthy();
    expect(openWompiWidget).toHaveBeenCalledTimes(1);
  });

  it('si falla el widget de pago, muestra el error y conserva el pedido', async () => {
    openWompiWidget.mockRejectedValueOnce(new Error('Widget no disponible'));
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    mount();
    for (const [k, v] of [['firstName', 'Ana'], ['lastName', 'Pérez'], ['email', 'a@b.co'], ['phone', '3001234567'],
      ['department', 'Antioquia'], ['city', 'Medellín'], ['address', 'Calle 10 # 20-30']]) setField(k, v);
    await submit();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(host.textContent).toMatch(/Widget no disponible/);
  });
});

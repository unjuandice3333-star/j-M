// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
const openWidget = vi.fn();
const navigate = vi.fn();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWidget(...a) } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => navigate,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CheckoutPage, host, root, createOrder;

beforeEach(async () => {
  vi.resetModules();
  openWidget.mockReset();
  navigate.mockReset();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  createOrder = vi.fn(async () => ({ order_number: 'JM-1', public_token: 'tok' }));
  useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {}, createOrder });
  ({ CheckoutPage } = await import('../pages/CheckoutPage.jsx'));
  host = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(host);
  root = createRoot(host);
});

const mount = async () => { await act(async () => root.render(<CheckoutPage />)); };

function setValue(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
const field = (name) => host.querySelector(`[name="${name}"]`);
const submit = () => act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const fillValid = async () => {
  await act(async () => {
    setValue(field('firstName'), 'Ana'); setValue(field('lastName'), 'Pérez'); setValue(field('email'), 'Ana@Correo.com');
    setValue(field('phone'), '3001234567'); setValue(field('department'), 'Antioquia'); setValue(field('city'), 'Medellín');
    setValue(field('address'), 'Calle 10 # 20-30');
  });
};

describe('CheckoutPage (UI)', () => {
  it('carrito vacío: no muestra el formulario y enlaza a la tienda', async () => {
    await mount();
    expect(host.textContent).toMatch(/No tienes productos en el carrito/);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('a[href="/ropa"]')).not.toBeNull();
  });

  it('formulario incompleto: muestra el aviso y NO crea el pedido', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    await mount();
    await submit();
    expect(host.textContent).toMatch(/Revisa los campos marcados/);
    expect(createOrder).not.toHaveBeenCalled();
    expect(openWidget).not.toHaveBeenCalled();
  });

  it('formulario válido: crea el pedido con cliente normalizado y abre el pago', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    await mount();
    await fillValid();
    await submit();
    expect(createOrder).toHaveBeenCalledTimes(1);
    const arg = createOrder.mock.calls[0][0];
    expect(arg.customer).toEqual({ name: 'Ana Pérez', email: 'ana@correo.com', phone: '3001234567' });
    expect(arg.shipping).toMatchObject({ department: 'Antioquia', city: 'Medellín', address: 'Calle 10 # 20-30' });
    expect(arg.idempotencyKey).toBeTruthy();
    expect(openWidget).toHaveBeenCalledTimes(1);
    expect(openWidget.mock.calls[0][0].order.order_number).toBe('JM-1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('falla el pago: conserva el pedido y redirige a la confirmación con pago=error', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    openWidget.mockRejectedValueOnce(new Error('Pasarela no disponible'));
    await mount();
    await fillValid();
    await submit();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toMatch(/\/checkout\/confirmacion\?order=JM-1&token=tok&pago=error/);
  });

  it('error al crear el pedido: muestra el mensaje y no abre el pago', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    createOrder.mockRejectedValueOnce(new Error('Sin stock suficiente'));
    await mount();
    await fillValid();
    await submit();
    expect(host.textContent).toMatch(/Sin stock suficiente/);
    expect(openWidget).not.toHaveBeenCalled();
  });
});

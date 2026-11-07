// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
const navigate = vi.fn();
const openWidget = vi.fn();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => navigate,
}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWidget(...a) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CheckoutPage, host, root;

beforeEach(async () => {
  vi.resetModules();
  navigate.mockReset(); openWidget.mockReset();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {}, shippingMethods: [{ code: 'standard', name: 'Estándar', cost: 12000 }] });
  ({ CheckoutPage } = await import('../pages/CheckoutPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const mount = () => act(() => root.render(<CheckoutPage />));
const setValue = (name, value) => {
  const el = host.querySelector(`[name="${name}"]`);
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const submit = async () => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
const fillValid = () => {
  setValue('firstName', 'Ana'); setValue('lastName', 'Pérez'); setValue('email', 'ana@example.com');
  setValue('phone', '3001234567'); setValue('department', 'Antioquia'); setValue('city', 'Medellín'); setValue('address', 'Calle 10 # 20-30');
};

describe('CheckoutPage (UI)', () => {
  it('carrito vacío: no permite comprar y enlaza a la tienda', () => {
    mount();
    expect(host.textContent).toMatch(/No tienes productos en el carrito/i);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('a[href="/ropa"]')).not.toBeNull();
  });

  it('formulario vacío: marca los campos inválidos y NO crea el pedido', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    const createOrder = vi.fn();
    useECommerceStore.setState({ createOrder });
    mount();
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Revisa los campos marcados/);
    expect(host.querySelector('[name="email"]').getAttribute('aria-invalid')).toBe('true');
    expect(createOrder).not.toHaveBeenCalled();
    expect(openWidget).not.toHaveBeenCalled();
  });

  it('datos válidos: crea el pedido con la clave de idempotencia y abre Wompi', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    const order = { order_number: 'JM-1', public_token: 'tok' };
    const createOrder = vi.fn(async () => order);
    useECommerceStore.setState({ createOrder });
    mount();
    fillValid();
    await submit();
    expect(createOrder).toHaveBeenCalledTimes(1);
    const arg = createOrder.mock.calls[0][0];
    expect(arg.customer).toMatchObject({ name: 'Ana Pérez', email: 'ana@example.com' });
    expect(arg.shipping).toMatchObject({ department: 'Antioquia', city: 'Medellín' });
    expect(arg.idempotencyKey).toBeTruthy();
    expect(openWidget).toHaveBeenCalledWith({ order, customer: arg.customer });
  });

  it('si Wompi falla, el pedido existe: muestra el error y lleva a la confirmación para reintentar', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    useECommerceStore.setState({ createOrder: vi.fn(async () => ({ order_number: 'JM-2', public_token: 't k' })) });
    openWidget.mockRejectedValue(new Error('Pasarela no disponible'));
    mount();
    fillValid();
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Pasarela no disponible/);
    expect(navigate).toHaveBeenCalledWith('/checkout/confirmacion?order=JM-2&token=t%20k&pago=error');
  });

  it('si create_order falla, muestra el mensaje y no abre Wompi', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    useECommerceStore.setState({ createOrder: vi.fn(async () => { throw new Error('Sin stock suficiente'); }) });
    mount();
    fillValid();
    await submit();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Sin stock suficiente/);
    expect(openWidget).not.toHaveBeenCalled();
  });
});

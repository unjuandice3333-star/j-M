// @vitest-environment jsdom
// Ejecución 118: aviso del checkout cuando el pedido del checkout anterior sigue pendiente de pago.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => React.createElement('a', { href: to, ...rest }, children),
  useNavigate: () => vi.fn(),
}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn() } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CheckoutPage, sameCheckoutLines, host, root;

const ORDER = { id: 'ord-1', order_number: 'JM-100', public_token: 'tok-1', status: 'payment_pending', total: 92000,
  payment_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), created_at: new Date().toISOString(), owner: null };
const publicOrder = (over = {}) => ({ id: ORDER.id, order_number: ORDER.order_number, status: 'payment_pending',
  payment_expires_at: ORDER.payment_expires_at, total: 92000, ...over });

beforeEach(async () => {
  vi.resetModules();
  supa.state.rpc = {};
  supa.rpc.mockClear();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {} });
  ({ CheckoutPage } = await import('../pages/CheckoutPage.jsx'));
  ({ sameCheckoutLines } = await import('../components/Checkout/PendingOrderNotice.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

/** Carrito con 1 camiseta M negra y, como pedido activo, la compra anterior con `bought`. */
const setup = (bought = [{ variantId: 'v-m-neg', quantity: 1 }]) => {
  useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
  useECommerceStore.setState({ orders: [ORDER], activeCheckoutOrderId: ORDER.id, activeCheckoutItems: bought });
};
const mount = async () => { await act(async () => { root.render(<CheckoutPage />); }); await act(async () => {}); };
const notice = () => host.querySelector('[data-testid="pending-order-notice"]');

describe('sameCheckoutLines', () => {
  it('compara variantes y cantidades sin importar el orden', () => {
    const cart = [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 2 }];
    expect(sameCheckoutLines(cart, [{ variantId: 'b', quantity: 2 }, { variantId: 'a', quantity: 1 }])).toBe(true);
    expect(sameCheckoutLines(cart, [{ variantId: 'a', quantity: 1 }])).toBe(false);
    expect(sameCheckoutLines(cart, [{ variantId: 'a', quantity: 1 }, { variantId: 'b', quantity: 1 }])).toBe(false);
    expect(sameCheckoutLines(cart, null)).toBe(false);
  });
});

describe('Checkout: pedido anterior pendiente de pago', () => {
  it('sin pedido activo no consulta la BD ni muestra aviso', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    await mount();
    expect(notice()).toBeNull();
    expect(supa.rpc.mock.calls.some(([n]) => n === 'get_order_public')).toBe(false);
  });

  it('carrito distinto: avisa que se creará otro pedido y ofrece pagar el anterior', async () => {
    setup([{ variantId: 'v-l-neg', quantity: 1 }]);
    supa.state.rpc.get_order_public = { data: publicOrder(), error: null };
    await mount();
    const n = notice();
    expect(n).not.toBeNull();
    expect(n.getAttribute('data-same-cart')).toBe('false');
    expect(n.textContent).toMatch(/JM-100/);
    expect(n.textContent).toMatch(/Tu carrito cambió/);
    expect(host.querySelector('[data-testid="pending-order-pay"]').getAttribute('href'))
      .toBe('/checkout/confirmacion?order=JM-100&token=tok-1');
  });

  it('mismo carrito: lo indica para pagarlo sin crear otro pedido', async () => {
    setup();
    supa.state.rpc.get_order_public = { data: publicOrder(), error: null };
    await mount();
    expect(notice().getAttribute('data-same-cart')).toBe('true');
    expect(notice().textContent).toMatch(/sin crear otro pedido/);
  });

  it('cancelar libera el pedido activo (cancel_my_order con token) y el carrito no cambia', async () => {
    setup([{ variantId: 'v-l-neg', quantity: 1 }]);
    supa.state.rpc.get_order_public = { data: publicOrder(), error: null };
    const cancel = vi.fn(() => ({ data: { status: 'cancelled' }, error: null }));
    supa.state.rpc.cancel_my_order = cancel;
    vi.stubGlobal('confirm', () => true);
    await mount();
    await act(async () => { host.querySelector('[data-testid="pending-order-cancel"]').click(); });
    expect(cancel).toHaveBeenCalledWith(expect.objectContaining({ p_order_id: 'ord-1', p_public_token: 'tok-1' }));
    const s = useECommerceStore.getState();
    expect(s.activeCheckoutOrderId).toBeNull();
    expect(s.orders[0].status).toBe('cancelled');
    expect(s.items).toHaveLength(1);
    expect(notice()).toBeNull();
    expect(host.querySelector('[data-testid="pending-order-cancelled"]').textContent).toMatch(/JM-100 cancelado/);
  });

  it('si la cancelación falla, el aviso sigue y muestra el error', async () => {
    setup([{ variantId: 'v-l-neg', quantity: 1 }]);
    supa.state.rpc.get_order_public = { data: publicOrder(), error: null };
    supa.state.rpc.cancel_my_order = { data: null, error: { message: 'x', hint: 'JM_INVALID_TRANSITION' } };
    vi.stubGlobal('confirm', () => true);
    await mount();
    await act(async () => { host.querySelector('[data-testid="pending-order-cancel"]').click(); });
    expect(notice()).not.toBeNull();
    expect(notice().querySelector('[role="alert"]').textContent).toMatch(/no se puede cambiar/);
    expect(useECommerceStore.getState().activeCheckoutOrderId).toBe('ord-1');
  });

  it('vencido en la BD: no avisa y deja de ser el pedido activo', async () => {
    setup();
    supa.state.rpc.get_order_public = { data: publicOrder({ payment_expires_at: new Date(Date.now() - 60_000).toISOString() }), error: null };
    await mount();
    expect(notice()).toBeNull();
    expect(useECommerceStore.getState().activeCheckoutOrderId).toBeNull();
    expect(useECommerceStore.getState().orders[0].status).toBe('expired');
  });

  it('cancelado en otra pestaña: no avisa y el carrito se conserva', async () => {
    setup();
    supa.state.rpc.get_order_public = { data: publicOrder({ status: 'cancelled' }), error: null };
    await mount();
    expect(notice()).toBeNull();
    expect(useECommerceStore.getState().activeCheckoutOrderId).toBeNull();
    expect(useECommerceStore.getState().items).toHaveLength(1);
  });

  it('pagado en otra pestaña: descuenta lo comprado del carrito', async () => {
    useECommerceStore.getState().addItem(makeProduct(), 'S', 'Blanco', 1); // agregado después del pedido
    setup();
    supa.state.rpc.get_order_public = { data: publicOrder({ status: 'paid' }), error: null };
    await mount();
    const s = useECommerceStore.getState();
    expect(s.activeCheckoutOrderId).toBeNull();
    expect(s.items.map((i) => i.variantId)).toEqual(['v-s-bla']);
  });

  it('sin conexión con la BD: avisa con el estado guardado en el navegador', async () => {
    setup([{ variantId: 'v-l-neg', quantity: 1 }]);
    supa.state.rpc.get_order_public = { data: null, error: { message: 'Failed to fetch' } };
    await mount();
    expect(notice()).not.toBeNull();
    expect(useECommerceStore.getState().activeCheckoutOrderId).toBe('ord-1');
  });
});

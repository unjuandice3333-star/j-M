// @vitest-environment jsdom
// Ejecución 59: «Mis pedidos» — pagar y cancelar directamente desde la lista, ventana de pago vencida visible
// (sin «Pagar ahora») aunque el job de expiración aún no haya cambiado el estado, relectura de la lista cuando la BD
// rechaza el pago o tras cancelar, y una relectura fallida no borra la lista.
// Solo se simulan Supabase y el widget de Wompi; página, store y orderService son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { orders: [], ordersError: null, rpc: {}, calls: [], selects: [] };
  const from = (table) => {
    const q = {
      select: (cols) => { state.selects.push({ table, cols }); return q; },
      eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, in: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (r, j) => {
        if (table !== 'online_orders') return Promise.resolve({ data: [], error: null }).then(r, j);
        const err = state.ordersError; state.ordersError = null;
        return Promise.resolve(err ? { data: null, error: err } : { data: state.orders.map((o) => ({ ...o })), error: null }).then(r, j);
      },
    };
    return q;
  };
  const rpc = vi.fn(async (name, args) => {
    state.calls.push({ name, args });
    const h = state.rpc[name];
    if (!h) return { data: [], error: null };
    try { return { data: typeof h === 'function' ? h(args) : h, error: null }; } catch (e) { return { data: null, error: e }; }
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
const openWompiWidget = vi.fn();
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const order = (over = {}) => ({
  id: ORDER_ID, order_number: 'JM-9', public_token: TOKEN, status: 'payment_pending', total: 92000, subtotal: 80000,
  discount_total: 0, shipping_cost: 12000, shipping_method_code: 'standard', created_at: new Date().toISOString(),
  payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
  online_order_items: [{ product_name: 'Blusa', size_code: 'M', color_name: 'Negro', quantity: 1, unit_price: 80000, line_total: 80000 }],
  ...over,
});

let container; let root;
beforeEach(() => {
  vi.resetModules();
  openWompiWidget.mockReset();
  supa = fakeSupabase();
  localStorage.clear();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const click = async (el) => { await act(async () => { el.click(); }); await flush(); };

const mount = async () => {
  const { useAuthStore } = await import('../store/authStore');
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana Pérez', phone: '3001234567', role: 'customer' } });
  const { AccountPage } = await import('../pages/AccountPage');
  await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta']}><AccountPage /></MemoryRouter>); });
  await flush();
};

describe('paymentWindow', () => {
  it('abierta, cerrada o no aplica según estado y vencimiento', async () => {
    const { paymentWindow } = await import('../pages/AccountPage');
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(paymentWindow({ status: 'payment_pending', payment_expires_at: '2026-11-11T12:30:00Z' }, now)).toBe('open');
    expect(paymentWindow({ status: 'payment_pending', payment_expires_at: '2026-11-11T11:59:59Z' }, now)).toBe('closed');
    expect(paymentWindow({ status: 'payment_pending', payment_expires_at: '2026-11-11T12:00:00Z' }, now)).toBe('closed');
    expect(paymentWindow({ status: 'payment_pending', payment_expires_at: null }, now)).toBe('open');
    expect(paymentWindow({ status: 'paid', payment_expires_at: '2026-11-11T11:00:00Z' }, now)).toBeNull();
    expect(paymentWindow(null, now)).toBeNull();
  });
});

describe('«Mis pedidos»: acciones desde la lista', () => {
  it('la consulta pide payment_expires_at', async () => {
    const { orderService } = await import('../services/orderService');
    await orderService.getMyOrders();
    expect(supa.state.selects.find((s) => s.table === 'online_orders').cols).toMatch(/\bpayment_expires_at\b/);
  });

  it('«Pagar ahora» abre Wompi con el pedido y los datos del cliente, sin pasar por el detalle', async () => {
    supa.state.orders = [order()];
    openWompiWidget.mockResolvedValue({ reference: 'JM-9-1' });
    await mount();
    expect(q('order-pay-deadline')).not.toBeNull();
    await click(q('order-pay'));
    expect(openWompiWidget).toHaveBeenCalledTimes(1);
    const { order: o, customer } = openWompiWidget.mock.calls[0][0];
    expect(o).toMatchObject({ id: ORDER_ID, order_number: 'JM-9', public_token: TOKEN });
    expect(customer).toEqual({ email: 'ana@correo.com', name: 'Ana Pérez', phone: '3001234567' });
    const { useECommerceStore } = await import('../store/eCommerceStore');
    expect(useECommerceStore.getState().orders.map((x) => x.id)).toContain(ORDER_ID);
  });

  it('si la BD rechaza el pago (ya pagado en otra pestaña) muestra el motivo y relee la lista', async () => {
    supa.state.orders = [order()];
    openWompiWidget.mockImplementation(async () => {
      supa.state.orders = [order({ status: 'paid' })];
      throw Object.assign(new Error('Este pedido ya no admite pagos.'), { code: 'JM_ORDER_NOT_PAYABLE' });
    });
    await mount();
    await click(q('order-pay'));
    expect(q('order-action-error').textContent).toContain('ya no admite pagos');
    expect(container.textContent).toContain('Compra completada');
    expect(q('order-pay')).toBeNull();
    expect(q('order-cancel')).toBeNull();
  });

  it('un error sin código de estado no relee ni oculta el botón', async () => {
    supa.state.orders = [order()];
    openWompiWidget.mockRejectedValue(new Error('No se pudo cargar la pasarela de pagos de Wompi.'));
    await mount();
    const reads = supa.state.selects.filter((s) => s.table === 'online_orders').length;
    await click(q('order-pay'));
    expect(q('order-action-error').textContent).toContain('pasarela');
    expect(supa.state.selects.filter((s) => s.table === 'online_orders').length).toBe(reads);
    expect(q('order-pay')).not.toBeNull();
  });

  it('con la ventana vencida no ofrece pagar, lo muestra como vencido y permite volver a la tienda', async () => {
    supa.state.orders = [order({ payment_expires_at: new Date(Date.now() - 60e3).toISOString() })];
    await mount();
    expect(q('order-pay')).toBeNull();
    expect(q('order-window-closed')).not.toBeNull();
    expect(container.textContent).toContain('Pago vencido');
    expect(container.textContent).not.toContain('Pago pendiente');
    expect(container.textContent).toContain('Volver a la tienda');
  });

  it('«Cancelar pedido» llama a cancel_my_order con id + token tras confirmar y muestra el estado nuevo', async () => {
    supa.state.orders = [order()];
    supa.state.rpc.cancel_my_order = () => { supa.state.orders = [order({ status: 'cancelled' })]; return { status: 'cancelled' }; };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await click(q('order-cancel'));
    const call = supa.state.calls.find((c) => c.name === 'cancel_my_order');
    expect(call.args).toMatchObject({ p_order_id: ORDER_ID, p_public_token: TOKEN });
    expect(container.textContent).toContain('Cancelado');
    expect(q('order-cancel')).toBeNull();
    expect(q('order-pay')).toBeNull();
  });

  it('si el cliente no confirma, no cancela', async () => {
    supa.state.orders = [order()];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await click(q('order-cancel'));
    expect(supa.state.calls.find((c) => c.name === 'cancel_my_order')).toBeUndefined();
  });

  it('si la cancelación falla muestra el motivo y una relectura fallida no borra la lista', async () => {
    supa.state.orders = [order()];
    supa.state.rpc.cancel_my_order = () => { supa.state.ordersError = { message: 'Failed to fetch' }; throw { message: 'Transición no permitida', code: 'P0001', hint: 'JM_INVALID_TRANSITION' }; };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount();
    await click(q('order-cancel'));
    expect(q('order-action-error')).not.toBeNull();
    expect(container.textContent).toContain('PEDIDO #JM-9');
    expect(container.textContent).not.toContain('No pudimos cargar tus pedidos');
  });
});

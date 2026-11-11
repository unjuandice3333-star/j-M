// @vitest-environment jsdom
// Ejecución 58: confirmación del pedido abierta desde el enlace (número + token) en un navegador sin el pedido
// guardado: pagar y cancelar con el id que devuelve get_order_public; relectura cuando la BD rechaza el pago;
// sin «Pagar ahora» con la ventana de pago vencida; un fallo de red al consultar periódicamente no tapa el pedido.
// Solo se simulan Supabase y el widget de Wompi; página, store y orderService son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { rpc: {}, calls: [] };
  const rpc = vi.fn(async (name, args) => {
    state.calls.push({ name, args });
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    try { return { data: typeof h === 'function' ? h(args) : h, error: null }; }
    catch (e) { return { data: null, error: e }; }
  });
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, then: (r, j) => Promise.resolve({ data: [], error: null }).then(r, j) };
  return { state, rpc, from: () => q, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
const openWompiWidget = vi.fn();
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pending = (over = {}) => ({
  id: ORDER_ID, order_number: 'JM-7', status: 'payment_pending', status_label: 'Pendiente de pago',
  customer_name: 'Ana', customer_email: 'ana@x.co', payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
  shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method: 'standard' },
  subtotal: 80000, discount_total: 0, shipping_cost: 12000, total: 92000, items: [], timeline: [], ...over,
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
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const button = (label) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const click = async (label) => { await act(async () => { button(label).click(); }); await flush(); };

const renderAt = async () => {
  const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/checkout/confirmacion?order=JM-7&token=${TOKEN}`]}><OrderConfirmationPage /></MemoryRouter>);
  });
  await flush();
};

describe('Confirmación abierta desde el enlace en otro navegador', () => {
  it('«Pagar ahora» usa el id de la BD y el token del enlace, y recuerda el pedido en este navegador', async () => {
    supa.state.rpc.get_order_public = pending();
    openWompiWidget.mockResolvedValue({ reference: 'JM-7-1' });
    await renderAt();
    expect(container.textContent).not.toContain('Este pedido se creó en otro navegador');
    await click('Pagar ahora');
    expect(openWompiWidget).toHaveBeenCalledTimes(1);
    const { order, customer } = openWompiWidget.mock.calls[0][0];
    expect(order).toMatchObject({ id: ORDER_ID, order_number: 'JM-7', public_token: TOKEN });
    expect(customer.email).toBe('ana@x.co');
    const { useECommerceStore } = await import('../store/eCommerceStore');
    expect(useECommerceStore.getState().orders.map((o) => o.id)).toContain(ORDER_ID);
  });

  it('«Cancelar pedido» está disponible y llama a cancel_my_order con id + token', async () => {
    let status = 'payment_pending';
    supa.state.rpc.get_order_public = () => pending({ status, status_label: status === 'cancelled' ? 'Cancelado' : 'Pendiente de pago' });
    supa.state.rpc.cancel_my_order = () => { status = 'cancelled'; return { status }; };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAt();
    await click('Cancelar pedido');
    const call = supa.state.calls.find((c) => c.name === 'cancel_my_order');
    expect(call.args).toMatchObject({ p_order_id: ORDER_ID, p_public_token: TOKEN });
    expect(container.textContent).toContain('Este pedido fue cancelado.');
  });

  it('sin id en la respuesta (BD sin la migración) mantiene el aviso y no intenta pagar', async () => {
    supa.state.rpc.get_order_public = pending({ id: undefined });
    await renderAt();
    expect(container.textContent).toContain('Este pedido se creó en otro navegador');
    expect(button('Cancelar pedido')).toBeUndefined();
    await click('Pagar ahora');
    expect(openWompiWidget).not.toHaveBeenCalled();
    expect(container.querySelector('[role=alert]').textContent).toMatch(/inicia sesión/);
  });
});

describe('Pago rechazado por la BD y ventana vencida', () => {
  it('si el pedido ya no admite pago, muestra el motivo y relee el estado real', async () => {
    let status = 'payment_pending';
    supa.state.rpc.get_order_public = () => pending({ status, status_label: status === 'paid' ? 'Pagado' : 'Pendiente de pago' });
    openWompiWidget.mockImplementation(async () => { status = 'paid'; throw Object.assign(new Error('Este pedido ya no admite pagos.'), { code: 'JM_ORDER_NOT_PAYABLE' }); });
    await renderAt();
    await click('Pagar ahora');
    expect(container.querySelector('[role=alert]').textContent).toBe('Este pedido ya no admite pagos.');
    expect(container.textContent).toContain('¡Gracias por tu compra!');
    expect(button('Pagar ahora')).toBeUndefined();
  });

  it('un error genérico del pago no relee el pedido', async () => {
    supa.state.rpc.get_order_public = pending();
    openWompiWidget.mockRejectedValue(new Error('No hay conexión con la tienda para preparar el pago. Inténtalo de nuevo.'));
    await renderAt();
    const before = supa.state.calls.filter((c) => c.name === 'get_order_public').length;
    await click('Pagar ahora');
    expect(supa.state.calls.filter((c) => c.name === 'get_order_public').length).toBe(before);
    expect(container.querySelector('[role=alert]').textContent).toMatch(/No hay conexión/);
  });

  it('con la ventana de pago vencida no ofrece «Pagar ahora» aunque el estado siga pendiente', async () => {
    supa.state.rpc.get_order_public = pending({ payment_expires_at: new Date(Date.now() - 60e3).toISOString() });
    await renderAt();
    expect(button('Pagar ahora')).toBeUndefined();
    expect(container.textContent).toContain('El tiempo para pagar este pedido terminó');
    expect(container.textContent).not.toContain('Reserva válida hasta');
    expect(button('Cancelar pedido')).toBeDefined();
  });
});

describe('Consulta periódica', () => {
  it('un fallo de red en una consulta periódica no reemplaza el pedido por la pantalla de error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let fail = false;
    supa.state.rpc.get_order_public = () => { if (fail) throw new Error('fetch failed'); return pending(); };
    await renderAt();
    expect(container.textContent).toContain('Pedido registrado');
    fail = true;
    await act(async () => { vi.advanceTimersByTime(5100); });
    await flush();
    expect(supa.state.calls.filter((c) => c.name === 'get_order_public').length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).not.toContain('No pudimos consultar el pedido');
    expect(container.textContent).toContain('Pedido registrado');
  });
});

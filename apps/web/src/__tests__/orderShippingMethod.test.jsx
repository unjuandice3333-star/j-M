// @vitest-environment jsdom
// Método de envío del pedido visible en la confirmación, en «Mis pedidos» (consulta) y en el admin de pedidos.
// Solo se simula Supabase; servicios, store y páginas son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

/** Supabase falso: tablas y rpc programables; registra las columnas pedidas en cada select. */
function fakeSupabase() {
  const state = { tables: {}, rpc: {}, selects: [] };
  const from = vi.fn((table) => {
    const q = {
      select: (cols) => { state.selects.push({ table, cols }); return q; },
      eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q,
      single: async () => ({ data: (state.tables[table] ?? [])[0] ?? null, error: null }),
      then: (res, rej) => Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(res, rej),
    };
    return q;
  });
  const rpc = vi.fn(async (name, args) => {
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: typeof h === 'function' ? h(args) : h, error: null };
  });
  return { state, from, rpc, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const STANDARD = { code: 'standard', name: 'Envío estándar nacional', cost: 15000, free_over_subtotal: 200000, eta_text: '2 a 5 días', is_active: true, sort_order: 1 };
const EXPRESS = { code: 'express', name: 'Envío express 24 h', cost: 30000, free_over_subtotal: null, eta_text: '24 h', is_active: false, sort_order: 2 };

let container; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

describe('shippingMethodLabel', () => {
  it('usa el nombre configurado, luego un respaldo y por último el código', async () => {
    const { shippingMethodLabel } = await import('../utils/shippingPolicy');
    expect(shippingMethodLabel('express', [STANDARD, EXPRESS])).toBe('Envío express 24 h');
    expect(shippingMethodLabel('standard', [])).toBe('Envío estándar');
    expect(shippingMethodLabel('express', undefined)).toBe('Envío express');
    expect(shippingMethodLabel('pickup', [STANDARD])).toBe('pickup');
    expect(shippingMethodLabel('standard', [{ code: 'standard', name: '  ' }])).toBe('Envío estándar');
    expect(shippingMethodLabel(null, [STANDARD])).toBeNull();
    expect(shippingMethodLabel('', [STANDARD])).toBeNull();
  });
});

describe('Mis pedidos', () => {
  it('la consulta de pedidos del cliente incluye shipping_method_code', async () => {
    supa.state.tables.online_orders = [];
    const { orderService } = await import('../services/orderService');
    await orderService.getMyOrders();
    const sel = supa.state.selects.find((s) => s.table === 'online_orders');
    expect(sel.cols).toMatch(/\bshipping_method_code\b/);
  });
});

describe('Confirmación del pedido', () => {
  const publicOrder = (method) => ({
    order_number: 'JM-1', status: 'paid', status_label: 'Pagado', customer_name: 'Ana', customer_email: 'ana@x.co',
    shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method },
    subtotal: 100000, discount_total: 0, shipping_cost: 30000, total: 130000, items: [], timeline: [],
  });

  const renderAt = async () => {
    const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/checkout/confirmacion?order=JM-1&token=t']}><OrderConfirmationPage /></MemoryRouter>);
    });
    await flush();
  };

  it('muestra el nombre del método elegido en el pedido', async () => {
    supa.state.rpc.get_order_public = publicOrder('express');
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.setState({ shippingMethods: [STANDARD, { ...EXPRESS, is_active: true }] });
    await renderAt();
    expect(container.querySelector('[data-testid="order-shipping-method"]').textContent).toContain('Envío express 24 h');
    expect(container.textContent).toContain('Envío (Envío express 24 h)');
  });

  it('con un método ya no listado usa el nombre de respaldo', async () => {
    supa.state.rpc.get_order_public = publicOrder('express');
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.setState({ shippingMethods: [STANDARD] });
    await renderAt();
    expect(container.querySelector('[data-testid="order-shipping-method"]').textContent).toContain('Envío express');
  });

  it('sin método en la respuesta no inventa uno', async () => {
    supa.state.rpc.get_order_public = publicOrder(undefined);
    await renderAt();
    expect(container.textContent).toContain('JM-1');
    expect(container.querySelector('[data-testid="order-shipping-method"]')).toBeNull();
  });
});

describe('Admin de pedidos', () => {
  it('el detalle muestra el método (incluso inactivo) con su coste', async () => {
    supa.state.tables.shipping_methods = [STANDARD, EXPRESS];
    supa.state.tables.online_orders = [{
      id: 'u1', order_number: 'JM-9', customer_name: 'Ana', customer_email: 'ana@x.co', customer_phone: '300',
      shipping_department: 'Antioquia', shipping_city: 'Medellín', shipping_address: 'Cra 1', shipping_neighborhood: null,
      shipping_notes: null, shipping_method_code: 'express', subtotal: 100000, discount_total: 0, shipping_cost: 30000,
      total: 130000, coupon_code: null, status: 'paid', created_at: '2026-11-10T10:00:00Z', paid_at: null, needs_attention: false,
      online_order_items: [], payment_transactions: [], order_events: [],
    }];
    supa.state.rpc.get_order_status_catalog = { transitions: [] };
    const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
    await act(async () => { root.render(<MemoryRouter><AdminOrdersPage /></MemoryRouter>); });
    await flush();
    expect(supa.state.selects.find((s) => s.table === 'online_orders').cols).toMatch(/shipping_method_code/);
    const open = [...container.querySelectorAll('button')].find((b) => b.closest('tr')?.textContent.includes('JM-9'));
    expect(open).toBeTruthy();
    await act(async () => { open.click(); });
    const line = container.querySelector('[data-testid="order-shipping-method"]');
    expect(line.textContent).toContain('Envío express 24 h');
    expect(line.textContent).toMatch(/30\.000/);
    expect(container.textContent).toContain('Envío (Envío express 24 h)');
  });
});

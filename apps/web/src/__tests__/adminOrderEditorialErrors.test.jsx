// @vitest-environment jsdom
// Ejecución 111 (D82): errores accesibles en el detalle del pedido del admin (cambio de estado, transportadora, guía,
// URL de rastreo, nota) y en el editor de imágenes editoriales (URL). El aviso queda enlazado al campo que lo causa
// (aria-invalid + aria-describedby → id del aviso role=alert) y el foco va a ese campo. La URL de rastreo y la URL de
// la imagen se validan con la regla del CHECK de la BD (^https://) antes de llamar al servidor.
// Solo se simula Supabase; servicios, store y páginas son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

function fakeSupabase() {
  const state = { tables: {}, rpc: {}, rpcCalls: [] };
  const from = vi.fn((table) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q, in: () => q, gte: () => q, lte: () => q, neq: () => q, is: () => q, not: () => q,
      single: async () => ({ data: (state.tables[table] ?? [])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (state.tables[table] ?? [])[0] ?? null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      then: (res, rej) => Promise.resolve({ data: state.tables[table] ?? [], error: null, count: (state.tables[table] ?? []).length }).then(res, rej),
    };
    return q;
  });
  const rpc = vi.fn(async (name, args) => {
    state.rpcCalls.push({ name, args });
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: typeof h === 'function' ? h(args) : h, error: null };
  });
  const storage = { from: () => ({ list: async () => ({ data: [], error: null }), getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) };
  return { state, from, rpc, storage, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host; let root;
beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); }); await flush(); };
const setInput = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const setSelect = async (el, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase().includes(text.toUpperCase()));
const field = (name) => host.querySelector(`[aria-label="${name}"]`);
const expectLinked = (el, msg) => {
  expect(el.getAttribute('aria-invalid')).toBe('true');
  const id = el.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  const alert = document.getElementById(id);
  expect(alert?.getAttribute('role')).toBe('alert');
  expect(alert.textContent).toMatch(msg);
};
const expectClean = (el) => {
  expect(el.getAttribute('aria-invalid')).not.toBe('true');
  expect(el.getAttribute('aria-describedby')).toBeNull();
};

const ORDER = {
  id: 'u1', order_number: 'JM-9', customer_name: 'Ana', customer_email: 'ana@x.co', customer_phone: '300',
  shipping_department: 'Antioquia', shipping_city: 'Medellín', shipping_address: 'Cra 1', shipping_neighborhood: null,
  shipping_notes: null, shipping_method_code: 'standard', subtotal: 100000, discount_total: 0, shipping_cost: 15000,
  total: 115000, coupon_code: null, status: 'processing', created_at: '2026-11-10T10:00:00Z', paid_at: null, needs_attention: false,
  online_order_items: [], payment_transactions: [], order_events: [],
};
const CATALOG = { transitions: [
  { from: 'processing', to: 'shipped', actor: 'admin', requires_note: false },
  { from: 'processing', to: 'cancelled', actor: 'admin', requires_note: true },
] };

async function openOrder() {
  supa.state.tables.online_orders = [ORDER];
  supa.state.rpc.get_order_status_catalog = CATALOG;
  supa.state.rpc.admin_transition_order = { ok: true };
  const { AdminOrdersPage } = await import('../pages/admin/AdminOrdersPage');
  await act(async () => { root.render(<MemoryRouter><AdminOrdersPage /></MemoryRouter>); });
  await flush();
  const open = [...host.querySelectorAll('button')].find((b) => b.closest('tr')?.textContent.includes('JM-9'));
  expect(open).toBeTruthy();
  await click(open);
  return host.querySelector('#order-next-status');
}
const transitionCalls = () => supa.state.rpcCalls.filter((c) => c.name === 'admin_transition_order');

describe('Admin de pedidos: errores del cambio de estado', () => {
  it('error del servidor → aviso visible sin marcar ningún campo como inválido', async () => {
    const select = await openOrder();
    delete supa.state.rpc.admin_transition_order;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expectClean(select);
    await setSelect(select, 'shipped');
    await setInput(field('Transportadora'), 'Coordinadora');
    await setInput(field('Número de guía'), 'G-1');
    await click(button('GUARDAR'));
    expect(transitionCalls()).toHaveLength(1);
    expect(host.querySelector('#order-modal-error[role="alert"]')).toBeTruthy();
    for (const el of [select, field('Transportadora'), field('Número de guía'), field('URL de rastreo'), field('Nota del cambio')]) expectClean(el);
  });

  it('cancelar sin motivo → la nota queda enlazada y con foco; el selector ya no', async () => {
    const select = await openOrder();
    await setSelect(select, 'cancelled');
    await click(button('GUARDAR'));
    expectLinked(field('Nota del cambio'), /requiere una nota/);
    expectClean(host.querySelector('#order-next-status'));
    expect(document.activeElement).toBe(field('Nota del cambio'));
    expect(transitionCalls()).toHaveLength(0);
  });

  it('enviado sin guía → solo el campo vacío queda enlazado y recibe el foco', async () => {
    const select = await openOrder();
    await setSelect(select, 'shipped');
    await setInput(field('Transportadora'), 'Coordinadora');
    await click(button('GUARDAR'));
    expectLinked(field('Número de guía'), /transportadora y número de guía/);
    expectClean(field('Transportadora'));
    expect(document.activeElement).toBe(field('Número de guía'));
    expect(transitionCalls()).toHaveLength(0);
  });

  it('URL de rastreo sin https → se rechaza antes del servidor, enlazada al campo; corregida, se envía', async () => {
    const select = await openOrder();
    await setSelect(select, 'shipped');
    await setInput(field('Transportadora'), 'Coordinadora');
    await setInput(field('Número de guía'), 'G-123');
    await setInput(field('URL de rastreo'), 'http://rastreo.test/G-123');
    await click(button('GUARDAR'));
    expectLinked(field('URL de rastreo'), /https:\/\//);
    expect(document.activeElement).toBe(field('URL de rastreo'));
    expect(transitionCalls()).toHaveLength(0);

    await setInput(field('URL de rastreo'), 'https://rastreo.test/G-123');
    await click(button('GUARDAR'));
    expect(transitionCalls()).toHaveLength(1);
    expect(transitionCalls()[0].args.p_tracking).toEqual({ carrier: 'Coordinadora', tracking_number: 'G-123', tracking_url: 'https://rastreo.test/G-123' });
  });
});

describe('Admin de imágenes editoriales: URL inválida', () => {
  it('URL sin https → aviso enlazado al campo y foco, sin llamar al servidor; al corregir se limpia', async () => {
    const productService = (await import('../services/productService')).default;
    const siteContentService = (await import('../services/siteContentService')).default;
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(null);
    vi.spyOn(siteContentService, 'listLibrary').mockResolvedValue([]);
    const setImage = vi.spyOn(siteContentService, 'setImage').mockResolvedValue(undefined);
    const { AdminEditorialImagesPage } = await import('../pages/admin/AdminEditorialImagesPage');
    await act(async () => { root.render(<MemoryRouter><AdminEditorialImagesPage /></MemoryRouter>); });
    await flush();
    const change = [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith('Cambiar imagen'));
    expect(change).toBeTruthy();
    await click(change);
    const url = host.querySelector('input[placeholder="https://…"]');
    expect(url).toBeTruthy();
    // Nombre accesible por la etiqueta (anidada), no por el placeholder.
    expect(url.closest('label')?.textContent).toMatch(/O una URL https/);
    expectClean(url);
    await setInput(url, 'http://img.test/a.jpg');
    await click(button('GUARDAR Y PUBLICAR'));
    expectLinked(url, /https:\/\//);
    expect(document.activeElement).toBe(url);
    expect(setImage).not.toHaveBeenCalled();

    await setInput(url, 'https://img.test/a.jpg');
    expectClean(url);
    expect(host.querySelector('[role="alert"]#editorial-edit-error')).toBeNull();
    await click(button('GUARDAR Y PUBLICAR'));
    expect(setImage).toHaveBeenCalledTimes(1);
  });
});

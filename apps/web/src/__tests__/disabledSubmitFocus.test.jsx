// @vitest-environment jsdom
// Ejecución 153 (D131): botones que se deshabilitan mientras guardan/pagan. Chromium les quita el foco y al terminar
// quedaba en <body>; jsdom conserva el foco en un botón deshabilitado, así que se simula con blur() (igual que D130).
// Solo se simulan Supabase y el widget de Wompi; componentes, servicios y store son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { memoryStorage } from './helpers.js';

const ME = 'user-1';
const ORDER_ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = '99999999-8888-4777-8666-555555555555';

function fakeSupabase() {
  const state = { rpc: {}, failInsert: null };
  const q = {
    select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => q, range: () => q, or: () => q,
    insert: () => { q.op = 'insert'; return q; }, update: () => q,
    single: async () => (q.op === 'insert' && state.failInsert ? { data: null, error: state.failInsert } : { data: null, error: null }),
    then: (r, j) => Promise.resolve(q.op === 'insert' && state.failInsert ? { data: null, error: state.failInsert } : { data: [], error: null }).then(r, j),
  };
  const rpc = vi.fn(async (name) => {
    const h = state.rpc[name];
    if (!h) return { data: null, error: { message: `rpc ${name} no programada` } };
    return { data: typeof h === 'function' ? h() : h, error: null };
  });
  return {
    state, rpc, from: () => { q.op = 'select'; return q; },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      updateUser: vi.fn(), reauthenticate: vi.fn(async () => ({ data: {}, error: null })),
    },
  };
}

let supa;
const openWompiWidget = vi.fn();
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: (...a) => openWompiWidget(...a) } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host; let root;
beforeEach(() => {
  vi.resetModules();
  openWompiWidget.mockReset();
  supa = fakeSupabase();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const setValue = (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const button = (text, scope = host) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
/** Pulsa el botón de envío como en Chromium: lo enfoca, envía el formulario y el navegador le quita el foco. */
const pressSubmit = async (btn) => {
  btn.focus();
  await act(async () => { btn.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); btn.blur(); });
  await flush();
};
const mountDetails = async () => {
  const { AccountDetails } = await import('../components/Account/AccountDetails.jsx');
  await act(async () => root.render(<AccountDetails user={{ id: ME, email: 'ana@correo.com' }} profile={{ id: ME, full_name: 'Ana' }} />));
  await flush();
};

describe('«Mi cuenta»: el foco no se pierde al guardar (D131)', () => {
  it('«Guardar dirección» que falla por la red vuelve al botón (no a <body>)', async () => {
    await mountDetails();
    const book = host.querySelector('[data-testid="address-book"]');
    await act(async () => { button('Agregar dirección', book).click(); });
    const form = book.querySelector('[data-testid="address-form"]');
    setValue(form.querySelector('[name="phone"]'), '3001234567');
    setValue(form.querySelector('[name="department"]'), 'Antioquia');
    setValue(form.querySelector('[name="city"]'), 'Medellín');
    setValue(form.querySelector('[name="address_line"]'), 'Calle 10 # 20-30');
    supa.state.failInsert = { message: 'Failed to fetch' };
    const save = button('Guardar dirección', form);
    await pressSubmit(save);
    expect(form.textContent).toMatch(/conexión/);
    expect(document.activeElement).toBe(save);
  });

  it('«Cambiar contraseña»: tras guardar vuelve al botón; si se pide el código, va al campo del código', async () => {
    supa.auth.updateUser
      .mockResolvedValueOnce({ data: { user: { id: ME } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'reauthentication_needed', message: 'Password update requires reauthentication' } });
    await mountDetails();
    const sec = host.querySelector('[data-testid="account-password"]');
    const fill = () => { setValue(sec.querySelector('[name="password"]'), 'Nueva12345'); setValue(sec.querySelector('[name="confirm"]'), 'Nueva12345'); };
    fill();
    const btn = button('Cambiar contraseña', sec);
    await pressSubmit(btn);
    expect(sec.textContent).toMatch(/Contraseña actualizada/);
    expect(document.activeElement).toBe(btn);
    fill();
    await pressSubmit(btn);
    expect(sec.textContent).toMatch(/código a tu correo/);
    expect(document.activeElement).toBe(sec.querySelector('[name="nonce"]'));
  });
});

describe('/cuenta/restablecer: el foco no se pierde (D131)', () => {
  const mountReset = async () => {
    supa.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: ME } } } }));
    const { ResetPasswordPage } = await import('../pages/ResetPasswordPage.jsx');
    await act(async () => root.render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>));
    await flush();
  };
  const fill = () => { setValue(host.querySelector('[name="password"]'), 'Segura123'); setValue(host.querySelector('[name="confirm"]'), 'Segura123'); };

  it('un error general (sin campo) devuelve el foco a «Guardar contraseña»', async () => {
    supa.auth.updateUser.mockResolvedValue({ data: null, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });
    await mountReset(); fill();
    const btn = button('Guardar contraseña');
    await pressSubmit(btn);
    expect(host.textContent).toMatch(/vencieron/);
    expect(document.activeElement).toBe(btn);
  });

  it('al terminar, el foco va al aviso de éxito (el formulario desaparece)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    supa.auth.updateUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
    await mountReset(); fill();
    await pressSubmit(button('Guardar contraseña'));
    const ok = host.querySelector('[role="status"]');
    expect(ok.textContent).toMatch(/Contraseña actualizada/);
    expect(document.activeElement).toBe(ok);
    vi.useRealTimers();
  });
});

describe('Confirmación: «Pagar ahora» (D131)', () => {
  const pending = (over = {}) => ({
    id: ORDER_ID, order_number: 'JM-7', status: 'payment_pending', status_label: 'Pendiente de pago',
    customer_name: 'Ana', customer_email: 'ana@x.co', payment_expires_at: new Date(Date.now() + 3600e3).toISOString(),
    shipping: { department: 'Antioquia', city: 'Medellín', address: 'Cra 1', neighborhood: null, method: 'standard' },
    subtotal: 80000, discount_total: 0, shipping_cost: 12000, total: 92000, items: [], timeline: [], ...over,
  });
  const renderAt = async () => {
    const { OrderConfirmationPage } = await import('../pages/OrderConfirmationPage');
    await act(async () => {
      root.render(<MemoryRouter initialEntries={[`/checkout/confirmacion?order=JM-7&token=${TOKEN}`]}><OrderConfirmationPage /></MemoryRouter>);
    });
    await flush();
  };
  const pressPay = async () => {
    const btn = button('Pagar ahora');
    btn.focus();
    await act(async () => { btn.click(); btn.blur(); });
    await flush();
    return btn;
  };

  it('si el pago falla, el foco vuelve a «Pagar ahora»', async () => {
    supa.state.rpc.get_order_public = pending();
    openWompiWidget.mockRejectedValue(new Error('No hay conexión con la tienda para preparar el pago. Inténtalo de nuevo.'));
    await renderAt();
    const btn = await pressPay();
    expect(host.querySelector('[role=alert]').textContent).toMatch(/No hay conexión/);
    expect(document.activeElement).toBe(btn);
  });

  it('si el pedido ya no admite pago (el botón desaparece), el foco va al título con el estado real', async () => {
    let status = 'payment_pending';
    supa.state.rpc.get_order_public = () => pending({ status, status_label: status === 'paid' ? 'Pagado' : 'Pendiente de pago' });
    openWompiWidget.mockImplementation(async () => { status = 'paid'; throw Object.assign(new Error('Este pedido ya no admite pagos.'), { code: 'JM_ORDER_NOT_PAYABLE' }); });
    await renderAt();
    await pressPay();
    expect(button('Pagar ahora')).toBeUndefined();
    expect(document.activeElement?.tagName).toBe('H1');
    expect(document.activeElement.textContent).toMatch(/Gracias por tu compra/);
  });
});

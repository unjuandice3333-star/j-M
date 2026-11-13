// @vitest-environment jsdom
// Ejecución 110 (D81): errores accesibles en /admin/login y el ajuste de inventario (AdminPasswordSetup se eliminó en la ejecución 115, D86).
// El aviso de error queda enlazado al campo que lo causa (aria-invalid + aria-describedby → id del aviso), el foco va a
// ese campo y las etiquetas están asociadas a su campo (nombre accesible = etiqueta, no el placeholder).
// Las páginas y el store de autenticación son los reales; solo se sustituye Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let supa;
function fakeSupabase() {
  const state = { tables: {}, updateUser: vi.fn(async () => ({ error: null })), signIn: vi.fn(async () => ({ data: null, error: { message: 'Invalid login credentials' } })) };
  const from = vi.fn((table) => {
    const q = {
      select: () => q, eq: () => q, or: () => q, order: () => q, limit: () => q, range: () => q, in: () => q,
      then: (res, rej) => Promise.resolve({ data: state.tables[table] ?? [], error: null, count: null }).then(res, rej),
    };
    return q;
  });
  return {
    state, from, rpc: vi.fn(async () => ({ data: null, error: { message: 'sin rpc' } })),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: (...a) => state.signIn(...a),
      updateUser: (...a) => state.updateUser(...a),
      signOut: async () => ({ error: null }),
    },
  };
}
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host; let root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const submit = async (form) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); }); await flush(); };
const setValue = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const render = async (ui) => {
  await act(async () => root.render(<MemoryRouter>{ui}</MemoryRouter>));
  await flush();
};
/** Campo asociado a la etiqueta `text` por for/id (no por placeholder ni anidación). */
const byLabel = (text) => {
  const label = [...host.querySelectorAll('label')].find((l) => l.textContent.trim().toUpperCase().startsWith(text.toUpperCase()));
  expect(label, `etiqueta ${text}`).toBeTruthy();
  const id = label.getAttribute('for');
  expect(id, `for de ${text}`).toBeTruthy();
  return document.getElementById(id);
};
const expectLinked = (el, msg) => {
  expect(el.getAttribute('aria-invalid')).toBe('true');
  const id = el.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  expect(document.getElementById(id)?.textContent).toMatch(msg);
  expect(document.getElementById(id)?.closest('[role="alert"]')).toBeTruthy();
};
const expectClean = (el) => {
  expect(el.getAttribute('aria-invalid')).not.toBe('true');
  expect(el.getAttribute('aria-describedby')).toBeNull();
};

beforeEach(() => {
  vi.resetModules();
  supa = fakeSupabase();
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('/admin/login', () => {
  it('etiquetas asociadas; credenciales rechazadas → ambos campos enlazados al aviso y foco en el correo', async () => {
    const { AdminLogin } = await import('../pages/admin/AdminLogin');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render(<AdminLogin />);
    const email = byLabel('Correo Administrativo');
    const password = byLabel('Contraseña');
    expect(email.type).toBe('email');
    expect(password.type).toBe('password');
    expectClean(email); expectClean(password);
    // Ejecución 113: sin noValidate, Chromium detenía el envío con su globo nativo (`required`) y el aviso enlazado
    // nunca aparecía (lo detectó el recorrido E2E 45; jsdom no aplica la validación nativa).
    expect(host.querySelector('form').noValidate).toBe(true);

    await setValue(email, 'admin@x.co');
    await setValue(password, 'incorrecta-123');
    password.focus();
    await submit(host.querySelector('form'));
    expect(supa.state.signIn).toHaveBeenCalled();
    expectLinked(email, /Credenciales inválidas/);
    expectLinked(password, /Credenciales inválidas/);
    expect(document.activeElement).toBe(email);
  });

  it('falta la contraseña → solo ese campo queda enlazado y recibe el foco', async () => {
    const { AdminLogin } = await import('../pages/admin/AdminLogin');
    await render(<AdminLogin />);
    const email = byLabel('Correo Administrativo');
    const password = byLabel('Contraseña');
    await setValue(email, 'admin@x.co');
    await submit(host.querySelector('form'));
    expect(supa.state.signIn).not.toHaveBeenCalled();
    expectClean(email);
    expectLinked(password, /ingresa tu correo y contraseña/);
    expect(document.activeElement).toBe(password);
  });
});

describe('/admin/inventario: ajuste de stock', () => {
  const inv = (sku) => ({
    id: `inv-${sku}`, stock: 5, reserved: 0, min_stock: 1, location_shelf: null, variant_id: `v-${sku}`, branch_id: 'b1',
    variants: { id: `v-${sku}`, sku, is_active: true, color_id: 'c1', sizes: { code: 'M' },
      products: { id: 'p1', name: 'Polo', reference: 'POL', status: 'active', product_colors: [{ color_id: 'c1', colors: { name: 'Negro' } }] } },
  });

  it('el error se enlaza al campo de ESA fila y el foco va a él (cantidad, luego motivo)', async () => {
    supa.state.tables.inventories = [inv('POL-A'), inv('POL-B')];
    const { AdminInventoryPage } = await import('../pages/admin/AdminInventoryPage');
    await render(<AdminInventoryPage />);
    const qty = (sku) => host.querySelector(`input[aria-label="Cantidad a ajustar ${sku}"]`);
    const reason = (sku) => host.querySelector(`input[aria-label="Motivo del ajuste ${sku}"]`);
    const adjustBtn = (sku) => qty(sku).parentElement.querySelector('button');
    expect(qty('POL-B')).toBeTruthy();

    await click(adjustBtn('POL-B'));
    expectLinked(qty('POL-B'), /cantidad entera/);
    expectClean(qty('POL-A')); expectClean(reason('POL-B'));
    expect(document.activeElement).toBe(qty('POL-B'));
    // Ejecución 113: el aviso está en la misma fila que el campo (en móvil el de arriba quedaba fuera de la pantalla).
    expect(qty('POL-B').closest('tr').contains(document.getElementById(qty('POL-B').getAttribute('aria-describedby')))).toBe(true);

    await setValue(qty('POL-B'), '3');
    await click(adjustBtn('POL-B'));
    expectClean(qty('POL-B'));
    expectLinked(reason('POL-B'), /motivo/);
    expect(document.activeElement).toBe(reason('POL-B'));
    expect(supa.rpc).not.toHaveBeenCalledWith('admin_adjust_inventory', expect.anything());
  });
});

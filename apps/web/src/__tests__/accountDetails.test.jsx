// @vitest-environment jsdom
// Ejecución 56: perfil y libreta de direcciones del cliente (servicio, «Mi cuenta» y selector del checkout).
// Solo se simula Supabase con una tabla en memoria que aplica los filtros y el índice único de dirección principal
// (uq_customer_addresses_default) y la RLS por usuario; servicio, store y páginas son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeProduct } from './helpers.js';

const ME = 'user-1';
const OTHER = 'user-2';

/** Supabase en memoria: profiles + customer_addresses con RLS (auth.uid() = ME) y el índice único parcial. */
function memorySupabase() {
  const db = { profiles: [], customer_addresses: [], shipping_methods: [] };
  const calls = [];
  const fail = {};
  let seq = 0;
  const from = vi.fn((table) => {
    const call = { table, op: 'select', filters: [], payload: null };
    calls.push(call);
    const visible = (r) => table !== 'customer_addresses' || r.user_id === ME;
    const match = (r) => visible(r) && call.filters.every(([op, c, v]) => (op === 'eq' ? r[c] === v : r[c] !== v));
    const run = () => {
      const f = fail[`${table}.${call.op}`];
      if (f) return { data: null, error: f };
      const rows = db[table] ?? [];
      if (call.op === 'select') return { data: rows.filter(match).map((r) => ({ ...r })), error: null };
      if (call.op === 'insert') {
        const row = { id: `a${++seq}`, created_at: `2026-11-11T00:00:${String(seq).padStart(2, '0')}Z`, ...call.payload };
        if (table === 'customer_addresses' && row.user_id !== ME) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (row.is_default && rows.some((r) => r.user_id === row.user_id && r.is_default)) return { data: null, error: { code: '23505', message: 'duplicate key uq_customer_addresses_default' } };
        rows.push(row);
        return { data: [{ ...row }], error: null };
      }
      const hit = rows.filter(match);
      if (call.op === 'update') {
        for (const r of hit) {
          const next = { ...r, ...call.payload };
          if (table === 'customer_addresses' && next.is_default && rows.some((o) => o !== r && o.user_id === r.user_id && o.is_default)) {
            return { data: null, error: { code: '23505', message: 'duplicate key uq_customer_addresses_default' } };
          }
          Object.assign(r, call.payload);
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (call.op === 'delete') {
        db[table] = rows.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      return { data: null, error: null };
    };
    const q = {
      select: () => q, order: () => q, limit: () => q,
      insert: (p) => { call.op = 'insert'; call.payload = p; return q; },
      update: (p) => { call.op = 'update'; call.payload = p; return q; },
      delete: () => { call.op = 'delete'; return q; },
      eq: (c, v) => { call.filters.push(['eq', c, v]); return q; },
      neq: (c, v) => { call.filters.push(['neq', c, v]); return q; },
      single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  });
  return {
    db, calls, fail, from,
    rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc no programada' } })),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn(async () => ({})) } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let svc, host, root;

const addr = (over = {}) => ({
  recipient_name: 'Ana Pérez', phone: '3001234567', department: 'Antioquia', city: 'Medellín',
  address_line: 'Calle 10 # 20-30', neighborhood: 'Laureles', reference: 'Portería', is_default: false, ...over,
});
const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });

beforeEach(async () => {
  vi.resetModules();
  supa = memorySupabase();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  svc = await import('../services/accountService.js');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

describe('validación (espejo de los CHECK de profiles y customer_addresses)', () => {
  it('perfil: nombre obligatorio, teléfono opcional de 7–15 dígitos; solo columnas editables', () => {
    expect(svc.validateProfile({ full_name: ' ', phone: '' }).errors).toEqual({ full_name: expect.any(String) });
    expect(svc.validateProfile({ full_name: 'Ana', phone: '123' }).errors.phone).toMatch(/7 a 15/);
    expect(svc.validateProfile({ full_name: 'Ana', phone: 'abc1234567' }).errors.phone).toBeTruthy();
    const { errors, row } = svc.validateProfile({ full_name: '  Ana   María  ', phone: ' +57 300 123 4567 ', marketing_opt_in: 1, role: 'admin' });
    expect(errors).toEqual({});
    expect(row).toEqual({ full_name: 'Ana María', phone: '+57 300 123 4567', marketing_opt_in: true });
  });

  it('dirección: campos obligatorios, departamento de la lista y longitudes máximas', () => {
    const { errors } = svc.validateAddress(svc.emptyAddressForm());
    expect(Object.keys(errors).sort()).toEqual(['address_line', 'city', 'department', 'phone', 'recipient_name']);
    expect(svc.validateAddress(addr({ department: 'Texas' })).errors.department).toBeTruthy();
    expect(svc.validateAddress(addr({ reference: 'x'.repeat(501) })).errors.reference).toBeTruthy();
    expect(svc.validateAddress(addr({ address_line: 'x'.repeat(256) })).errors.address_line).toBeTruthy();
    const { errors: ok, row } = svc.validateAddress(addr({ neighborhood: '  ', reference: '' }));
    expect(ok).toEqual({});
    expect(row.neighborhood).toBeNull();
    expect(row.reference).toBeNull();
  });
});

describe('accountService', () => {
  it('updateProfile envía solo columnas permitidas y falla (no finge éxito) si no se actualiza ninguna fila', async () => {
    supa.db.profiles.push({ id: ME, full_name: 'Ana', phone: null, role: 'customer', marketing_opt_in: false });
    const saved = await svc.accountService.updateProfile(ME, { full_name: 'Ana Pérez', phone: '3001234567', marketing_opt_in: true });
    expect(saved).toMatchObject({ full_name: 'Ana Pérez', phone: '3001234567', marketing_opt_in: true, role: 'customer' });
    const upd = supa.calls.find((c) => c.op === 'update');
    expect(Object.keys(upd.payload).sort()).toEqual(['full_name', 'marketing_opt_in', 'phone']);
    await expect(svc.accountService.updateProfile('sin-perfil', { full_name: 'Ana' })).rejects.toThrow(/permiso|guardar/);
  });

  it('marcar otra dirección como principal quita antes la anterior (sin violar el índice único)', async () => {
    const a = await svc.accountService.saveAddress(ME, addr({ is_default: true }));
    const b = await svc.accountService.saveAddress(ME, addr({ address_line: 'Carrera 7 # 1-2', is_default: true }));
    let list = await svc.accountService.listAddresses(ME);
    expect(list.map((x) => [x.id, x.is_default])).toEqual([[b.id, true], [a.id, false]]);
    await svc.accountService.setDefaultAddress(ME, a.id);
    list = await svc.accountService.listAddresses(ME);
    expect(list[0]).toMatchObject({ id: a.id, is_default: true });
    expect(list.filter((x) => x.is_default)).toHaveLength(1);
  });

  it('no ve ni modifica direcciones de otro usuario (filtro user_id además de RLS)', async () => {
    supa.db.customer_addresses.push({ id: 'ajena', user_id: OTHER, ...addr({ is_default: true }) });
    expect(await svc.accountService.listAddresses(ME)).toEqual([]);
    await expect(svc.accountService.saveAddress(ME, { ...addr(), id: 'ajena' })).rejects.toThrow(/ya no existe/);
    expect(supa.db.customer_addresses.find((r) => r.id === 'ajena').address_line).toBe('Calle 10 # 20-30');
  });

  it('eliminar la principal promueve la más reciente de las restantes', async () => {
    const a = await svc.accountService.saveAddress(ME, addr({ is_default: true }));
    await svc.accountService.saveAddress(ME, addr({ address_line: 'Carrera 7 # 1-2' }));
    const c = await svc.accountService.saveAddress(ME, addr({ address_line: 'Avenida 3 # 4-5' }));
    const rest = await svc.accountService.deleteAddress(ME, a);
    expect(rest).toHaveLength(2);
    expect(rest[0]).toMatchObject({ id: c.id, is_default: true });
    expect(supa.db.customer_addresses.filter((r) => r.is_default).map((r) => r.id)).toEqual([c.id]);
  });

  it('traduce errores de la BD a mensajes en español', () => {
    expect(svc.accountError({ code: '23514' }, 'x').message).toMatch(/formato/);
    expect(svc.accountError({ code: '42501', message: 'permission denied' }, 'x').message).toMatch(/permiso/);
    expect(svc.accountError({ message: 'Failed to fetch' }, 'x').message).toMatch(/conexión/);
    expect(svc.accountError({ code: 'XX000', message: 'boom' }, 'Fallo genérico').message).toBe('Fallo genérico');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------------------------------------------
const setValue = (el, value) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  act(() => { el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const submitForm = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const button = (text, scope = host) => [...scope.querySelectorAll('button')].find((b) => b.textContent.includes(text));

describe('«Mi cuenta»: datos y direcciones', () => {
  let useAuthStore;
  const mountAccount = async () => {
    ({ useAuthStore } = await import('../store/authStore.js'));
    const profile = { id: ME, full_name: 'Ana', phone: null, role: 'customer', marketing_opt_in: false };
    supa.db.profiles.push({ ...profile });
    useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile });
    const { AccountPage } = await import('../pages/AccountPage.jsx');
    vi.spyOn(await import('../services/orderService.js').then((m) => m.orderService), 'getMyOrders').mockResolvedValue([]);
    await act(async () => root.render(<AccountPage />));
    await flush();
  };

  it('guarda el perfil y actualiza el nombre de la cabecera sin recargar', async () => {
    await mountAccount();
    const section = host.querySelector('[data-testid="profile-section"]');
    setValue(section.querySelector('[name="full_name"]'), 'Ana María Pérez');
    setValue(section.querySelector('[name="phone"]'), '12');
    await submitForm(section.querySelector('form'));
    expect(section.textContent).toMatch(/7 a 15 dígitos/);
    expect(supa.calls.some((c) => c.table === 'profiles' && c.op === 'update')).toBe(false);
    setValue(section.querySelector('[name="phone"]'), '300 123 4567');
    await submitForm(section.querySelector('form'));
    await flush();
    expect(section.textContent).toMatch(/Datos guardados/);
    expect(supa.db.profiles[0]).toMatchObject({ full_name: 'Ana María Pérez', phone: '300 123 4567' });
    expect(useAuthStore.getState().profile.full_name).toBe('Ana María Pérez');
    expect(host.querySelector('h1').textContent).toBe('Ana María Pérez');
  });

  it('una relectura del perfil (p. ej. renovación del token) no borra lo que el cliente está escribiendo', async () => {
    await mountAccount();
    const input = host.querySelector('[data-testid="profile-section"] [name="full_name"]');
    setValue(input, 'Ana Escribiendo');
    await act(async () => useAuthStore.setState({ profile: { id: ME, full_name: 'Ana', phone: null, role: 'customer' } }));
    expect(input.value).toBe('Ana Escribiendo');
  });

  it('una lectura del perfil que llega tarde no pisa el perfil recién guardado', async () => {
    ({ useAuthStore } = await import('../store/authStore.js'));
    let release;
    const slow = new Promise((r) => { release = r; });
    useAuthStore.setState({ fetchProfile: async () => { await slow; return { id: ME, full_name: 'Nombre Viejo' }; } });
    const pending = useAuthStore.getState().loadProfile(ME);
    useAuthStore.getState().setProfile({ id: ME, full_name: 'Nombre Nuevo' });
    release();
    expect((await pending).full_name).toBe('Nombre Nuevo');
    // dos lecturas en vuelo (login + SIGNED_IN): la superada espera a la nueva y nunca devuelve un perfil vacío
    const gates = {};
    useAuthStore.setState({ profile: null, fetchProfile: (id) => new Promise((r) => { gates[id] = r; }) });
    const first = useAuthStore.getState().loadProfile('a');
    const second = useAuthStore.getState().loadProfile('b');
    gates.a({ id: ME, full_name: 'Primera', role: 'admin' });
    let firstValue;
    first.then((v) => { firstValue = v; });
    await Promise.resolve(); await Promise.resolve();
    expect(firstValue).toBeUndefined();
    gates.b({ id: ME, full_name: 'Segunda', role: 'admin' });
    expect((await first).full_name).toBe('Segunda');
    expect((await second).full_name).toBe('Segunda');
    // sin interferencias, la lectura más reciente sí se aplica
    useAuthStore.setState({ fetchProfile: async () => ({ id: ME, full_name: 'Desde BD' }) });
    expect((await useAuthStore.getState().loadProfile(ME)).full_name).toBe('Desde BD');
  });

  it('agrega la primera dirección (queda principal) y valida antes de enviar', async () => {
    await mountAccount();
    const book = host.querySelector('[data-testid="address-book"]');
    expect(book.textContent).toMatch(/Aún no tienes direcciones/);
    await click(button('Agregar dirección', book));
    const form = book.querySelector('[data-testid="address-form"]');
    expect(form.querySelector('[name="recipient_name"]').value).toBe('Ana');
    expect(form.querySelector('[name="is_default"]').checked).toBe(true);
    await submitForm(form);
    expect(form.textContent).toMatch(/Revisa los campos marcados/);
    expect(supa.db.customer_addresses).toHaveLength(0);
    setValue(form.querySelector('[name="phone"]'), '3001234567');
    setValue(form.querySelector('[name="department"]'), 'Antioquia');
    setValue(form.querySelector('[name="city"]'), 'Medellín');
    setValue(form.querySelector('[name="address_line"]'), 'Calle 10 # 20-30');
    await submitForm(form);
    await flush();
    expect(supa.db.customer_addresses).toHaveLength(1);
    expect(supa.db.customer_addresses[0]).toMatchObject({ user_id: ME, is_default: true, department: 'Antioquia' });
    expect(book.querySelectorAll('[data-testid="address-item"]')).toHaveLength(1);
    expect(book.textContent).toMatch(/Principal/);
    expect(book.textContent).toMatch(/Dirección guardada/);
  });

  it('un fallo al cargar direcciones se muestra como error (no como «sin direcciones»)', async () => {
    supa.fail['customer_addresses.select'] = { code: 'XX000', message: 'boom' };
    await mountAccount();
    const book = host.querySelector('[data-testid="address-book"]');
    expect(book.textContent).toMatch(/No pudimos cargar tus direcciones/);
    expect(book.textContent).not.toMatch(/Aún no tienes direcciones/);
  });

  it('hacer principal y eliminar desde la lista', async () => {
    supa.db.customer_addresses.push(
      { id: 'd1', user_id: ME, created_at: '2026-11-01T00:00:00Z', ...addr({ is_default: true }) },
      { id: 'd2', user_id: ME, created_at: '2026-11-02T00:00:00Z', ...addr({ address_line: 'Carrera 7 # 1-2' }) },
    );
    vi.stubGlobal('confirm', () => true);
    await mountAccount();
    const book = host.querySelector('[data-testid="address-book"]');
    await click(button('Hacer principal', book));
    await flush();
    expect(supa.db.customer_addresses.find((r) => r.id === 'd2').is_default).toBe(true);
    expect(supa.db.customer_addresses.find((r) => r.id === 'd1').is_default).toBe(false);
    await click(book.querySelector('[aria-label="Eliminar dirección Carrera 7 # 1-2"]'));
    await flush();
    expect(supa.db.customer_addresses.map((r) => [r.id, r.is_default])).toEqual([['d1', true]]);
    expect(book.querySelectorAll('[data-testid="address-item"]')).toHaveLength(1);
  });
});

describe('Checkout: direcciones guardadas', () => {
  const mountCheckout = async (draft) => {
    if (draft) sessionStorage.setItem('jm-checkout-draft', JSON.stringify(draft));
    const { useAuthStore } = await import('../store/authStore.js');
    useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile: { id: ME, full_name: 'Ana Pérez' } });
    const { useECommerceStore } = await import('../store/eCommerceStore.js');
    await useECommerceStore.persist.rehydrate();
    useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {} });
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 1);
    const { CheckoutPage } = await import('../pages/CheckoutPage.jsx');
    await act(async () => root.render(<CheckoutPage />));
    await flush();
  };
  const val = (name) => host.querySelector(`[name="${name}"]`).value;

  it('sin borrador, completa el envío con la dirección principal y permite elegir otra', async () => {
    supa.db.customer_addresses.push(
      { id: 'd1', user_id: ME, created_at: '2026-11-01T00:00:00Z', ...addr({ is_default: true }) },
      { id: 'd2', user_id: ME, created_at: '2026-11-02T00:00:00Z', ...addr({ department: 'Bogotá D.C.', city: 'Bogotá', address_line: 'Carrera 7 # 1-2', neighborhood: null, reference: null }) },
    );
    await mountCheckout();
    expect([val('department'), val('city'), val('address'), val('neighborhood'), val('phone')])
      .toEqual(['Antioquia', 'Medellín', 'Calle 10 # 20-30', 'Laureles', '3001234567']);
    const select = host.querySelector('[data-testid="saved-address-select"]');
    expect(select.value).toBe('d1');
    setValue(select, 'd2');
    expect([val('department'), val('city'), val('address'), val('neighborhood')]).toEqual(['Bogotá D.C.', 'Bogotá', 'Carrera 7 # 1-2', '']);
    setValue(host.querySelector('[name="city"]'), 'Chía');
    expect(select.value).toBe('');
  });

  it('no pisa lo que el cliente ya había escrito (borrador de la sesión)', async () => {
    supa.db.customer_addresses.push({ id: 'd1', user_id: ME, created_at: '2026-11-01T00:00:00Z', ...addr({ is_default: true }) });
    await mountCheckout({ department: 'Caldas', city: 'Manizales', address: 'Calle 1 # 2-3' });
    expect([val('department'), val('city'), val('address')]).toEqual(['Caldas', 'Manizales', 'Calle 1 # 2-3']);
    expect(host.querySelector('[data-testid="saved-address-select"]').value).toBe('');
  });

  it('si fallan las direcciones guardadas, el checkout sigue funcionando sin selector', async () => {
    supa.fail['customer_addresses.select'] = { code: 'XX000', message: 'boom' };
    await mountCheckout();
    expect(host.querySelector('[data-testid="saved-address-select"]')).toBeNull();
    expect(host.querySelector('[name="address"]')).not.toBeNull();
  });
});

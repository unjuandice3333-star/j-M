// @vitest-environment jsdom
// Ejecución 70: la casilla del boletín de «Mis datos» usa la lista real (my_newsletter_subscription /
// set_my_newsletter_subscription). Antes solo cambiaba profiles.marketing_opt_in: el cliente no entraba en la
// lista del admin ni podía darse de baja del boletín de la portada. Solo se simula Supabase.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage } from './helpers.js';

const ME = 'user-1';
let supa;
let nlRow; // fila de newsletter_subscribers del correo de la cuenta (o null)
let rpcError;

function fakeSupabase() {
  const profiles = [{ id: ME, full_name: 'Ana', phone: null, role: 'customer', marketing_opt_in: false }];
  const status = () => ({ email: 'ana@correo.com', subscribed: nlRow ? !nlRow.unsubscribed : !!profiles[0].marketing_opt_in, on_list: !!nlRow });
  const rpc = vi.fn(async (name, args) => {
    if (rpcError?.[name]) return { data: null, error: rpcError[name] };
    if (name === 'my_newsletter_subscription') return { data: status(), error: null };
    if (name === 'set_my_newsletter_subscription') {
      if (args.p_subscribed) nlRow = { unsubscribed: false }; else if (nlRow) nlRow.unsubscribed = true;
      profiles[0].marketing_opt_in = args.p_subscribed;
      return { data: status(), error: null };
    }
    return { data: null, error: { message: 'rpc no programada' } };
  });
  const from = vi.fn(() => {
    let payload = null;
    const run = () => {
      if (payload) Object.assign(profiles[0], payload);
      return { data: [{ ...profiles[0] }], error: null };
    };
    const q = {
      select: () => q, order: () => q, limit: () => q, eq: () => q, neq: () => q,
      update: (p) => { payload = p; return q; },
      single: async () => ({ data: run().data[0], error: null }),
      then: (res, rej) => Promise.resolve(payload ? run() : { data: [], error: null }).then(res, rej),
    };
    return q;
  });
  return { rpc, from, profiles, auth: { getSession: vi.fn(async () => ({ data: { session: null } })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })) } };
}

vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const section = () => host.querySelector('[data-testid="profile-section"]');
const box = () => section().querySelector('[name="marketing_opt_in"]');
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const save = async () => { await act(async () => { section().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };
const setCalls = () => supa.rpc.mock.calls.filter(([n]) => n === 'set_my_newsletter_subscription');

async function mount() {
  const { useAuthStore } = await import('../store/authStore.js');
  const profile = { ...supa.profiles[0] };
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: ME, email: 'ana@correo.com' }, profile });
  const { AccountDetails } = await import('../components/Account/AccountDetails.jsx');
  await act(async () => root.render(<AccountDetails user={{ id: ME, email: 'ana@correo.com' }} profile={profile} />));
  await flush();
}

beforeEach(() => {
  vi.resetModules();
  nlRow = null; rpcError = null;
  supa = fakeSupabase();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

describe('«Mis datos»: boletín real del correo de la cuenta', () => {
  it('suscrito desde la portada → casilla marcada; desmarcar y guardar da de baja en la lista', async () => {
    nlRow = { unsubscribed: false };
    await mount();
    expect(box().checked).toBe(true);
    expect(section().textContent).toMatch(/Estás suscrito/);
    await click(box());
    await save();
    expect(setCalls()).toEqual([['set_my_newsletter_subscription', { p_subscribed: false }]]);
    expect(nlRow.unsubscribed).toBe(true);
    expect(box().checked).toBe(false);
    expect(section().textContent).toMatch(/Te diste de baja del boletín/);
  });

  it('marcar y guardar suscribe el correo de la cuenta (entra en la lista del admin)', async () => {
    await mount();
    expect(box().checked).toBe(false);
    await click(box());
    await save();
    expect(setCalls()).toEqual([['set_my_newsletter_subscription', { p_subscribed: true }]]);
    expect(nlRow).toEqual({ unsubscribed: false });
    expect(section().textContent).toMatch(/Quedaste suscrito/);
  });

  it('consentimiento antiguo sin fila en la lista: guardar con la casilla marcada lo incorpora a la lista', async () => {
    supa.profiles[0].marketing_opt_in = true;
    await mount();
    expect(box().checked).toBe(true);
    await save();
    expect(setCalls()).toEqual([['set_my_newsletter_subscription', { p_subscribed: true }]]);
    expect(nlRow).toEqual({ unsubscribed: false });
  });

  it('guardar sin cambiar la casilla no llama a la RPC de alta/baja', async () => {
    nlRow = { unsubscribed: false };
    await mount();
    await save();
    expect(setCalls()).toHaveLength(0);
    expect(section().textContent).toMatch(/^.*Datos guardados\./);
  });

  it('correo sin confirmar → casilla deshabilitada con el motivo', async () => {
    rpcError = { my_newsletter_subscription: { code: 'P0001', hint: 'JM_EMAIL_UNCONFIRMED', message: 'x' } };
    await mount();
    expect(box().disabled).toBe(true);
    expect(section().textContent).toMatch(/Confirma tu correo/);
  });

  it('si la baja falla, los datos se guardan y se informa que la suscripción no cambió', async () => {
    nlRow = { unsubscribed: false };
    await mount();
    rpcError = { set_my_newsletter_subscription: { message: 'Failed to fetch' } };
    await click(box());
    await save();
    expect(nlRow.unsubscribed).toBe(false);
    expect(section().querySelector('[role="alert"]').textContent).toMatch(/no cambió tu suscripción/);
  });

  it('BD sin la migración (PGRST202): la casilla sigue funcionando solo con el perfil', async () => {
    rpcError = { my_newsletter_subscription: { code: 'PGRST202', message: 'not found' } };
    await mount();
    expect(box().disabled).toBe(false);
    await click(box());
    await save();
    expect(setCalls()).toHaveLength(0);
    expect(supa.profiles[0].marketing_opt_in).toBe(true);
  });
});

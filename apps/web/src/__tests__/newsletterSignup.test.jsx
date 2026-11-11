// @vitest-environment jsdom
// Ejecución 67: boletín «Únete al club J&M». Antes confirmaba sin guardar nada y prometía un 10% inexistente.
// Solo se simula Supabase; servicio y componente son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { makeSupabaseMock } from './helpers.js';

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root, svc, NewsletterSignup;
const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });

beforeEach(async () => {
  vi.resetModules();
  supa = makeSupabaseMock();
  svc = await import('../services/newsletterService.js');
  ({ NewsletterSignup } = await import('../components/Home/NewsletterSignup.jsx'));
  host = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(host);
  root = createRoot(host);
});

const render = async () => { await act(async () => { root.render(React.createElement(NewsletterSignup, { source: 'home' })); }); };
const type = async (value) => {
  const input = host.querySelector('input[type=email]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const submit = async () => { await act(async () => { host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush(); };

describe('newsletterService', () => {
  it('valida el correo igual que la RPC y no llama a la BD si es inválido', async () => {
    expect(svc.validateNewsletterEmail('')).toMatch(/Escribe/);
    expect(svc.validateNewsletterEmail('ana@')).toMatch(/nombre@dominio/);
    expect(svc.validateNewsletterEmail(`${'a'.repeat(250)}@x.co`)).toBeTruthy();
    expect(svc.validateNewsletterEmail(' ana@x.co ')).toBeNull();
    await expect(svc.subscribeNewsletter('no-correo')).rejects.toThrow(/nombre@dominio/);
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('envía el correo recortado y el origen a subscribe_newsletter', async () => {
    supa.state.rpc.subscribe_newsletter = { data: { ok: true }, error: null };
    await expect(svc.subscribeNewsletter('  ana@x.co ', 'home')).resolves.toBe(true);
    expect(supa.rpc).toHaveBeenCalledWith('subscribe_newsletter', { p_email: 'ana@x.co', p_source: 'home' });
  });

  it('traduce límite, RPC ausente (migración sin aplicar) y fallos de red', async () => {
    supa.state.rpc.subscribe_newsletter = { data: null, error: { code: 'P0001', hint: 'JM_RATE_LIMITED', message: 'x' } };
    await expect(svc.subscribeNewsletter('ana@x.co')).rejects.toThrow(/en un minuto/);
    supa.state.rpc.subscribe_newsletter = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    await expect(svc.subscribeNewsletter('ana@x.co')).rejects.toThrow(/no está disponible/);
    supa.state.rpc.subscribe_newsletter = () => { throw new TypeError('Failed to fetch'); };
    await expect(svc.subscribeNewsletter('ana@x.co')).rejects.toThrow(/conexión/);
    supa.state.rpc.subscribe_newsletter = { data: null, error: null };
    await expect(svc.subscribeNewsletter('ana@x.co')).rejects.toThrow(/No pudimos/);
  });
});

describe('NewsletterSignup', () => {
  it('no promete un descuento inexistente', async () => {
    await render();
    expect(host.textContent).not.toMatch(/10\s*%/);
    expect(host.textContent).not.toMatch(/beneficio/i);
  });

  it('solo confirma cuando la BD respondió ok', async () => {
    supa.state.rpc.subscribe_newsletter = { data: { ok: true }, error: null };
    await render();
    await type('ana@x.co');
    await submit();
    expect(supa.rpc).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[role=status]').textContent).toMatch(/quedó registrado/);
  });

  it('con error de la BD muestra el motivo, conserva el correo y permite reintentar', async () => {
    supa.state.rpc.subscribe_newsletter = { data: null, error: { code: 'PGRST202', message: 'x' } };
    await render();
    await type('ana@x.co');
    await submit();
    expect(host.querySelector('[role=status]')).toBeNull();
    expect(host.querySelector('[role=alert]').textContent).toMatch(/no está disponible/);
    expect(host.querySelector('input').value).toBe('ana@x.co');
    supa.state.rpc.subscribe_newsletter = { data: { ok: true }, error: null };
    await submit();
    expect(host.querySelector('[role=status]')).not.toBeNull();
  });

  it('correo inválido: aviso sin llamar a la BD', async () => {
    await render();
    await type('ana@');
    await submit();
    expect(supa.rpc).not.toHaveBeenCalled();
    expect(host.querySelector('[role=alert]').textContent).toMatch(/nombre@dominio/);
  });
});

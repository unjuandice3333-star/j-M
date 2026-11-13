// @vitest-environment jsdom
// Ejecución 114 (D85): formularios de acceso de la tienda (/login y /cuenta sin sesión). Antes tenían `required` sin
// `noValidate` (Chromium mostraba su globo y el aviso no salía), el registro aceptaba contraseñas < 8 y /cuenta no
// asociaba las etiquetas a sus campos. jsdom no aplica la validación nativa: el recorrido E2E 46 lo comprueba en Chromium.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { memoryStorage, makeSupabaseMock } from './helpers.js';
import { validateAuthForm, serverErrorField } from '../utils/authForm.js';

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
vi.mock('../services/wompi', () => ({ wompiService: { openWompiWidget: vi.fn(async () => ({})) } }));
vi.mock('../services/analytics', () => ({ analyticsService: new Proxy({}, { get: () => () => {} }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
const setValue = (el, v) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const submit = async (formEl) => {
  await act(async () => { formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};
const expectLinked = (el, text) => {
  expect(document.activeElement).toBe(el);
  expect(el.getAttribute('aria-invalid')).toBe('true');
  const msg = document.getElementById(el.getAttribute('aria-describedby'));
  expect(msg).not.toBeNull();
  expect(msg.textContent).toMatch(text);
};
const $ = (sel) => document.querySelector(sel);

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supa = makeSupabaseMock();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

describe('validateAuthForm', () => {
  it('devuelve el primer problema en el orden del formulario', () => {
    expect(validateAuthForm({ email: '', password: '' })).toEqual({ field: 'email', message: 'Escribe tu correo electrónico.' });
    expect(validateAuthForm({ email: 'ana@', password: 'x' }).field).toBe('email');
    expect(validateAuthForm({ email: 'ana@b.co', password: '' })).toEqual({ field: 'password', message: 'Escribe tu contraseña.' });
    expect(validateAuthForm({ email: 'ana@b.co', password: 'x' })).toBeNull(); // al iniciar sesión no se juzga la longitud
    expect(validateAuthForm({ email: '', password: '', fullName: ' ', register: true }).field).toBe('fullName');
  });
  it('el registro exige la política de contraseñas de la tienda (8–72)', () => {
    const base = { email: 'ana@b.co', fullName: 'Ana Ruiz', register: true };
    expect(validateAuthForm({ ...base, password: 'corta12' }).message).toMatch(/al menos 8/);
    expect(validateAuthForm({ ...base, password: 'x'.repeat(73) }).message).toMatch(/máximo 72/);
    expect(validateAuthForm({ ...base, password: '        ' }).message).toMatch(/solo espacios/);
    expect(validateAuthForm({ ...base, password: 'Segura123' })).toBeNull();
  });
  it('enlaza los errores del servidor al campo que se debe corregir', () => {
    expect(serverErrorField('Correo o contraseña incorrectos.', false)).toBe('password');
    expect(serverErrorField('Este correo ya está registrado.', true)).toBe('email');
    expect(serverErrorField('La contraseña es muy débil.', true)).toBe('password');
  });
});

describe('/login', () => {
  const mount = async () => {
    const { Login } = await import('../pages/Login.jsx');
    await act(async () => { root.render(<MemoryRouter><Login /></MemoryRouter>); });
    await flush();
  };
  it('desactiva la validación nativa y enlaza el aviso al campo vacío', async () => {
    await mount();
    const form = $('form');
    expect(form.noValidate).toBe(true);
    await submit(form);
    expectLinked($('#login-email'), /Escribe tu correo/);
    await setValue($('#login-email'), 'ana@b.co');
    expect($('#login-email').getAttribute('aria-invalid')).toBe('false'); // escribir en el campo quita el aviso
    await submit(form);
    expectLinked($('#login-password'), /Escribe tu contraseña/);
  });
  it('credenciales erróneas: el aviso del servidor queda en la contraseña', async () => {
    supa.auth.signInWithPassword = vi.fn(async () => ({ data: {}, error: { message: 'Invalid login credentials' } }));
    await mount();
    await setValue($('#login-email'), 'ana@b.co'); await setValue($('#login-password'), 'mala-clave');
    await submit($('form'));
    expectLinked($('#login-password'), /incorrectos/);
    expect(document.querySelectorAll('[role=alert]').length).toBe(1); // sin repetir el mismo error arriba
  });
  it('registro: contraseña corta no llega a Supabase', async () => {
    supa.auth.signUp = vi.fn();
    await mount();
    const toggle = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Crear cuenta');
    await act(async () => { toggle.click(); });
    await submit($('form'));
    expectLinked($('#login-fullname'), /nombre completo/);
    await setValue($('#login-fullname'), 'Ana Ruiz'); await setValue($('#login-email'), 'ana@b.co'); await setValue($('#login-password'), 'corta');
    await submit($('form'));
    expectLinked($('#login-password'), /al menos 8/);
    expect(supa.auth.signUp).not.toHaveBeenCalled();
  });
});

describe('/cuenta sin sesión', () => {
  const mount = async () => {
    const { AccountPage } = await import('../pages/AccountPage.jsx');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/cuenta']}><AccountPage /></MemoryRouter>); });
    await flush();
  };
  it('etiquetas asociadas, sin validación nativa y avisos enlazados', async () => {
    await mount();
    const email = $('#account-auth-email');
    expect(email.labels[0].textContent).toMatch(/Correo electrónico/);
    expect($('#account-auth-password').labels[0].textContent).toMatch(/Contraseña/);
    const form = email.closest('form');
    expect(form.noValidate).toBe(true);
    await submit(form);
    expectLinked(email, /Escribe tu correo/);
    const forgot = [...document.querySelectorAll('button')].find((b) => /Olvidaste/.test(b.textContent));
    await act(async () => { forgot.click(); });
    await flush();
    expectLinked(email, /recuperación/);
  });
  it('registro sin nombre y con contraseña corta', async () => {
    supa.auth.signUp = vi.fn();
    await mount();
    const toggle = [...document.querySelectorAll('button')].find((b) => /Empieza/.test(b.textContent));
    await act(async () => { toggle.click(); });
    const form = $('#account-auth-email').closest('form');
    await submit(form);
    expectLinked($('#account-auth-name'), /nombre completo/);
    await setValue($('#account-auth-name'), 'Ana Ruiz'); await setValue($('#account-auth-email'), 'ana@b.co'); await setValue($('#account-auth-password'), 'corta');
    await submit(form);
    expectLinked($('#account-auth-password'), /al menos 8/);
    expect(supa.auth.signUp).not.toHaveBeenCalled();
  });
});

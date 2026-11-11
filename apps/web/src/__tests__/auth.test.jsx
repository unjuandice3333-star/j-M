// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

// Solo se simula el enrutador (dependencia externa): Navigate se representa como una etiqueta observable.
let currentPath = '/mi-cuenta';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: currentPath }),
  Navigate: ({ to, state }) => React.createElement('redirect', { 'data-to': to, 'data-error': state?.error ?? '' }),
}));

let useAuthStore, authMessage, AuthGuard;
beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  Object.values(supa.auth).forEach((f) => f.mockClear?.());
  supa.state.auth = {};
  supa.state.tables = {};
  ({ useAuthStore, authMessage } = await import('../store/authStore.js'));
  ({ AuthGuard } = await import('../routes/AuthGuard.jsx'));
});
const A = () => useAuthStore.getState();
const setAuth = (patch) => useAuthStore.setState(patch);
const user = { id: 'u1', email: 'a@b.co' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const render = (props = {}) => {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<AuthGuard {...props}><main>CONTENIDO</main></AuthGuard>));
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
};

describe('registro', () => {
  it('con confirmación de correo desactivada: queda con sesión y perfil', async () => {
    supa.state.auth.signUp = async () => ({ data: { user, session: { access_token: 't' } }, error: null });
    supa.state.tables.profiles = [{ id: 'u1', role: 'customer', full_name: 'Ana' }];
    await A().signUp('a@b.co', 'clave-segura-1', 'Ana');
    expect(supa.auth.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'clave-segura-1', options: { data: { full_name: 'Ana' } } });
    expect(A()).toMatchObject({ isLoggedIn: true, isLoading: false, profile: { role: 'customer' } });
  });
  it('con confirmación de correo pendiente: usuario creado pero SIN sesión', async () => {
    supa.state.auth.signUp = async () => ({ data: { user, session: null }, error: null });
    await A().signUp('a@b.co', 'clave-segura-1', 'Ana');
    expect(A().isLoggedIn).toBe(false);
  });
  it('correo ya registrado → mensaje claro y estado de error, sin sesión', async () => {
    supa.state.auth.signUp = async () => ({ data: null, error: { message: 'User already registered' } });
    await expect(A().signUp('a@b.co', 'x', 'Ana')).rejects.toThrow(/Ya existe una cuenta/);
    expect(A()).toMatchObject({ isLoggedIn: false, isLoading: false, error: expect.stringMatching(/Ya existe/) });
  });
});

describe('inicio y cierre de sesión', () => {
  it('login correcto carga el perfil y marca la sesión', async () => {
    supa.state.auth.signIn = async () => ({ data: { user, session: { access_token: 't' } }, error: null });
    supa.state.tables.profiles = [{ id: 'u1', role: 'admin' }];
    await A().login('a@b.co', 'clave');
    expect(A()).toMatchObject({ isLoggedIn: true, user, profile: { role: 'admin' }, error: null });
  });
  it('credenciales incorrectas → mensaje en español, sin revelar si el correo existe', async () => {
    await expect(A().login('a@b.co', 'mala')).rejects.toThrow('Correo o contraseña incorrectos.');
    expect(A().isLoggedIn).toBe(false);
  });
  it('logout limpia sesión, usuario y perfil aunque signOut falle', async () => {
    useAuthStore.setState({ user, session: {}, profile: { role: 'admin' }, isLoggedIn: true });
    supa.auth.signOut.mockRejectedValueOnce(new Error('red caída'));
    await A().logout();
    expect(A()).toMatchObject({ user: null, session: null, profile: null, isLoggedIn: false, isLoading: false });
  });
  it.each([
    ['Email not confirmed', /Confirma tu correo/], ['Password should be at least 6 characters', /demasiado débil/],
    ['email rate limit exceeded', /Demasiados intentos/], ['Failed to fetch', /No hay conexión/], ['algo raro', /No se pudo completar/],
  ])('authMessage traduce "%s"', (raw, re) => expect(authMessage({ message: raw })).toMatch(re));
});

describe('persistencia de sesión', () => {
  it('initAuth restaura una sesión existente con su perfil y se suscribe a cambios', async () => {
    supa.state.auth.getSession = { data: { session: { user, access_token: 't' } }, error: null };
    supa.state.tables.profiles = [{ id: 'u1', role: 'customer' }];
    await A().initAuth();
    expect(A()).toMatchObject({ isLoggedIn: true, isLoading: false, profile: { role: 'customer' } });
    expect(supa.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });
  it('sin sesión guardada → anónimo y deja de cargar', async () => {
    await A().initAuth();
    expect(A()).toMatchObject({ isLoggedIn: false, isLoading: false, user: null });
  });
  it('un error al leer la sesión no deja la app cargando para siempre', async () => {
    supa.state.auth.getSession = { data: { session: null }, error: { message: 'fallo' } };
    await A().initAuth();
    expect(A()).toMatchObject({ isLoggedIn: false, isLoading: false, error: 'fallo' });
  });
  it('el cambio de estado de Supabase (logout en otra pestaña) cierra la sesión local', async () => {
    useAuthStore.setState({ user, session: {}, isLoggedIn: true });
    await A().initAuth();
    const cb = supa.auth.onAuthStateChange.mock.calls[0][0];
    await cb('SIGNED_OUT', null);
    expect(A().isLoggedIn).toBe(false);
  });
  it('el callback no espera consultas (evita el bloqueo del candado de supabase-js en updateUser) y un evento viejo no pisa uno nuevo', async () => {
    supa.state.tables.profiles = [{ id: 'u1', role: 'customer' }];
    await A().initAuth();
    const cb = supa.auth.onAuthStateChange.mock.calls[0][0];
    const fetchSpy = vi.fn(async () => ({ id: 'u1', role: 'customer' }));
    useAuthStore.setState({ fetchProfile: fetchSpy });
    // síncrono: devuelve sin esperar y la consulta del perfil aún no empezó (se hace fuera del candado)
    expect(cb('USER_UPDATED', { user })).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(A()).toMatchObject({ isLoggedIn: true, profile: { role: 'customer' } });
    // SIGNED_IN seguido de SIGNED_OUT inmediato: la lectura diferida del primero no reabre la sesión
    cb('SIGNED_IN', { user });
    cb('SIGNED_OUT', null);
    await new Promise((r) => setTimeout(r, 5));
    expect(A().isLoggedIn).toBe(false);
  });
});

describe('roles y rutas protegidas', () => {
  it('isAdmin / hasRole solo reconocen admin y super_admin; sin perfil nadie es admin', () => {
    expect(A().isAdmin()).toBe(false);
    for (const [role, admin] of [['customer', false], ['staff', false], ['admin', true], ['super_admin', true]]) {
      useAuthStore.setState({ profile: { role } });
      expect(A().isAdmin()).toBe(admin);
    }
    useAuthStore.setState({ profile: { role: 'admin' } });
    expect(A().hasRole(['admin', 'super_admin'])).toBe(true);
    expect(A().hasRole(['customer'])).toBe(false);
  });

  it('mientras carga muestra el indicador y NO el contenido protegido', () => {
    setAuth({ isLoading: true, isLoggedIn: false });
    expect(render()).not.toContain('CONTENIDO');
  });
  it('anónimo en ruta de cliente → /login; en ruta admin → /admin/login', () => {
    setAuth({ isLoading: false, isLoggedIn: false });
    currentPath = '/mi-cuenta';
    expect(render()).toContain('data-to="/login"');
    currentPath = '/admin/pedidos';
    expect(render()).toContain('data-to="/admin/login"');
    expect(render()).not.toContain('CONTENIDO');
  });
  it('cliente autenticado entra a rutas de cliente', () => {
    setAuth({ isLoading: false, isLoggedIn: true, profile: { role: 'customer' } });
    currentPath = '/mi-cuenta';
    expect(render()).toContain('CONTENIDO');
  });
  it('un cliente NO accede al panel admin: redirige con aviso y sin contenido', () => {
    setAuth({ isLoading: false, isLoggedIn: true, profile: { role: 'customer' } });
    currentPath = '/admin';
    const html = render({ allowedRoles: ['admin', 'super_admin'] });
    expect(html).not.toContain('CONTENIDO');
    expect(html).toContain('data-to="/admin/login"');
    expect(html).toContain('no tiene permisos administrativos');
  });
  it('sesión sin rol (perfil aún no cargado o nulo) tampoco entra al admin', () => {
    setAuth({ isLoading: false, isLoggedIn: true, profile: null });
    currentPath = '/admin';
    expect(render({ allowedRoles: ['admin'] })).not.toContain('CONTENIDO');
  });
  it('admin y super_admin entran al panel', () => {
    currentPath = '/admin';
    for (const role of ['admin', 'super_admin']) {
      setAuth({ isLoading: false, isLoggedIn: true, profile: { role } });
      expect(render({ allowedRoles: ['admin', 'super_admin'] })).toContain('CONTENIDO');
    }
  });
  it('rol no permitido fuera del admin → /unauthorized', () => {
    setAuth({ isLoading: false, isLoggedIn: true, profile: { role: 'customer' } });
    currentPath = '/reportes';
    expect(render({ allowedRoles: ['staff'] })).toContain('data-to="/unauthorized"');
  });
});

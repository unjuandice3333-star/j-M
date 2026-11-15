// @vitest-environment jsdom
// Ejecución 161 (D139): rutas de retorno tras iniciar sesión. React Router 6 (aviso GHSA solo corregido en v7) no
// protege de `/\evil.com`, que el navegador trata como `//evil.com`. Las páginas de login solo aceptan rutas internas.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { isSafeInternalPath, safeInternalPath } from '../utils/safeRedirect.js';

describe('isSafeInternalPath', () => {
  it.each([
    '/', '/cuenta', '/checkout', '/admin/pedidos?estado=paid', '/ropa/camisetas#talla', '/buscar?q=a%5Cb',
  ])('acepta la ruta interna %s', (p) => { expect(isSafeInternalPath(p)).toBe(true); });

  it.each([
    ['vacía', ''], ['sin barra', 'cuenta'], ['absoluta', 'https://evil.com'], ['relativa al protocolo', '//evil.com'],
    ['barra invertida tras la barra', '/\\evil.com'], ['barra invertida inicial', '\\\\evil.com'],
    ['barra invertida en medio', '/admin\\..\\\\evil.com'], ['tabulador', '/\t/evil.com'], ['salto de línea', '/\n/evil.com'],
    ['javascript:', 'javascript:alert(1)'], ['no es texto', { pathname: '/x' }], ['nula', null], ['muy larga', `/${'a'.repeat(2048)}`],
  ])('rechaza %s', (_n, p) => { expect(isSafeInternalPath(p)).toBe(false); });

  it('safeInternalPath usa el respaldo y acepta un location de React Router', () => {
    expect(safeInternalPath('/\\evil.com', '/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeInternalPath(undefined, '/admin/dashboard')).toBe('/admin/dashboard');
    expect(safeInternalPath({ pathname: '/admin/pedidos', search: '?p=2', hash: '' }, null)).toBe('/admin/pedidos?p=2');
    expect(safeInternalPath({ pathname: '//evil.com' }, null)).toBeNull();
  });
});

// Render real de /admin/login con un administrador ya autenticado: debe ir a `from` solo si es interna.
let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host; let root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}</output>; };

beforeEach(() => {
  vi.resetModules();
  const q = { select: () => q, eq: () => q, single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }) };
  supa = {
    from: () => q, rpc: async () => ({ data: null, error: null }),
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
  };
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const renderAdminLogin = async (fromPathname) => {
  const { AdminLogin } = await import('../pages/admin/AdminLogin');
  const { useAuthStore } = await import('../store/authStore.js');
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, user: { id: 'u1' }, profile: { role: 'admin' } });
  const entry = { pathname: '/admin/login', state: { from: { pathname: fromPathname } } };
  await act(async () => root.render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  ));
  await flush();
  return host.querySelector('[data-testid="where"]')?.textContent;
};

describe('/admin/login con sesión de administrador', () => {
  it('vuelve a la ruta interna de origen', async () => {
    expect(await renderAdminLogin('/admin/pedidos')).toBe('/admin/pedidos');
  });
  it.each(['/\\evil.com', '//evil.com', '/\t/evil.com'])('ignora el origen %j y va al panel', async (from) => {
    expect(await renderAdminLogin(from)).toBe('/admin/dashboard');
  });
});

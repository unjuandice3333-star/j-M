// @vitest-environment jsdom
// Ejecución 157 (D135): «Reintentar» del aviso de catálogo no disponible (PublicLayout) se deshabilita mientras carga
// y el aviso se desmonta mientras carga (el store limpia el error) y no vuelve si la carga funciona; en Chromium el foco caía en <body>. Chromium quita el foco a un botón
// deshabilitado; jsdom no, así que se simula con blur() (igual que D130–D134). Se sustituyen la cabecera, el pie y
// los modales (irrelevantes aquí) y el store de catálogo por uno mínimo con la misma forma.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { create } from 'zustand';

const Null = () => null;
vi.mock('../components/Header/Header', () => ({ default: Null }));
vi.mock('../components/Footer/Footer', () => ({ default: Null }));
vi.mock('../components/Modals/FitGuideModal', () => ({ default: Null }));
vi.mock('../components/Modals/SizeGuideModal', () => ({ default: Null }));
vi.mock('../components/Modals/SizeRecommenderModal', () => ({ default: Null }));
vi.mock('../components/Common/WhatsAppButton', () => ({ default: Null }));
vi.mock('../components/Navigation/MobileBottomBar', () => ({ default: Null }));
vi.mock('react-router-dom', () => ({
  Outlet: () => React.createElement('p', null, 'página'),
  useLocation: () => ({ pathname: '/', hash: '' }),
  Link: ({ children }) => children,
}));
vi.mock('../store/authStore', () => ({ useAuthStore: (sel) => sel({ user: null, isLoading: false }) }));

let outcomes;
let release;
const store = create((set, get) => ({
  isLoadingProducts: false,
  productsError: 'No pudimos cargar el catálogo.',
  loadSiteContent: () => {},
  syncWishlist: () => {},
  syncSession: () => {},
  loadProducts: async (force = false) => {
    if (!force || get().isLoadingProducts) return;
    set({ isLoadingProducts: true, productsError: null });
    await new Promise((r) => { release = r; });
    const ok = outcomes.shift();
    set({ isLoadingProducts: false, productsError: ok ? null : 'No pudimos cargar el catálogo.' });
  },
}));
vi.mock('../store/eCommerceStore', () => ({ useECommerceStore: (sel) => (sel ? store(sel) : store()) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host; let root;
beforeEach(async () => {
  store.setState({ isLoadingProducts: false, productsError: 'No pudimos cargar el catálogo.' });
  document.body.innerHTML = '';
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  const { PublicLayout } = await import('../layouts/PublicLayout');
  await act(async () => { root.render(React.createElement(PublicLayout)); });
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const retryButton = () => [...host.querySelectorAll('button')].find((b) => /Reintent/.test(b.textContent));
const pressRetry = async () => {
  const btn = retryButton();
  btn.focus();
  await act(async () => { btn.click(); btn.blur(); });
  // Como el store real: al reintentar se limpia el error, el aviso (y su botón) se desmonta mientras carga.
  expect(retryButton()).toBeUndefined();
  expect(document.activeElement === document.body || !document.activeElement.isConnected).toBe(true);
};
const finish = async () => { await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); }); };

describe('PublicLayout: foco al reintentar la carga del catálogo (D135)', () => {
  it('si vuelve a fallar, el foco regresa a «Reintentar»', async () => {
    outcomes = [false];
    await pressRetry();
    await finish();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(retryButton());
    expect(retryButton().disabled).toBe(false);
  });

  it('si funciona, el aviso desaparece y el foco va al contenido principal', async () => {
    outcomes = [true];
    await pressRetry();
    await finish();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('contenido'));
  });

  it('no arrastra el foco si el cliente ya se movió a otro control', async () => {
    outcomes = [false];
    const other = document.createElement('input'); document.body.appendChild(other);
    await pressRetry();
    other.focus();
    await finish();
    expect(document.activeElement).toBe(other);
  });
});

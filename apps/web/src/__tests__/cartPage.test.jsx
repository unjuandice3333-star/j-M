// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, CartPage, host, root;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  // La cotización y el catálogo vienen de la BD; aquí se aísla la UI.
  useECommerceStore.setState({ loadProducts: async () => {}, refreshQuote: async () => {} });
  ({ CartPage } = await import('../pages/CartPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const mount = () => act(() => root.render(<CartPage />));

describe('CartPage (UI)', () => {
  it('carrito vacío: muestra el estado vacío y el enlace a la colección', () => {
    mount();
    expect(host.textContent).toMatch(/carrito está actualmente vacío/i);
    expect(host.querySelector('a[href="/ropa"]')).not.toBeNull();
    expect(host.textContent).toMatch(/CARRITO DE COMPRAS \(0\)/);
  });

  it('con artículos: muestra nombre y total de unidades', () => {
    useECommerceStore.getState().addItem(makeProduct(), 'M', 'Negro', 2);
    mount();
    expect(host.textContent).toMatch(/CARRITO DE COMPRAS \(2\)/);
    expect(host.querySelector('img')).not.toBeNull();
    expect(host.textContent).not.toMatch(/actualmente vacío/i);
  });

  it('aumentar y disminuir cantidad actualiza el carrito', () => {
    const p = makeProduct();
    useECommerceStore.getState().addItem(p, 'M', 'Negro', 1);
    mount();
    const plus = host.querySelector('button[aria-label^="Aumentar cantidad"]');
    act(() => plus.click());
    expect(useECommerceStore.getState().items[0].quantity).toBe(2);
    const minus = host.querySelector('button[aria-label^="Disminuir cantidad"]');
    act(() => minus.click());
    expect(useECommerceStore.getState().items[0].quantity).toBe(1);
  });

  it('el aviso del carrito es visible y se puede descartar', () => {
    useECommerceStore.setState({ cartNotice: 'Ajustamos tu carrito por stock.' });
    mount();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Ajustamos tu carrito/);
    act(() => [...host.querySelectorAll('button')].find((b) => /Entendido/.test(b.textContent)).click());
    expect(useECommerceStore.getState().cartNotice).toBeFalsy();
  });
});

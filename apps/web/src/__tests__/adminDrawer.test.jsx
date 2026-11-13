// @vitest-environment jsdom
// Ejecución 101 (pendiente 0(ba)): cajón del menú del admin en pantallas estrechas. Cerrado es `inert` (Tab no recorre
// enlaces invisibles); abierto es un diálogo modal (foco dentro, Tab atrapado, Escape cierra, foco de vuelta a ☰).
// En escritorio la barra lateral nunca es inert ni diálogo. Solo se simulan Supabase y matchMedia.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

function fakeSupabase() {
  const q = { select: () => q, eq: () => q, then: (res, rej) => Promise.resolve({ data: null, count: 0, error: null }).then(res, rej) };
  return { from: vi.fn(() => q), rpc: vi.fn(async () => ({ data: null, error: null })), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}
let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let narrow; let listeners;
const setNarrow = (v) => { narrow = v; listeners.forEach((l) => l()); };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const key = (k, shiftKey = false) => act(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })); });

describe('cajón del menú del admin', () => {
  let container; let root;
  beforeEach(() => {
    supa = fakeSupabase(); narrow = true; listeners = new Set();
    window.matchMedia = vi.fn((query) => ({
      get matches() { return query === '(max-width: 900px)' ? narrow : false; },
      media: query, addEventListener: (_e, l) => listeners.add(l), removeEventListener: (_e, l) => listeners.delete(l),
    }));
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete window.matchMedia; });

  const render = async () => {
    const { AdminLayout } = await import('../layouts/AdminLayout');
    await act(async () => { root.render(<MemoryRouter initialEntries={['/admin/dashboard']}><AdminLayout /></MemoryRouter>); });
    await flush();
  };
  const aside = () => container.querySelector('aside');
  const menuBtn = () => container.querySelector('button[aria-label="Abrir menú"]');
  const dialog = () => container.querySelector('[role="dialog"][aria-label="Menú de administración"]');

  it('cerrado en móvil: la barra lateral es inert y aria-hidden', async () => {
    await render();
    expect(aside().hasAttribute('inert')).toBe(true);
    expect(aside().getAttribute('aria-hidden')).toBe('true');
    expect(dialog()).toBeNull();
  });

  it('abierto: diálogo con el foco dentro, Tab atrapado, Escape cierra y el foco vuelve a ☰', async () => {
    await render();
    menuBtn().focus();
    await act(async () => { menuBtn().click(); });
    expect(aside().hasAttribute('inert')).toBe(false);
    expect(aside().hasAttribute('aria-hidden')).toBe(false);
    expect(dialog()).not.toBeNull();
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement.getAttribute('aria-label')).toBe('Cerrar menú');
    // Mayús+Tab desde el primero va al último (Cerrar sesión) y Tab desde el último vuelve al primero
    await key('Tab', true);
    expect(document.activeElement.textContent).toMatch(/Cerrar Sesión/);
    await key('Tab');
    expect(document.activeElement.getAttribute('aria-label')).toBe('Cerrar menú');
    await key('Escape');
    expect(dialog()).toBeNull();
    expect(aside().hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(menuBtn());
  });

  it('el botón «Cerrar menú» y un enlace del menú también lo cierran', async () => {
    await render();
    await act(async () => { menuBtn().click(); });
    await act(async () => { dialog().querySelector('button[aria-label="Cerrar menú"]').click(); });
    expect(dialog()).toBeNull();
    await act(async () => { menuBtn().click(); });
    const current = [...dialog().querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin/dashboard');
    expect(current.getAttribute('aria-current')).toBe('page');
    await act(async () => { current.click(); }); // misma ruta: antes no se cerraba
    expect(dialog()).toBeNull();
  });

  it('escritorio: nunca inert ni diálogo; si la ventana se ensancha con el cajón abierto, se cierra', async () => {
    narrow = false;
    await render();
    expect(aside().hasAttribute('inert')).toBe(false);
    expect(aside().hasAttribute('aria-hidden')).toBe(false);
    expect(dialog()).toBeNull();
    await act(async () => { setNarrow(true); });
    expect(aside().hasAttribute('inert')).toBe(true);
    await act(async () => { menuBtn().click(); });
    expect(dialog()).not.toBeNull();
    await act(async () => { setNarrow(false); });
    expect(dialog()).toBeNull();
    expect(aside().hasAttribute('inert')).toBe(false);
    expect(menuBtn().getAttribute('aria-expanded')).toBe('false');
  });
});

// @vitest-environment jsdom
// Ejecución 150 (D128): en la tienda, quitar una línea del carrito (página o panel lateral), cambiar su talla (la línea
// cambia de id y se remonta) o quitar un favorito dejaba el foco en <body>.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => {
  const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
  const client = { from: () => q, rpc: () => q, storage: { from: () => q }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});

import productService from '../services/productService';
import { __resetStorefrontTaxonomyCache } from '../hooks/useStorefrontTaxonomy';
import { useECommerceStore } from '../store/eCommerceStore';
import { CartPage } from '../pages/CartPage';
import { WishlistPage } from '../pages/WishlistPage';
import { Header } from '../components/Header/Header';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const variant = (pid, size, color, available) => ({ id: `${pid}-${size}-${color}`, sku: `${pid}-${size}-${color}`, size, color, colorId: color, available, price: 100000 });
const product = (id, name) => ({
  id, slug: id, name, category: 'polos', categoryName: 'Polos', sizeGroup: 'alpha', fit: 'SLIM', price: 100000, images: [], imagesByColor: {},
  color: 'Negro', colors: [{ name: 'Negro', hex: '#000' }], sizes: ['M', 'L'], rawVariants: [variant(id, 'M', 'Negro', 5), variant(id, 'L', 'Negro', 5)],
  inStock: true, stock: 10, details: [], description: '',
});
const P1 = product('p1', 'Polo Uno');
const P2 = product('p2', 'Polo Dos');
const line = (p, size = 'M') => ({ id: `${p.id}-${size}-Negro`, productId: p.id, variantId: `${p.id}-${size}-Negro`, slug: p.id, name: p.name, size, color: 'Negro', price: 100000, quantity: 1, available: 5, image: '/x.jpg' });

let host; let root;
beforeEach(() => {
  __resetStorefrontTaxonomyCache();
  vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(null);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  useECommerceStore.setState({
    products: [P1, P2], productsLoaded: true, items: [line(P1), line(P2)], quote: null, appliedCoupon: null, cartNotice: null,
    wishlist: [], wishlistOwner: null, wishlistError: null, isMobileMenuOpen: false, isCartOpen: false, siteContent: {}, siteContentError: null,
    loadSiteContent: async () => {}, loadProducts: async () => {}, refreshQuote: async () => {},
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const flush = async () => { for (let i = 0; i < 3; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const press = async (el) => { el.focus(); await act(async () => { el.click(); }); await flush(); };
const row = (scope, key) => scope.querySelector(`[data-row-key="${key}"]`);

describe('/carrito', () => {
  const render = async () => { await act(async () => { root.render(<MemoryRouter><CartPage /></MemoryRouter>); }); await flush(); };

  it('«Eliminar» → foco en la línea siguiente; la última → en el aviso de carrito vacío', async () => {
    await render();
    await press(row(host, line(P1).id).querySelector('[data-row-action="remove"]'));
    expect(row(host, line(P1).id)).toBeNull();
    expect(document.activeElement).toBe(row(host, line(P2).id));
    await press(row(host, line(P2).id).querySelector('[data-row-action="remove"]'));
    expect(document.activeElement.textContent).toMatch(/carrito está actualmente vacío/i);
  });

  it('«Guardar para después» → foco en la línea que ocupó su lugar', async () => {
    await render();
    await press(row(host, line(P2).id).querySelector('[data-row-action="save"]'));
    expect(useECommerceStore.getState().wishlist).toContain('p2');
    expect(document.activeElement).toBe(row(host, line(P1).id));
  });

  it('cambiar la talla remonta la línea con otro id → el foco sigue en su selector de talla', async () => {
    await render();
    const sel = row(host, line(P1).id).querySelector('select[data-row-action="size"]');
    sel.focus();
    await act(async () => { sel.value = 'L'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(row(host, line(P1).id)).toBeNull();
    expect(document.activeElement).toBe(row(host, line(P1, 'L').id).querySelector('select[data-row-action="size"]'));
  });
});

describe('carrito lateral', () => {
  it('eliminar → foco en la línea siguiente y luego en «Tu carrito está vacío»', async () => {
    useECommerceStore.setState({ isCartOpen: true });
    await act(async () => { root.render(<MemoryRouter><Header /></MemoryRouter>); });
    await flush();
    const dlg = () => document.querySelector('[role="dialog"]');
    await press(row(dlg(), line(P1).id).querySelector('[data-row-action="remove"]'));
    expect(document.activeElement).toBe(row(dlg(), line(P2).id));
    await press(row(dlg(), line(P2).id).querySelector('[data-row-action="remove"]'));
    expect(document.activeElement.textContent).toBe('Tu carrito está vacío');
  });
});

describe('/cuenta/favoritos', () => {
  it('quitar un favorito → foco en la tarjeta siguiente (no en su corazón); el último → aviso de lista vacía', async () => {
    useECommerceStore.setState({ wishlist: ['p1', 'p2'] });
    await act(async () => { root.render(<MemoryRouter><WishlistPage /></MemoryRouter>); });
    await flush();
    const heart = (name) => host.querySelector(`button[aria-label="Quitar de favoritos: ${name}"]`);
    await press(heart('Polo Uno'));
    expect(row(host, 'p1')).toBeNull();
    expect(document.activeElement).toBe(row(host, 'p2'));
    await press(heart('Polo Dos'));
    expect(document.activeElement.textContent).toMatch(/No tienes productos guardados/);
  });
});

// Ejecución 151 (D129): «Quitar cupón» desaparece al pulsarlo → el foco pasa al campo del código.
describe('/carrito: quitar el cupón', () => {
  it('el foco va al campo «Código del cupón» que ocupa su lugar', async () => {
    useECommerceStore.setState({ appliedCoupon: { code: 'BIENVENIDA', freeShipping: false } });
    await act(async () => { root.render(<MemoryRouter><CartPage /></MemoryRouter>); });
    await flush();
    await press(host.querySelector('button[aria-label="Quitar cupón"]'));
    expect(useECommerceStore.getState().appliedCoupon).toBeNull();
    expect(host.querySelector('button[aria-label="Quitar cupón"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('input[aria-label="Código del cupón"]'));
  });
});

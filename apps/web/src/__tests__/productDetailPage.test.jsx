// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { memoryStorage, makeSupabaseMock, makeProduct } from './helpers.js';

const supa = makeSupabaseMock();
const navigate = vi.fn();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children }) => React.createElement('a', { href: to }, children),
  useNavigate: () => navigate,
  useParams: () => ({ slug: globalThis.__slug ?? 'camiseta-basica' }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let useECommerceStore, ProductDetailPage, host, root;

const product = () =>
  makeProduct({
    price: 80000,
    category: 'camisetas',
    sizes: ['S', 'M', 'L'],
    colors: [{ name: 'Negro', hex: '#000' }, { name: 'Blanco', hex: '#fff' }],
    fit: 'Regular',
    inStock: true,
  });

beforeEach(async () => {
  vi.resetModules();
  navigate.mockClear();
  globalThis.__slug = 'camiseta-basica';
  vi.stubGlobal('localStorage', memoryStorage());
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  ({ useECommerceStore } = await import('../store/eCommerceStore.js'));
  await useECommerceStore.persist.rehydrate();
  useECommerceStore.setState({
    loadProducts: async () => {},
    refreshQuote: async () => {},
    products: [product()],
    productsLoaded: true,
    isLoadingProducts: false,
    productsError: null,
  });
  ({ ProductDetailPage } = await import('../pages/ProductDetailPage.jsx'));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

const mount = async () => {
  await act(async () => root.render(<ProductDetailPage />));
};
const btn = (label) => host.querySelector(`button[aria-label="${label}"]`);
const addBtn = () => [...host.querySelectorAll('button')].find((b) => /AGREGAR AL CARRITO/.test(b.textContent));

describe('ProductDetailPage (UI)', () => {
  it('slug inexistente: no muestra otro producto', async () => {
    globalThis.__slug = 'no-existe';
    await mount();
    expect(host.textContent).toMatch(/no existe o ya no está disponible/i);
    expect(host.querySelector('h1').textContent).not.toMatch(/Camiseta Básica/);
  });

  it('muestra nombre y marca la talla agotada como deshabilitada', async () => {
    await mount();
    expect(host.querySelector('h1').textContent).toBe('Camiseta Básica');
    // Color Negro: S no existe como variante → agotada; M y L disponibles.
    expect(btn('Talla S agotada').disabled).toBe(true);
    expect(btn('Talla M').disabled).toBe(false);
  });

  it('agregar sin elegir talla no toca el carrito', async () => {
    await mount();
    await act(async () => addBtn().click());
    expect(useECommerceStore.getState().items).toHaveLength(0);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('con talla elegida agrega la variante al carrito', async () => {
    await mount();
    await act(async () => btn('Talla M').click());
    await act(async () => addBtn().click());
    const items = useECommerceStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
    expect(items[0].size ?? items[0].selectedSize).toBe('M');
  });

  it('la cantidad no supera el stock disponible de la variante', async () => {
    await mount();
    await act(async () => btn('Talla L').click()); // stock 1
    expect(btn('Aumentar cantidad').disabled).toBe(true);
  });

  it('comprar ahora agrega y navega al checkout', async () => {
    await mount();
    await act(async () => btn('Talla M').click());
    const buy = [...host.querySelectorAll('button')].find((b) => /COMPRAR/i.test(b.textContent) && !/AGREGAR/.test(b.textContent));
    await act(async () => buy.click());
    expect(navigate).toHaveBeenCalledWith('/checkout');
    expect(useECommerceStore.getState().items).toHaveLength(1);
  });
});

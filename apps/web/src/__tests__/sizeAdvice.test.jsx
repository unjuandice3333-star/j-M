// @vitest-environment jsdom
// Ayudas de talla en la ficha: recomendador ajustado a las tallas reales del producto (sin estadísticas
// inventadas), sin guía ni recomendador en talla única, y «Completa el look» con la categoría real.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const db = { collections: [] };
vi.mock('../config/supabase', () => {
  const make = (table) => {
    const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: db[table] ?? [], error: null }) : () => q) });
    return q;
  };
  const client = { from: (t) => make(t), rpc: () => make('rpc'), storage: { from: () => make('s') }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { isOneSize, sizeHelpFor, baseAlphaSize, recommendSize, explainRecommendation } from '../utils/sizeAdvice';
import { useECommerceStore } from '../store/eCommerceStore';
import { SizeRecommenderModal } from '../components/Modals/SizeRecommenderModal';
import { CompleteTheLook } from '../components/Product/CompleteTheLook';
import ProductDetailPage from '../pages/ProductDetailPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const variant = (size, color, available, id = `${size}-${color}`) => ({ id, sku: id, size, color, colorId: color, available, price: 100000 });
const product = (over = {}) => ({
  id: 'p1', slug: 'polo', name: 'Polo Piqué', category: 'polos', categoryName: 'Polos', sizeGroup: 'alpha', fit: 'SLIM',
  price: 100000, images: [], imagesByColor: {}, colors: [{ name: 'Negro', hex: '#000' }, { name: 'Blanco', hex: '#fff' }],
  sizes: ['S', 'M', 'L'], rawVariants: [variant('S', 'Negro', 2), variant('M', 'Negro', 0), variant('M', 'Blanco', 4), variant('L', 'Negro', 1)],
  inStock: true, stock: 7, details: [], description: '', ...over,
});

describe('sizeAdvice', () => {
  it('talla única por grupo o por código UNICA: sin guía ni recomendador', () => {
    expect(isOneSize({ sizeGroup: 'one_size', sizes: ['UNICA'] })).toBe(true);
    expect(isOneSize({ sizeGroup: null, sizes: ['UNICA'] })).toBe(true);
    expect(isOneSize(product())).toBe(false);
    expect(sizeHelpFor({ sizeGroup: 'one_size', sizes: ['UNICA'] })).toEqual({ guide: false, recommender: false });
  });
  it('calzado y pantalón: guía sí, recomendador por estatura/peso no', () => {
    expect(sizeHelpFor({ sizeGroup: 'footwear', sizes: ['40', '41'] })).toEqual({ guide: true, recommender: false });
    expect(sizeHelpFor({ sizeGroup: 'numeric_pants', sizes: ['30', '32'] })).toEqual({ guide: true, recommender: false });
    expect(sizeHelpFor(product())).toEqual({ guide: true, recommender: true });
    expect(sizeHelpFor({ sizeGroup: null, sizes: ['M', 'L'] })).toEqual({ guide: true, recommender: true });
  });
  it('talla de referencia', () => {
    expect(baseAlphaSize({ height: 175, weight: 74, fit: 'normal' })).toBe('M');
    expect(baseAlphaSize({ height: 180, weight: 95, fit: 'normal' })).toBe('XL');
    expect(baseAlphaSize({ height: 170, weight: 60, fit: 'fitted' })).toBe('S');
  });
  it('si la talla de referencia no se ofrece, propone la más cercana y lo dice', () => {
    const rec = recommendSize(product(), { height: 180, weight: 95, fit: 'normal' }); // XL → L
    expect(rec).toMatchObject({ size: 'L', base: 'XL', exact: false, inStock: true, availableColors: ['Negro'] });
    const text = explainRecommendation(rec, { height: 180, weight: 95, fit: 'normal' });
    expect(text).toMatch(/correspondería la XL/);
    expect(text).not.toMatch(/%/); // sin estadísticas inventadas
  });
  it('informa si la talla está agotada en todos los colores', () => {
    const p = product({ rawVariants: [variant('S', 'Negro', 0), variant('M', 'Negro', 0), variant('L', 'Negro', 1)] });
    const rec = recommendSize(p, { height: 175, weight: 74, fit: 'normal' });
    expect(rec).toMatchObject({ size: 'M', exact: true, inStock: false });
    expect(explainRecommendation(rec, { height: 175, weight: 74 })).toMatch(/agotada/);
  });
  it('sin tallas alfabéticas no hay recomendación', () => {
    expect(recommendSize({ sizes: ['40', '41'] }, { height: 175, weight: 74 })).toBeNull();
  });
});

describe('UI', () => {
  let host, root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    db.collections = [];
    act(() => useECommerceStore.setState({ activeModal: null, recommendedSize: null, products: [], productsLoaded: true }));
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent));

  it('recomendador: talla ofrecida, sin «94 %», y se reinicia al abrirlo para otro producto', () => {
    act(() => root.render(<SizeRecommenderModal />));
    act(() => useECommerceStore.getState().openSizeRecommender(product()));
    act(() => btn(/CALCULAR/).click());
    expect(host.querySelector('[data-testid="recommended-size"]').textContent).toMatch(/TALLA M/);
    expect(host.textContent).not.toMatch(/94%|94 %/);
    expect(host.textContent).toMatch(/Blanco/); // M solo hay en Blanco
    act(() => useECommerceStore.getState().closeModal());
    act(() => useECommerceStore.getState().openSizeRecommender(product({ id: 'p2' })));
    expect(btn(/CALCULAR/)).toBeTruthy();
  });

  it('«Usar talla» selecciona la talla en la ficha y cambia al color que la tiene', () => {
    const p = product();
    act(() => useECommerceStore.setState({ products: [p], productsLoaded: true }));
    act(() => root.render(
      <MemoryRouter initialEntries={['/producto/polo']}>
        <Routes><Route path="/producto/:slug" element={<><ProductDetailPage /><SizeRecommenderModal /></>} /></Routes>
      </MemoryRouter>,
    ));
    act(() => btn(/Encuentra tu talla/).click());
    act(() => btn(/CALCULAR/).click());
    act(() => btn(/USAR TALLA M/).click());
    expect(useECommerceStore.getState().activeModal).toBeNull();
    const m = host.querySelector('button[aria-label="Talla M"]');
    expect(m.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('button[aria-label="Color Blanco"]').getAttribute('aria-pressed')).toBe('true');
    expect(m.disabled).toBe(false);
  });

  it('talla única: sin «Guía de medidas» ni «Encuentra tu talla», talla preseleccionada', () => {
    const p = product({ id: 'acc', slug: 'gorra', name: 'Gorra', category: 'accesorios', categoryName: 'Accesorios', sizeGroup: 'one_size',
      sizes: ['UNICA'], colors: [{ name: 'Negro', hex: '#000' }], rawVariants: [variant('UNICA', 'Negro', 3)] });
    act(() => useECommerceStore.setState({ products: [p], productsLoaded: true }));
    act(() => root.render(
      <MemoryRouter initialEntries={['/producto/gorra']}>
        <Routes><Route path="/producto/:slug" element={<ProductDetailPage />} /></Routes>
      </MemoryRouter>,
    ));
    expect(btn(/Guía de medidas/)).toBeFalsy();
    expect(btn(/Encuentra tu talla/)).toBeFalsy();
    expect(host.textContent).toMatch(/TALLA ÚNICA/);
    expect(host.querySelector('button[aria-label="Talla UNICA"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('calzado: guía de medidas sí, recomendador no', () => {
    const p = product({ id: 'z', slug: 'tenis', category: 'calzado', categoryName: 'Calzado', sizeGroup: 'footwear', sizes: ['40', '41'],
      rawVariants: [variant('40', 'Negro', 1), variant('41', 'Negro', 1)] });
    act(() => useECommerceStore.setState({ products: [p], productsLoaded: true }));
    act(() => root.render(
      <MemoryRouter initialEntries={['/producto/tenis']}>
        <Routes><Route path="/producto/:slug" element={<ProductDetailPage />} /></Routes>
      </MemoryRouter>,
    ));
    expect(btn(/Guía de medidas/)).toBeTruthy();
    expect(btn(/Encuentra tu talla/)).toBeFalsy();
    act(() => btn(/Guía de medidas/).click());
    expect(useECommerceStore.getState()).toMatchObject({ activeModal: 'sizeGuide', selectedModalCategory: 'calzado', selectedModalSizeGroup: 'footwear' });
  });

  it('«Completa el look» rotula cada producto con su categoría real', async () => {
    const jean = product({ id: 'j', name: 'Jean Slim', category: 'jeans', categoryName: 'Jeans' });
    const shoe = product({ id: 's', name: 'Tenis', category: 'calzado', categoryName: 'Calzado' });
    db.collections = [{ slug: 'look', name: 'Look urbano', subtitle: 'x', image_url: null,
      collection_products: [{ product_id: 'j', position: 1 }, { product_id: 's', position: 2 }] }];
    act(() => useECommerceStore.setState({ products: [jean, shoe] }));
    await act(async () => { root.render(<CompleteTheLook />); });
    const text = host.textContent;
    expect(text).toMatch(/01JEANS/);
    expect(text).toMatch(/02CALZADO/);
    expect(text).not.toMatch(/CAMISETA/);
  });
});

// @vitest-environment jsdom
// Herramientas de talla según el grupo de tallas, recomendador sin cifras inventadas y «Completa el look».
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const db = vi.hoisted(() => ({ collections: [] }));
vi.mock('../config/supabase', () => {
  const make = (table) => {
    const q = new Proxy({}, {
      get: (t, k) => (k === 'then'
        ? (res) => res({ data: table === 'collections' ? db.collections : [], error: null, count: 0 })
        : () => q),
    });
    return q;
  };
  const client = {
    from: (t) => make(t), rpc: () => make('rpc'), storage: { from: () => make('storage') },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { sizeToolsFor, recommendAlphaSize, recommendedSizeAvailability, sizeChartTabFor } from '../data/sizeGuide';
import { useECommerceStore } from '../store/eCommerceStore';
import { SizeRecommenderModal } from '../components/Modals/SizeRecommenderModal';
import { SizeGuideModal } from '../components/Modals/SizeGuideModal';
import CompleteTheLook from '../components/Product/CompleteTheLook';
import ProductDetailPage from '../pages/ProductDetailPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const variant = (size, available, color = 'Negro') => ({ id: `${size}-${color}`, size, color, available, sizeOrder: 0, price: 100000 });
const product = (over = {}) => ({
  id: 'p1', slug: 'camiseta-basica', name: 'Camiseta básica', category: 'camisetas', categoryName: 'Camisetas',
  sizeGroup: 'alpha', price: 100000, images: [], fit: 'REGULAR', colors: [{ name: 'Negro', hex: '#000' }],
  sizes: ['S', 'M', 'L'], rawVariants: [variant('S', 2), variant('M', 0), variant('L', 5)], occasions: [], ...over,
});

describe('sizeToolsFor', () => {
  it('talla única no ofrece guía ni recomendador', () => {
    expect(sizeToolsFor('one_size')).toEqual({ guide: false, recommender: false });
  });
  it('pantalón y calzado: solo guía (el recomendador calcula tallas alfa)', () => {
    expect(sizeToolsFor('numeric_pants')).toEqual({ guide: true, recommender: false });
    expect(sizeToolsFor('footwear')).toEqual({ guide: true, recommender: false });
  });
  it('alfa o desconocido: ambas', () => {
    expect(sizeToolsFor('alpha')).toEqual({ guide: true, recommender: true });
    expect(sizeToolsFor(null)).toEqual({ guide: true, recommender: true });
  });
  it('la guía usa el grupo de tallas cuando el slug de la categoría no se reconoce', () => {
    expect(sizeChartTabFor('botas', 'footwear')).toBe('calzado');
    expect(sizeChartTabFor('joggers', 'numeric_pants')).toBe('jeans');
  });
});

describe('recommendAlphaSize', () => {
  it('conserva la regla anterior', () => {
    expect(recommendAlphaSize({ height: 175, weight: 74, fit: 'normal' })).toBe('M');
    expect(recommendAlphaSize({ height: 175, weight: 74, fit: 'fitted' })).toBe('S');
    expect(recommendAlphaSize({ height: 175, weight: 74, fit: 'loose' })).toBe('L');
    expect(recommendAlphaSize({ height: 170, weight: 60 })).toBe('S');
    expect(recommendAlphaSize({ height: 185, weight: 66, fit: 'loose' })).toBe('M');
    expect(recommendAlphaSize({ height: 180, weight: 85 })).toBe('L');
    expect(recommendAlphaSize({ height: 180, weight: 85, fit: 'loose' })).toBe('XL');
    expect(recommendAlphaSize({ height: 190, weight: 100 })).toBe('XL');
    expect(recommendAlphaSize({ height: 190, weight: 100, fit: 'fitted' })).toBe('L');
  });
  it('entradas no numéricas → null', () => {
    expect(recommendAlphaSize({ height: 'x', weight: 70 })).toBeNull();
  });
});

describe('recommendedSizeAvailability', () => {
  it('distingue disponible, agotada y no fabricada, con la alternativa más cercana', () => {
    const p = product();
    expect(recommendedSizeAvailability(p, 'L')).toEqual({ offered: true, inStock: true, alternative: null });
    expect(recommendedSizeAvailability(p, 'M')).toEqual({ offered: true, inStock: false, alternative: 'L' });
    expect(recommendedSizeAvailability(p, 'XL')).toEqual({ offered: false, inStock: false, alternative: 'L' });
    expect(recommendedSizeAvailability(product({ rawVariants: [] }), 'M').alternative).toBeNull();
  });
});

let host; let root;
const mount = (el) => act(() => root.render(el));
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => useECommerceStore.getState().closeModal());
});
afterEach(() => { act(() => root.unmount()); host.remove(); db.collections = []; });

const submit = () => act(() => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

describe('SizeRecommenderModal', () => {
  it('no muestra estadísticas inventadas y avisa si la talla recomendada está agotada', () => {
    mount(<SizeRecommenderModal />);
    act(() => useECommerceStore.getState().openSizeRecommender(product()));
    submit();
    expect(host.textContent).toMatch(/TALLA M/);
    expect(host.textContent).not.toMatch(/%/);
    expect(host.querySelector('[data-testid="size-availability"]').textContent)
      .toBe('La talla M está agotada; la talla disponible más cercana es L.');
  });
  it('no arrastra el resultado de otro producto al reabrir', () => {
    mount(<SizeRecommenderModal />);
    act(() => useECommerceStore.getState().openSizeRecommender(product()));
    submit();
    act(() => useECommerceStore.getState().closeModal());
    act(() => useECommerceStore.getState().openSizeRecommender(product({ id: 'p2', rawVariants: [variant('M', 3)] })));
    expect(host.querySelector('[data-testid="size-availability"]')).toBeNull();
    submit();
    expect(host.querySelector('[data-testid="size-availability"]').textContent).toBe('La talla M está disponible en esta prenda.');
  });
});

describe('SizeGuideModal con grupo de tallas', () => {
  it('categoría nueva de calzado abre la tabla de calzado', () => {
    mount(<SizeGuideModal />);
    act(() => useECommerceStore.getState().openSizeGuide('botas', 'footwear'));
    expect(host.querySelector('[data-testid="size-guide-modal"]').getAttribute('data-active-tab')).toBe('calzado');
  });
});

describe('ProductDetailPage: botones de talla según el grupo', () => {
  const renderPdp = (p) => {
    act(() => useECommerceStore.setState({ products: [p] }));
    mount(<MemoryRouter initialEntries={[`/producto/${p.slug}`]}><Routes><Route path="/producto/:slug" element={<ProductDetailPage />} /></Routes></MemoryRouter>);
  };
  const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent.trim());
  it('alfa: guía y recomendador', () => {
    renderPdp(product());
    expect(buttons()).toEqual(expect.arrayContaining(['Encuentra tu talla', 'Guía de medidas']));
  });
  it('calzado: solo guía, y abre la tabla de calzado', () => {
    renderPdp(product({ slug: 'tenis', category: 'botas', sizeGroup: 'footwear', sizes: ['40'], rawVariants: [variant('40', 1)] }));
    expect(buttons()).not.toContain('Encuentra tu talla');
    const guide = [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Guía de medidas');
    act(() => guide.click());
    expect(useECommerceStore.getState()).toMatchObject({ activeModal: 'sizeGuide', selectedModalCategory: 'botas', selectedModalSizeGroup: 'footwear' });
  });
  it('talla única: ninguno de los dos', () => {
    renderPdp(product({ slug: 'gorra', category: 'accesorios', sizeGroup: 'one_size', sizes: ['UNICA'], rawVariants: [variant('UNICA', 4)] }));
    expect(buttons()).not.toContain('Encuentra tu talla');
    expect(buttons()).not.toContain('Guía de medidas');
  });
});

describe('CompleteTheLook', () => {
  it('etiqueta cada prenda con su categoría real, no por su posición', async () => {
    const shoe = product({ id: 'z', name: 'Tenis', category: 'calzado', categoryName: 'Calzado' });
    const shirt = product({ id: 'c', name: 'Camisa', category: 'camisas', categoryName: 'Camisas' });
    act(() => useECommerceStore.setState({ products: [shoe, shirt] }));
    db.collections = [{ slug: 'look-1', name: 'Look urbano', subtitle: 's', image_url: null,
      collection_products: [{ product_id: 'z', position: 1 }, { product_id: 'c', position: 2 }] }];
    mount(<CompleteTheLook />);
    await act(async () => { await Promise.resolve(); });
    const text = host.textContent;
    expect(text).toMatch(/Look urbano/);
    expect(text).toMatch(/CALZADO/);
    expect(text).toMatch(/CAMISAS/);
    expect(text).not.toMatch(/CAMISETA|JEAN/);
  });
});

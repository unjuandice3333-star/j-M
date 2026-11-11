// @vitest-environment jsdom
// Filtros del catálogo: derivados de los productos reales (precio, tallas, fits, ocasiones) y búsqueda sin tildes.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));

import {
  normalizeText, matchesSearch, priceCeiling, sizeOptions, fitOptions, occasionOptions, filterProducts, sortProducts,
} from '../utils/catalogFilters';
import { normalizeProduct } from '../services/productService';
import { useECommerceStore } from '../store/eCommerceStore';
import CatalogPage from '../pages/CatalogPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const prod = (over = {}) => ({
  id: over.id ?? over.name, slug: over.id ?? over.name, name: 'Camisa', status: 'active', price: 100000,
  category: 'camisas', categoryName: 'Camisas', brand: 'J&M', styleLine: 'elegante', styleLineName: 'Elegante',
  reference: 'REF-1', fit: 'REGULAR', sizes: ['M'], rawVariants: [{ id: `${over.id ?? over.name}-v`, size: 'M', sizeOrder: 2, available: 3 }],
  colors: [{ name: 'Blanco' }], color: 'Blanco', occasions: [], occasionList: [], images: [], imagesByColor: {},
  isNew: false, isBestSeller: false, isSale: false, discountPercent: 0, rating: null, reviewCount: 0, stock: 3,
  ...over,
});

describe('utilidades de filtros', () => {
  it('normalizeText quita tildes, mayúsculas y espacios', () => {
    expect(normalizeText('  Pantalón   CHINO ')).toBe('pantalon chino');
    expect(normalizeText(null)).toBe('');
  });

  it('búsqueda sin tildes, por varias palabras y por categoría, color, marca o referencia', () => {
    const p = prod({ name: 'Pantalón Chino', categoryName: 'Pantalones', category: 'pantalones', colors: [{ name: 'Azul Marino' }], reference: 'JM-PCH-01' });
    expect(matchesSearch(p, 'pantalon')).toBe(true);
    expect(matchesSearch(p, 'PANTALÓN')).toBe(true);
    expect(matchesSearch(p, 'chino azul')).toBe(true);
    expect(matchesSearch(p, 'marino')).toBe(true);
    expect(matchesSearch(p, 'jm-pch')).toBe(true);
    expect(matchesSearch(p, 'j&m')).toBe(true);
    expect(matchesSearch(p, 'chino rojo')).toBe(false);
    expect(matchesSearch(p, '   ')).toBe(true);
  });

  it('el tope de precio sale del producto más caro (antes 400.000 fijo)', () => {
    expect(priceCeiling([prod({ price: 455000 }), prod({ price: 90000 })])).toBe(460000);
    expect(priceCeiling([prod({ price: 400000 })])).toBe(400000);
    expect(priceCeiling([])).toBe(10000);
  });

  it('tallas en el orden de la BD y solo las existentes', () => {
    const a = prod({ id: 'a', sizes: ['L', 'S'], rawVariants: [{ size: 'L', sizeOrder: 3 }, { size: 'S', sizeOrder: 1 }] });
    const b = prod({ id: 'b', sizes: ['XS', '32'], rawVariants: [{ size: 'XS', sizeOrder: 0 }, { size: '32', sizeOrder: 20 }] });
    expect(sizeOptions([a, b])).toEqual(['XS', 'S', 'L', '32']);
  });

  it('fits y ocasiones presentes en los productos (nombre de la BD)', () => {
    const list = [
      prod({ id: 'a', fit: 'OVERSIZE', occasionList: [{ slug: 'oficina', name: 'Oficina' }] }),
      prod({ id: 'b', fit: 'SLIM', occasionList: [{ slug: 'boda', name: 'Bodas y eventos' }, { slug: 'oficina', name: 'Oficina' }] }),
    ];
    expect(fitOptions(list)).toEqual(['SLIM', 'OVERSIZE']);
    expect(occasionOptions(list)).toEqual([{ slug: 'boda', name: 'Bodas y eventos' }, { slug: 'oficina', name: 'Oficina' }]);
  });

  it('filterProducts: maxPrice null no limita; excluye no activos', () => {
    const list = [prod({ id: 'a', price: 650000 }), prod({ id: 'b', price: 80000 }), prod({ id: 'c', status: 'draft' })];
    expect(filterProducts(list, { maxPrice: null }).map((p) => p.id)).toEqual(['a', 'b']);
    expect(filterProducts(list, { maxPrice: 100000 }).map((p) => p.id)).toEqual(['b']);
  });

  it('sortProducts no muta y mantiene el orden en empates', () => {
    const list = [prod({ id: 'a', price: 3 }), prod({ id: 'b', price: 1 }), prod({ id: 'c', price: 1 })];
    expect(sortProducts(list, 'precio-asc').map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(sortProducts(list, 'relevancia')).toBe(list);
  });

  it('normalizeProduct conserva el nombre de cada ocasión', () => {
    const p = normalizeProduct({
      id: 'x', name: 'X', base_price: 1000, product_occasions: [{ occasions: { slug: 'oficina', name: 'Oficina' } }, { occasions: null }],
    });
    expect(p.occasions).toEqual(['oficina']);
    expect(p.occasionList).toEqual([{ slug: 'oficina', name: 'Oficina' }]);
  });
});

describe('CatalogPage', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useECommerceStore.setState({
      productsLoaded: true, isLoadingProducts: false, productsError: null, loadProducts: async () => {},
      products: [
        prod({ id: 'abrigo', name: 'Abrigo Lana Premium', price: 620000, categoryName: 'Chaquetas', category: 'chaquetas', fit: 'RELAXED',
          sizes: ['XL'], rawVariants: [{ id: 'abrigo-v', size: 'XL', sizeOrder: 4, available: 2 }],
          occasions: ['oficina'], occasionList: [{ slug: 'oficina', name: 'Oficina' }] }),
        prod({ id: 'pantalon', name: 'Pantalón Chino', price: 150000, categoryName: 'Pantalones', category: 'pantalones',
          sizes: ['32'], rawVariants: [{ id: 'pantalon-v', size: '32', sizeOrder: 20, available: 2 }] }),
      ],
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useECommerceStore.setState({ products: [] });
  });

  const render = (path = '/ropa') => act(() => root.render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/ropa" element={<CatalogPage />} /></Routes>
    </MemoryRouter>,
  ));
  const text = () => container.textContent;
  const buttons = (label) => [...container.querySelectorAll('aside button')].filter((b) => b.textContent.trim() === label);

  it('muestra productos de más de $400.000 sin filtro de precio y el tope es el real', () => {
    render();
    expect(text()).toContain('Abrigo Lana Premium');
    expect(text()).toContain('Pantalón Chino');
    expect(container.querySelector('[data-testid="catalog-max-price"]').textContent).toBe('Sin límite');
    expect(container.querySelector('input[aria-label="Precio máximo"]').max).toBe('620000');
  });

  it('búsqueda sin tilde encuentra «Pantalón»', () => {
    render('/ropa?q=pantalon');
    expect(text()).toContain('Pantalón Chino');
    expect(text()).not.toContain('Abrigo Lana Premium');
  });

  it('tallas, fits y ocasiones vienen de los productos (no de listas fijas ni mockData)', () => {
    render();
    expect(buttons('XL')).toHaveLength(1);
    expect(buttons('32')).toHaveLength(1);
    expect(buttons('XXL')).toHaveLength(0);
    expect(buttons('RELAXED')).toHaveLength(1);
    expect(buttons('SLIM')).toHaveLength(0);
    expect(buttons('Oficina')).toHaveLength(1);
    expect(buttons('TRABAJO & OFICINA')).toHaveLength(0);
    act(() => buttons('Oficina')[0].click());
    expect(text()).toContain('Abrigo Lana Premium');
    expect(text()).not.toContain('Pantalón Chino');
  });

  it('el panel móvil incluye todos los filtros, no solo la categoría', () => {
    render();
    const open = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('FILTRAR'));
    act(() => open.click());
    const drawer = container.querySelector('.modal-overlay');
    expect(drawer.textContent).toContain('TALLA');
    expect(drawer.textContent).toContain('OCASIÓN');
    expect(drawer.textContent).toContain('PRECIO MÁXIMO');
    expect(drawer.textContent).toContain('Limpiar filtros');
  });
});

// @vitest-environment jsdom
// Portada: líneas, categorías y ocasiones desde la BD (antes mockData con conteos inventados) y claves de imagen
// editorial alineadas con la página del admin.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// Consulta encadenable vacía para los componentes que leen Supabase directamente (p. ej. CompleteTheLook).
vi.mock('../config/supabase', () => {
  const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
  const client = { from: () => q };
  return { default: client, supabase: client };
});

import { buildHomeTaxonomy, FALLBACK_TAXONOMY, styleImageKey, categoryImageKey, occasionImageKey } from '../utils/homeTaxonomy';
import productService from '../services/productService';
import { __resetStorefrontTaxonomyCache } from '../hooks/useStorefrontTaxonomy';
import { useECommerceStore } from '../store/eCommerceStore';
import HomePage from '../pages/HomePage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const prod = (over = {}) => ({
  id: over.id ?? 'p1', slug: over.id ?? 'p1', name: 'Prenda', status: 'active', price: 100000, category: 'camisas', styleLine: 'elegante',
  occasions: [], images: [], colors: [], sizes: [], rawVariants: [], isNew: false, isBestSeller: false, stock: 1, ...over,
});

const DB = {
  categories: [
    { slug: 'calzado', name: 'Calzado', parent_id: null, image_url: 'https://cdn.test/calzado.jpg' },
    { slug: 'camisas', name: 'Camisas', parent_id: null, image_url: null },
    { slug: 'jeans', name: 'Jeans', parent_id: null, image_url: null },
    { slug: 'camisas-lino', name: 'Camisas de lino', parent_id: 'x', image_url: null },
  ],
  styleLines: [
    { slug: 'elegante', name: 'Elegante', tagline: 'Presencia.', description: 'Refinado.', badge: 'FORMAL' },
    { slug: 'casual', name: 'Smart Casual', tagline: null, description: null, badge: null },
  ],
  occasions: [
    { slug: 'trabajo', name: 'Trabajo & oficina', subtitle: 'Presencia sin perder comodidad.' },
    { slug: 'gala', name: 'Gala', subtitle: null, image_url: null },
  ],
};

describe('buildHomeTaxonomy', () => {
  it('claves editoriales iguales a las del admin (incluida Smart Casual)', () => {
    expect(styleImageKey('casual')).toBe('style_smart_casual');
    expect(styleImageKey('urbana')).toBe('style_urbana');
    expect(categoryImageKey('camisetas')).toBe('category_camisetas');
    expect(occasionImageKey('fin-de-semana')).toBe('occasion_fin_semana');
    expect(occasionImageKey('gala')).toBe('occasion_gala');
  });

  it('usa las filas de la BD, oculta subcategorías y secciones sin productos y cuenta los reales', () => {
    const products = [
      prod({ id: 'a', category: 'calzado', styleLine: 'elegante', occasions: ['trabajo'] }),
      prod({ id: 'b', category: 'camisas', styleLine: 'elegante', occasions: ['trabajo'] }),
      prod({ id: 'c', category: 'camisas', styleLine: 'casual', status: 'archivado', occasions: ['gala'] }),
    ];
    const t = buildHomeTaxonomy(DB, products, {});
    expect(t.categories.map((c) => [c.slug, c.count])).toEqual([['calzado', 1], ['camisas', 1]]);
    expect(t.styleLines.map((l) => l.slug)).toEqual(['elegante']);
    expect(t.occasions.map((o) => o.slug)).toEqual(['trabajo']);
  });

  it('prioridad de imagen: admin > image_url de la BD > foto del diseño > foto de un producto', () => {
    const products = [prod({ id: 'a', category: 'calzado' }), prod({ id: 'b', category: 'camisas' }), prod({ id: 'j', category: 'jeans', images: ['https://cdn.test/j.jpg'] })];
    const t = buildHomeTaxonomy(DB, products, { category_camisas: 'https://admin.test/camisas.jpg' });
    const img = Object.fromEntries(t.categories.map((c) => [c.slug, c.image]));
    expect(img.camisas).toBe('https://admin.test/camisas.jpg');
    expect(img.calzado).toBe('https://cdn.test/calzado.jpg');
    expect(img.jeans).toMatch(/unsplash/);
    const noDesign = buildHomeTaxonomy({ ...DB, categories: [{ slug: 'gorras', name: 'Gorras' }] }, [prod({ category: 'gorras', images: ['https://cdn.test/g.jpg'] })]);
    expect(noDesign.categories[0].image).toBe('https://cdn.test/g.jpg');
  });

  it('sin productos cargados muestra todo; sin BD usa el respaldo con los slugs de la semilla', () => {
    expect(buildHomeTaxonomy(DB, []).categories).toHaveLength(3);
    const t = buildHomeTaxonomy(null, []);
    expect(t.categories.map((c) => c.slug)).toEqual(FALLBACK_TAXONOMY.categories.map((c) => c.slug));
    expect(t.styleLines.map((l) => l.slug)).toEqual(['urbana', 'elegante', 'casual']);
    expect(t.occasions).toHaveLength(6);
  });
});

describe('HomePage con datos de la BD', () => {
  let root; let el;
  beforeEach(() => {
    __resetStorefrontTaxonomyCache();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    useECommerceStore.setState({
      products: [prod({ id: 'a', category: 'calzado', styleLine: 'elegante', occasions: ['trabajo'] }), prod({ id: 'b', category: 'camisas', styleLine: 'casual', occasions: [] })],
      editorialImages: { style_smart_casual: 'https://admin.test/smart.jpg' }, siteContent: {},
    });
  });
  afterEach(() => { act(() => root.unmount()); el.remove(); vi.restoreAllMocks(); });

  const render = async () => {
    await act(async () => { root.render(<MemoryRouter><HomePage /></MemoryRouter>); });
    await act(async () => { await Promise.resolve(); });
  };

  it('muestra las categorías, líneas y ocasiones de la BD con sus enlaces', async () => {
    const spy = vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(DB);
    await render();
    expect(spy).toHaveBeenCalledTimes(1);
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/ropa/calzado');
    expect(hrefs).toContain('/ropa/camisas');
    expect(hrefs).not.toContain('/ropa/jeans'); // sin productos
    expect(hrefs).not.toContain('/ropa/camisetas'); // de mockData, no está en la BD
    expect(hrefs).toContain('/colecciones?ocasion=trabajo');
    expect(hrefs).not.toContain('/colecciones?ocasion=gala');
    expect(el.textContent).toContain('Smart Casual');
    expect(el.textContent).not.toContain('Urbana');
    const smart = el.querySelector('[aria-label="Explorar línea Smart Casual"] img');
    expect(smart?.getAttribute('src')).toBe('https://admin.test/smart.jpg');
    expect(el.textContent).not.toContain('"null"');
  });

  it('si la BD falla, mantiene la navegación con el respaldo del diseño', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockRejectedValue(new Error('PGRST205'));
    useECommerceStore.setState({ products: [] });
    await render();
    const hrefs = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/ropa/camisetas');
    expect(hrefs).toContain('/colecciones?ocasion=fin-de-semana');
  });

  it('oculta la sección completa si no queda ninguna ocasión con productos', async () => {
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue({ ...DB, occasions: [{ slug: 'gala', name: 'Gala' }] });
    await render();
    expect(el.textContent).not.toContain('COMPRA POR OCASIÓN');
    expect(el.textContent).toContain('CATEGORÍAS DESTACADAS');
  });
});

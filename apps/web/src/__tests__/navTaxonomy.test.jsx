// @vitest-environment jsdom
// Cabecera y admin de imágenes editoriales: líneas y categorías desde la BD (antes escritas a mano).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => {
  const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
  const client = { from: () => q, storage: { from: () => q }, auth: { getSession: async () => ({ data: { session: null } }) } };
  return { default: client, supabase: client };
});

import { buildNavTaxonomy } from '../utils/navTaxonomy';
import { buildEditorialItems } from '../utils/homeTaxonomy';
import productService from '../services/productService';
import siteContentService from '../services/siteContentService';
import { __resetStorefrontTaxonomyCache } from '../hooks/useStorefrontTaxonomy';
import { useECommerceStore } from '../store/eCommerceStore';
import { Header } from '../components/Header/Header';
import { AdminEditorialImagesPage } from '../pages/admin/AdminEditorialImagesPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DB = {
  categories: [
    { slug: 'camisas', name: 'Camisas', parent_id: null },
    { slug: 'sobrecamisas', name: 'Sobrecamisas', parent_id: null },
    { slug: 'camisas-lino', name: 'Camisas de lino', parent_id: 'x' },
    { slug: 'calzado', name: 'Calzado', parent_id: null },
    { slug: 'jeans', name: 'Jeans', parent_id: null, is_active: false },
  ],
  styleLines: [
    { slug: 'elegante', name: 'Elegante' },
    { slug: 'casual', name: 'Smart Casual' },
  ],
  occasions: [{ slug: 'gala', name: 'Gala' }, { slug: 'trabajo', name: 'Trabajo & oficina' }],
};

describe('buildNavTaxonomy', () => {
  it('usa filas activas de primer nivel; calzado/accesorios con ruta propia solo si existen', () => {
    const n = buildNavTaxonomy(DB);
    expect(n.styleLines).toEqual([
      { slug: 'elegante', label: 'ELEGANTE', to: '/linea/elegante' },
      { slug: 'casual', label: 'SMART CASUAL', to: '/linea/casual' },
    ]);
    expect(n.clothing.map((c) => c.to)).toEqual(['/ropa/camisas', '/ropa/sobrecamisas']);
    expect(n.topLevel.map((c) => c.to)).toEqual(['/calzado']);
  });

  it('sin BD: el menú de siempre (líneas de la semilla, Calzado y Accesorios)', () => {
    const n = buildNavTaxonomy(null);
    expect(n.styleLines.map((l) => l.slug)).toEqual(['urbana', 'elegante', 'casual']);
    expect(n.topLevel.map((c) => c.to)).toEqual(['/calzado', '/accesorios']);
    expect(n.clothing.map((c) => c.slug)).toContain('camisetas');
    expect(n.clothing.map((c) => c.slug)).not.toContain('accesorios');
  });
});

describe('buildEditorialItems', () => {
  it('claves de la BD con las mismas funciones que la portada (incluye Calzado y ocasiones nuevas)', () => {
    const keys = buildEditorialItems(DB).map((i) => i.key);
    expect(keys).toEqual(['hero_main', 'style_elegante', 'style_smart_casual', 'category_camisas', 'category_sobrecamisas',
      'category_calzado', 'occasion_gala', 'occasion_trabajo_oficina', 'outfit_complete_look']);
  });
  it('sin BD conserva las 19 entradas originales', () => {
    expect(buildEditorialItems(null)).toHaveLength(19);
  });
});

describe('render', () => {
  let root; let el;
  beforeEach(() => {
    __resetStorefrontTaxonomyCache();
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    useECommerceStore.setState({ products: [], items: [], isMobileMenuOpen: false, siteContent: {}, siteContentError: null, loadSiteContent: async () => {} });
  });
  afterEach(() => { act(() => root.unmount()); el.remove(); vi.restoreAllMocks(); });
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  const hrefs = () => [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));

  it('Header: escritorio y menú móvil con las líneas y categorías de la BD', async () => {
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(DB);
    await act(async () => { root.render(<MemoryRouter><Header /></MemoryRouter>); });
    await flush();
    const desktop = el.querySelector('nav[aria-label="Navegación principal"]');
    expect(desktop.textContent).toContain('SMART CASUAL');
    expect(desktop.textContent).not.toContain('URBANO');
    expect(desktop.textContent).not.toContain('ACCESORIOS');
    expect(desktop.textContent).toContain('CALZADO');
    await act(async () => { useECommerceStore.setState({ isMobileMenuOpen: true }); });
    expect(hrefs()).toContain('/ropa/sobrecamisas');
    expect(hrefs()).not.toContain('/ropa/jeans');
    expect(hrefs()).not.toContain('/ropa/camisas-lino');
    expect(hrefs()).not.toContain('/accesorios');
  });

  it('Header: si la BD falla mantiene el menú de respaldo', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockRejectedValue(new Error('PGRST205'));
    await act(async () => { root.render(<MemoryRouter><Header /></MemoryRouter>); });
    await flush();
    expect(hrefs()).toEqual(expect.arrayContaining(['/linea/urbana', '/linea/casual', '/calzado', '/accesorios']));
  });

  it('Admin de imágenes: lista las secciones de la BD', async () => {
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(DB);
    vi.spyOn(siteContentService, 'listLibrary').mockResolvedValue([]);
    await act(async () => { root.render(<MemoryRouter><AdminEditorialImagesPage /></MemoryRouter>); });
    await flush();
    expect(el.textContent).toContain('Todas (9)');
    expect(el.textContent).toContain('Sobrecamisas');
    expect(el.textContent).toContain('Gala');
    expect(el.textContent).not.toContain('Bermudas');
  });
});

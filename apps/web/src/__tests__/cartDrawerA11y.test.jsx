// @vitest-environment jsdom
// Carrito lateral de la cabecera (ejecución 107): botones de icono con nombre accesible y aviso de stock al pulsar «+».
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

import productService from '../services/productService';
import { __resetStorefrontTaxonomyCache } from '../hooks/useStorefrontTaxonomy';
import { useECommerceStore } from '../store/eCommerceStore';
import { Header } from '../components/Header/Header';
import { SizeRecommenderModal } from '../components/Modals/SizeRecommenderModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LINE = { id: 'l1', productId: 'p1', variantId: 'v1', name: 'Camiseta Básica', size: 'L', color: 'Negro', price: 50000, quantity: 1, available: 1, image: '/x.jpg' };

describe('carrito lateral', () => {
  let root; let el;
  beforeEach(() => {
    __resetStorefrontTaxonomyCache();
    vi.spyOn(productService, 'getStorefrontTaxonomy').mockResolvedValue(null);
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    useECommerceStore.setState({ products: [], items: [{ ...LINE }], isMobileMenuOpen: false, isCartOpen: true, siteContent: {}, siteContentError: null, loadSiteContent: async () => {} });
  });
  afterEach(() => { act(() => root.unmount()); el.remove(); vi.restoreAllMocks(); });
  const btn = (name) => document.querySelector(`[role="dialog"] button[aria-label="${name}"]`);

  it('eliminar, restar y sumar tienen nombre con el producto', async () => {
    await act(async () => { root.render(<MemoryRouter><Header /></MemoryRouter>); });
    expect(btn('Eliminar Camiseta Básica del carrito')).not.toBeNull();
    expect(btn('Disminuir cantidad de Camiseta Básica')).not.toBeNull();
    expect(btn('Aumentar cantidad de Camiseta Básica')).not.toBeNull();
  });

  it('«+» por encima del stock no cambia la cantidad y lo anuncia; eliminar quita la línea', async () => {
    await act(async () => { root.render(<MemoryRouter><Header /></MemoryRouter>); });
    await act(async () => { btn('Aumentar cantidad de Camiseta Básica').click(); });
    expect(useECommerceStore.getState().items[0].quantity).toBe(1);
    const alert = document.querySelector('[role="dialog"] [role="alert"]');
    expect(alert?.textContent).toContain('Solo hay 1 unidad');
    await act(async () => { btn('Eliminar Camiseta Básica del carrito').click(); });
    expect(useECommerceStore.getState().items).toHaveLength(0);
    expect(document.querySelector('[role="dialog"] [role="alert"]')).toBeNull();
  });
});

describe('Encuentra tu talla', () => {
  it('los deslizadores se nombran con su etiqueta visible y anuncian la unidad', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
    useECommerceStore.setState({ activeModal: 'sizeRecommender', selectedModalProduct: { id: 'p1', name: 'Camiseta', sizes: ['S', 'M', 'L'] } });
    await act(async () => { root.render(<MemoryRouter><SizeRecommenderModal /></MemoryRouter>); });
    const ranges = [...document.querySelectorAll('input[type="range"]')];
    expect(ranges).toHaveLength(2);
    expect(ranges.map((r) => document.getElementById(r.getAttribute('aria-labelledby'))?.textContent)).toEqual(['Estatura (cm)', 'Peso (kg)']);
    expect(ranges[0].getAttribute('aria-valuetext')).toMatch(/^\d+ cm$/);
    expect(ranges[1].getAttribute('aria-valuetext')).toMatch(/^\d+ kg$/);
    act(() => root.unmount()); el.remove(); useECommerceStore.setState({ activeModal: null, selectedModalProduct: null });
  });
});

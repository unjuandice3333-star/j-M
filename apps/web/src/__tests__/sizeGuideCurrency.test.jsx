// @vitest-environment jsdom
// Guía de tallas: pestaña según la categoría del producto en cada apertura; formatCOP fuera de mockData.
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';

vi.mock('../config/supabase', () => {
  const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
  const client = { from: () => q, rpc: () => q, storage: { from: () => q }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { formatCOP } from '../utils/currency';
import { sizeChartTabFor, SIZE_CHART, SIZE_CHART_TABS } from '../data/sizeGuide';
import { useECommerceStore } from '../store/eCommerceStore';
import { SizeGuideModal } from '../components/Modals/SizeGuideModal';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('formatCOP', () => {
  it('formatea números y cadenas numéricas en pesos enteros', () => {
    expect(formatCOP(129900)).toBe('$129.900');
    expect(formatCOP('129900')).toBe('$129.900');
    expect(formatCOP('129900.00')).toBe('$129.900');
    expect(formatCOP(1234.6)).toBe('$1.235');
    expect(formatCOP(0)).toBe('$0');
    expect(formatCOP(-5000)).toBe('-$5.000');
  });
  it('valores no numéricos dan $0', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity, {}]) expect(formatCOP(v)).toBe('$0');
  });
});

describe('sizeChartTabFor', () => {
  it('cada categoría de la BD abre su tabla de medidas', () => {
    expect(sizeChartTabFor('calzado')).toBe('calzado');
    expect(sizeChartTabFor('pantalones')).toBe('jeans');
    expect(sizeChartTabFor('bermudas')).toBe('jeans');
    expect(sizeChartTabFor('polos')).toBe('camisetas');
    expect(sizeChartTabFor('camisas')).toBe('camisas');
    expect(sizeChartTabFor('Calzado ')).toBe('calzado');
  });
  it('categoría nueva: usa el grupo de tallas; si no, camisetas', () => {
    expect(sizeChartTabFor('botas', 'footwear')).toBe('calzado');
    expect(sizeChartTabFor('joggers', 'numeric_pants')).toBe('jeans');
    expect(sizeChartTabFor(null)).toBe('camisetas');
    expect(sizeChartTabFor('accesorios', 'one_size')).toBe('camisetas');
  });
  it('todas las pestañas tienen tabla', () => {
    for (const t of SIZE_CHART_TABS) expect(SIZE_CHART[t]?.length).toBeGreaterThan(0);
  });
});

describe('SizeGuideModal', () => {
  let host, root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => useECommerceStore.getState().closeModal());
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const tab = () => host.querySelector('[data-testid="size-guide-modal"]')?.getAttribute('data-active-tab');

  it('abre en la pestaña del producto en cada apertura (el modal está siempre montado)', () => {
    act(() => root.render(<SizeGuideModal />));
    expect(tab()).toBeUndefined();
    act(() => useECommerceStore.getState().openSizeGuide('camisas'));
    expect(tab()).toBe('camisas');
    act(() => useECommerceStore.getState().closeModal());
    act(() => useECommerceStore.getState().openSizeGuide('calzado'));
    expect(tab()).toBe('calzado');
    expect(host.textContent).toMatch(/Largo del Pie/);
    act(() => useECommerceStore.getState().closeModal());
    act(() => useECommerceStore.getState().openSizeGuide('pantalones'));
    expect(tab()).toBe('jeans');
    expect(host.textContent).toMatch(/Cadera/);
  });

  it('el cliente puede cambiar de pestaña', () => {
    act(() => root.render(<SizeGuideModal />));
    act(() => useECommerceStore.getState().openSizeGuide('calzado'));
    const btn = [...host.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent === 'camisas');
    act(() => btn.click());
    expect(tab()).toBe('camisas');
  });
});

describe('sin datos simulados', () => {
  it('ningún archivo de src importa data/mockData', () => {
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(e.name)) files.push(p); } };
    walk(path.resolve(__dirname, '..'));
    const offenders = files.filter((f) => /from\s+['"][./]+(data\/)?mockData['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
    expect(fs.existsSync(path.resolve(__dirname, '../data/mockData.js'))).toBe(false);
  });
});

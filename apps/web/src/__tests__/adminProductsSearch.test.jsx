// @vitest-environment jsdom
// Ejecución 79: /admin/productos busca sin tildes ni mayúsculas por nombre, slug, referencia o SKU,
// y el filtro de estado y la búsqueda viven en la URL (?estado=, ?q=). Se simulan los servicios.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const prod = (id, name, extra = {}) => ({
  id, name, slug: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'),
  reference: `REF-${id}`, status: 'active', inStock: true, price: 100000, category: 'Pantalones', categoryName: 'Pantalones',
  sizes: [], images: [], rawVariants: [{ sku: `SKU-${id}-M` }], ...extra,
});
const PRODUCTS = [
  prod('1', 'Pantalón Cargo'),
  prod('2', 'Camisa Lino', { status: 'draft' }),
  prod('3', 'Polo Básico', { inStock: false }),
];

vi.mock('../services/productService', () => ({ productService: { getProducts: vi.fn(async () => PRODUCTS) } }));
vi.mock('../services/adminService', () => ({ adminService: { setProductStatus: vi.fn() } }));
vi.mock('../store/eCommerceStore', () => ({ useECommerceStore: (sel) => sel({ loadProducts: () => {} }) }));
vi.mock('../components/Common/SafeImage', () => ({ default: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root; let loc;
const LocSpy = () => { loc = useLocation(); return null; };
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(url) {
  const { AdminProductsPage } = await import('../pages/admin/AdminProductsPage');
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/admin/productos" element={<><AdminProductsPage /><LocSpy /></>} /></Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => {});
}
const rows = () => [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
const shown = (name) => rows().some((r) => r.includes(name));
const type = async (value) => {
  const input = container.querySelector('input[aria-label="Buscar productos"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('matchesProductSearch', () => {
  it('ignora tildes y mayúsculas y busca por referencia y SKU', async () => {
    const { matchesProductSearch } = await import('../pages/admin/AdminProductsPage');
    const p = PRODUCTS[0];
    expect(matchesProductSearch(p, 'pantalon')).toBe(true);
    expect(matchesProductSearch(p, 'PANTALÓN')).toBe(true);
    expect(matchesProductSearch(p, 'ref-1')).toBe(true);
    expect(matchesProductSearch(p, 'sku-1-m')).toBe(true);
    expect(matchesProductSearch(p, 'camisa')).toBe(false);
    expect(matchesProductSearch(p, '   ')).toBe(true);
  });
});

describe('AdminProductsPage: búsqueda y filtro en la URL', () => {
  it('busca «pantalon» sin tilde y guarda ?q= en la URL', async () => {
    await render('/admin/productos');
    expect(shown('Pantalón Cargo') && shown('Camisa Lino')).toBe(true);
    await type('pantalon');
    expect(shown('Pantalón Cargo')).toBe(true);
    expect(shown('Camisa Lino')).toBe(false);
    expect(new URLSearchParams(loc.search).get('q')).toBe('pantalon');
    await type('');
    expect(loc.search).toBe('');
  });

  it('abre con ?estado=agotado&q=ref-3 ya filtrado y el botón marcado', async () => {
    await render('/admin/productos?estado=agotado&q=ref-3');
    expect(rows()).toHaveLength(1);
    expect(shown('Polo Básico')).toBe(true);
    expect(container.querySelector('input[aria-label="Buscar productos"]').value).toBe('ref-3');
    const pressed = [...container.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(['Agotado']);
  });

  it('cambiar de estado actualiza ?estado= y «Todos» lo quita; un valor inválido cae en Todos', async () => {
    await render('/admin/productos?estado=nada');
    expect(rows()).toHaveLength(3);
    const btn = (label) => [...container.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent === label);
    await act(async () => { btn('Borrador').click(); });
    expect(new URLSearchParams(loc.search).get('estado')).toBe('draft');
    expect(shown('Camisa Lino') && !shown('Pantalón Cargo')).toBe(true);
    await act(async () => { btn('Todos').click(); });
    expect(new URLSearchParams(loc.search).has('estado')).toBe(false);
  });
});

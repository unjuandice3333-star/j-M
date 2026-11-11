// @vitest-environment jsdom
// Agregado rápido de ProductCard: el color se elige en las muestras y las tallas reflejan el stock de ese color.
// Antes: siempre el primer color, sin indicarlo; con ese color agotado, todas las tallas deshabilitadas.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => {
  const make = () => {
    const q = new Proxy({}, { get: (t, k) => (k === 'then' ? (res) => res({ data: [], error: null }) : () => q) });
    return q;
  };
  const client = { from: () => make(), rpc: () => make(), storage: { from: () => make() }, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
  return { default: client, supabase: client };
});
import { act } from 'react-dom/test-utils';

import { useECommerceStore } from '../store/eCommerceStore';
import { ProductCard } from '../components/Product/ProductCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const variant = (size, color, available) => ({ id: `${size}-${color}`, sku: `${size}-${color}`, size, color, colorId: color, available, price: 100000 });
const product = (over = {}) => ({
  id: 'p1', slug: 'polo', name: 'Polo Piqué', category: 'polos', price: 100000, images: [], imagesByColor: {},
  color: 'Negro', colors: [{ name: 'Negro', hex: '#000000' }, { name: 'Blanco', hex: '#FFFFFF' }],
  sizes: ['S', 'M', 'L'], rawVariants: [variant('S', 'Negro', 0), variant('M', 'Negro', 2), variant('M', 'Blanco', 4), variant('L', 'Blanco', 1)],
  inStock: true, ...over,
});

let container; let root;
const render = (p) => act(() => { root.render(<MemoryRouter><ProductCard product={p} /></MemoryRouter>); });
const btn = (label) => container.querySelector(`button[aria-label="${label}"]`);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  useECommerceStore.setState({ items: [], wishlist: [] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('ProductCard — agregado rápido por color', () => {
  it('muestra las tallas del color por defecto y agrega ese color, indicándolo', () => {
    render(product());
    expect(btn('Talla S agotada en Negro').disabled).toBe(true);
    expect(btn('Talla L agotada en Negro')).toBeNull(); // L no existe en Negro
    click(btn('Agregar talla M en Negro al carrito'));
    const [item] = useECommerceStore.getState().items;
    expect(item).toMatchObject({ size: 'M', color: 'Negro', quantity: 1 });
    expect(container.querySelector('[role="status"]').textContent).toContain('talla M · Negro');
  });

  it('elegir otra muestra cambia las tallas disponibles y el color agregado', () => {
    render(product());
    click(btn('Polo Piqué en Blanco'));
    expect(btn('Polo Piqué en Blanco').getAttribute('aria-pressed')).toBe('true');
    click(btn('Agregar talla L en Blanco al carrito'));
    expect(useECommerceStore.getState().items[0]).toMatchObject({ size: 'L', color: 'Blanco' });
  });

  it('si el primer color está agotado, arranca en un color con stock y la muestra agotada no se elige', () => {
    render(product({ rawVariants: [variant('M', 'Negro', 0), variant('M', 'Blanco', 3)] }));
    expect(btn('Polo Piqué en Negro (agotado)').disabled).toBe(true);
    click(btn('Agregar talla M en Blanco al carrito'));
    expect(useECommerceStore.getState().items[0]).toMatchObject({ size: 'M', color: 'Blanco' });
  });

  it('respeta el límite de stock y lo informa', () => {
    render(product({ rawVariants: [variant('M', 'Negro', 1)] }));
    click(btn('Agregar talla M en Negro al carrito'));
    click(btn('Agregar talla M en Negro al carrito'));
    expect(useECommerceStore.getState().items[0].quantity).toBe(1);
    expect(container.querySelector('[role="alert"]').textContent).toMatch(/Solo hay 1/);
  });
});

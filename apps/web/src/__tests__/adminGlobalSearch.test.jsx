// @vitest-environment jsdom
// Ejecución 104 (pendiente 0(bd)): el buscador de la cabecera del admin era decorativo. Ahora Enter lleva a la lista más
// probable con `?q=` y mientras hay texto se ofrecen las cuatro listas.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AdminGlobalSearch, guessAdminSearchScope, adminSearchPath } from '../components/Common/AdminGlobalSearch';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('reglas del buscador del admin', () => {
  it('número de pedido → pedidos; correo → clientes; lo demás → productos', () => {
    expect(guessAdminSearchScope('JM-000123')).toBe('pedidos');
    expect(guessAdminSearchScope(' jm000123 ')).toBe('pedidos');
    expect(guessAdminSearchScope('ana@correo.co')).toBe('clientes');
    expect(guessAdminSearchScope('CAM-M-NEG')).toBe('productos');
    expect(guessAdminSearchScope('Pantalón')).toBe('productos');
  });
  it('ruta con el texto codificado y recortado; null sin texto o con lista desconocida', () => {
    expect(adminSearchPath('clientes', ' ana@correo.co ')).toBe('/admin/clientes?q=ana%40correo.co');
    expect(adminSearchPath('productos', 'a&b=c')).toBe('/admin/productos?q=a%26b%3Dc');
    expect(adminSearchPath('productos', '   ')).toBeNull();
    expect(adminSearchPath('otra', 'x')).toBeNull();
  });
});

describe('<AdminGlobalSearch>', () => {
  let container; let root; let loc;
  function Where() { loc = useLocation(); return null; }
  beforeEach(() => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => root.render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <AdminGlobalSearch />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </MemoryRouter>,
    ));
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const input = () => container.querySelector('input[type=search]');
  const type = (v) => act(() => {
    const el = input();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = () => act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

  it('tiene nombre accesible y rol search; sin texto no ofrece opciones', () => {
    expect(container.querySelector('form[role=search]').getAttribute('aria-label')).toBe('Buscar en el admin');
    expect(input().getAttribute('aria-label')).toBe('Buscar SKU, pedido o cliente');
    act(() => input().focus());
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('Enter navega a la lista más probable y vacía el campo', () => {
    act(() => input().focus());
    type('JM-000007'); submit();
    expect(`${loc.pathname}${loc.search}`).toBe('/admin/pedidos?q=JM-000007');
    expect(input().value).toBe('');
    type('ana@correo.co'); submit();
    expect(`${loc.pathname}${loc.search}`).toBe('/admin/clientes?q=ana%40correo.co');
  });

  it('Enter sin texto no navega', () => {
    type('   '); submit();
    expect(loc.pathname).toBe('/admin/dashboard');
  });

  it('con texto ofrece las 4 listas como enlaces; Escape las cierra; elegir una navega', () => {
    act(() => input().focus());
    type('camisa');
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/pedidos?q=camisa', '/admin/productos?q=camisa', '/admin/inventario?q=camisa', '/admin/clientes?q=camisa',
    ]);
    expect(container.textContent).toContain('Enter busca en productos');
    act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(container.querySelectorAll('a')).toHaveLength(0);
    type('camisas');
    act(() => container.querySelectorAll('a')[2].click());
    expect(`${loc.pathname}${loc.search}`).toBe('/admin/inventario?q=camisas');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

// @vitest-environment jsdom
// Ejecución 102 (pendiente 0(bb)): aria-current por segmentos en la navegación de la tienda y secciones de «Mi cuenta».
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const render = (ui) => { act(() => root.render(ui)); return { rerender: (u) => act(() => root.render(u)) }; };
const link = (name) => [...container.querySelectorAll('a')].find((a) => a.textContent === name);
import { navCurrent } from '../utils/navTaxonomy';
import { AccountSectionNav, accountSectionHeading, useAccountSectionFocus } from '../components/Account/AccountSectionNav';

describe('navCurrent (aria-current por segmentos)', () => {
  it('página exacta, sección contenedora y prefijos que NO son la misma sección', () => {
    expect(navCurrent('/ropa', '/ropa')).toBe('page');
    expect(navCurrent('/ropa/', '/ropa')).toBe('page');
    expect(navCurrent('/ropa/camisetas', '/ropa')).toBe('true');
    expect(navCurrent('/ropa/camisetas', '/ropa/camisetas')).toBe('page');
    expect(navCurrent('/linea/urbano', '/linea/urban')).toBeUndefined();
    expect(navCurrent('/ofertas-flash', '/ofertas')).toBeUndefined();
    expect(navCurrent('/ropa', '/')).toBeUndefined();
    expect(navCurrent('/', '/')).toBe('page');
    expect(navCurrent('/ropa', '/ropa?talla=M')).toBe('page');
  });
});

describe('AccountSectionNav', () => {
  it('marca solo la sección actual con aria-current="page"', () => {
    render(<MemoryRouter><AccountSectionNav pathname="/cuenta/datos" /></MemoryRouter>);
    expect(container.querySelector('nav[aria-label="Secciones de mi cuenta"]')).toBeTruthy();
    expect(link('Mis datos').getAttribute('aria-current')).toBe('page');
    expect(link('Mis datos').getAttribute('href')).toBe('/cuenta/datos');
    for (const name of ['Mis pedidos', 'Direcciones', 'Favoritos']) expect(link(name).getAttribute('aria-current')).toBeNull();
  });
  it('en /cuenta (resumen) ninguna sección está marcada', () => {
    render(<MemoryRouter><AccountSectionNav pathname="/cuenta" /></MemoryRouter>);
    expect(container.querySelectorAll('[aria-current]').length).toBe(0);
    expect(accountSectionHeading('/cuenta')).toBeNull();
    expect(accountSectionHeading('/cuenta/direcciones')).toBe('direcciones-titulo');
  });
});

describe('useAccountSectionFocus', () => {
  beforeEach(() => { vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(); return 1; }); });
  function Harness({ pathname, ready }) {
    useAccountSectionFocus(pathname, ready);
    return (<div><h2 id="pedidos-titulo">Mis pedidos</h2><h2 id="perfil-titulo">Mis datos</h2><h2 id="direcciones-titulo">Direcciones</h2></div>);
  }
  it('lleva el foco al título de la sección de la ruta y lo vuelve enfocable', () => {
    const { rerender } = render(<Harness pathname="/cuenta/direcciones" ready />);
    const h = document.getElementById('direcciones-titulo');
    expect(document.activeElement).toBe(h);
    expect(h.getAttribute('tabindex')).toBe('-1');
    rerender(<Harness pathname="/cuenta/pedidos" ready />);
    expect(document.activeElement).toBe(document.getElementById('pedidos-titulo'));
  });
  it('no mueve el foco sin sesión pintada ni en /cuenta', () => {
    const { rerender } = render(<Harness pathname="/cuenta/datos" ready={false} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Harness pathname="/cuenta" ready />);
    expect(document.activeElement).toBe(document.body);
  });
});

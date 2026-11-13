// @vitest-environment jsdom
// Ejecución 103 (pendiente 0(bc)): «Ir al contenido» y foco al cambiar de página en la tienda.
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { SkipToContent, useRouteFocus, shouldMoveFocus, MAIN_ID, MAX_WAIT_MS, __resetRouteFocus } from '../components/Common/RouteFocus';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { __resetRouteFocus(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

let go;
function Nav() { go = useNavigate(); return <Link to="/b">a b</Link>; }
function Layout({ children }) {
  useRouteFocus();
  return (<><SkipToContent /><header><Nav /></header><main id={MAIN_ID} tabIndex={-1}>{children}</main></>);
}
function Late() {
  const [ready, setReady] = useState(false);
  React.useEffect(() => { const t = setTimeout(() => setReady(true), 50); return () => clearTimeout(t); }, []);
  return ready ? <h1>Tarde</h1> : <p>cargando</p>;
}
function Auto() { return <><h1>Formulario</h1><input autoFocus aria-label="campo" /></>; }
const app = (initial) => (
  <MemoryRouter initialEntries={[initial]}>
    <Layout>
      <Routes>
        <Route path="/a" element={<h1>Página A</h1>} />
        <Route path="/b" element={<h1>Página B</h1>} />
        <Route path="/late" element={<Late />} />
        <Route path="/none" element={<p>sin título</p>} />
        <Route path="/auto" element={<Auto />} />
        <Route path="/cuenta/datos" element={<h1>Cuenta</h1>} />
      </Routes>
    </Layout>
  </MemoryRouter>
);
const activeText = () => document.activeElement?.textContent;

describe('shouldMoveFocus', () => {
  it('no en la carga inicial, ni si solo cambia la query, ni con #hash, ni en secciones de la cuenta', () => {
    expect(shouldMoveFocus(null, '/ropa', '')).toBe(false);
    expect(shouldMoveFocus('/buscar', '/buscar', '')).toBe(false);
    expect(shouldMoveFocus('/ropa', '/producto/x', '#opiniones')).toBe(false);
    expect(shouldMoveFocus('/ropa', '/cuenta/pedidos', '')).toBe(false);
    expect(shouldMoveFocus('/ropa', '/cuenta', '')).toBe(true);
    expect(shouldMoveFocus('/ropa', '/producto/x', '')).toBe(true);
  });
});

describe('useRouteFocus', () => {
  it('la carga inicial no mueve el foco; al navegar, el foco pasa al <h1> nuevo (tabindex=-1)', () => {
    act(() => root.render(app('/a')));
    expect(document.activeElement).toBe(document.body);
    const link = container.querySelector('header a'); link.focus();
    act(() => link.click());
    expect(activeText()).toBe('Página B');
    expect(document.activeElement.getAttribute('tabindex')).toBe('-1');
  });
  it('espera al <h1> que llega tarde', async () => {
    act(() => root.render(app('/a')));
    act(() => go('/late'));
    expect(document.activeElement).toBe(document.body);
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(activeText()).toBe('Tarde');
  });
  it('sin <h1> tras la espera, el foco va a <main>', () => {
    vi.useFakeTimers();
    act(() => root.render(app('/a')));
    act(() => go('/none'));
    act(() => { vi.advanceTimersByTime(MAX_WAIT_MS + 10); });
    expect(document.activeElement.id).toBe(MAIN_ID);
  });
  it('respeta el foco que la página ya puso dentro de <main> (autoFocus)', () => {
    act(() => root.render(app('/a')));
    act(() => go('/auto'));
    expect(document.activeElement.getAttribute('aria-label')).toBe('campo');
  });
  it('no interviene en /cuenta/datos (su propio destino) ni con #hash', () => {
    act(() => root.render(app('/a')));
    act(() => go('/cuenta/datos'));
    expect(document.activeElement).toBe(document.body);
    act(() => go('/b#opiniones'));
    expect(document.activeElement).toBe(document.body);
  });
});

describe('SkipToContent', () => {
  it('lleva el foco al <h1> sin cambiar la URL', () => {
    act(() => root.render(app('/a')));
    const skip = [...container.querySelectorAll('a')].find((a) => a.textContent === 'Ir al contenido');
    expect(skip.getAttribute('href')).toBe(`#${MAIN_ID}`);
    Element.prototype.scrollIntoView = vi.fn();
    act(() => skip.click());
    expect(activeText()).toBe('Página A');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

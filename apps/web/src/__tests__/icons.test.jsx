// @vitest-environment jsdom
// D77: los iconos son decorativos por defecto (aria-hidden) y solo se anuncian si llevan nombre.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Heart, X, decorative } from '../components/Common/icons';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const show = (el) => { act(() => root.render(el)); return container.querySelector('svg'); };

describe('icons (decorativos por defecto)', () => {
  it('un icono sin nombre queda oculto a los lectores de pantalla y fuera del orden de foco', () => {
    const svg = show(<button type="button">Cerrar <X size={16} /></button>);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('con aria-label se anuncia como imagen con ese nombre', () => {
    const svg = show(<Heart aria-label="En favoritos" />);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('En favoritos');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('conserva las props del icono (tamaño, color, clase de lucide) y reenvía la ref', () => {
    const ref = React.createRef();
    const svg = show(<Heart ref={ref} size={20} color="#E11D48" fill="none" />);
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('stroke')).toBe('#E11D48');
    expect(svg.getAttribute('class')).toContain('lucide-heart');
    expect(ref.current).toBe(svg);
  });

  it('decorative() mantiene el displayName del icono original', () => {
    const Fake = React.forwardRef((p, ref) => <svg ref={ref} {...p} />); Fake.displayName = 'Fake';
    expect(decorative(Fake).displayName).toBe('Fake');
  });
});

// @vitest-environment jsdom
// Política de envío visible en la tienda: se deriva de shipping_methods (método «standard»), sin cifras fijas.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));

import { getShippingPolicy } from '../utils/shippingPolicy';
import { useECommerceStore } from '../store/eCommerceStore';
import { Footer } from '../components/Footer/Footer';
import InfoPage from '../pages/InfoPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const standard = (over = {}) => ({ code: 'standard', name: 'Estándar', cost: 15000, free_over_subtotal: 200000, eta_text: '2 a 4 días', ...over });

describe('getShippingPolicy', () => {
  it('sin métodos cargados no promete envío gratis ni tarifa', () => {
    for (const input of [undefined, null, [], [{ code: 'express', cost: 30000, free_over_subtotal: 100000 }]]) {
      const p = getShippingPolicy(input);
      expect(p).toMatchObject({ loaded: false, threshold: null, cost: null, thresholdLabel: null, costLabel: null });
    }
  });

  it('usa el umbral y la tarifa del método standard', () => {
    const p = getShippingPolicy([{ code: 'express', cost: 30000, free_over_subtotal: 90000 }, standard({ free_over_subtotal: 250000, cost: 12000 })]);
    expect(p.loaded).toBe(true);
    expect(p.threshold).toBe(250000);
    expect(p.cost).toBe(12000);
    expect(p.thresholdLabel).toMatch(/^\$250.000 COP$/);
    expect(p.costLabel).toMatch(/^\$12.000 COP$/);
    expect(p.eta).toBe('2 a 4 días');
  });

  it('umbral nulo o 0 = sin envío gratis por monto', () => {
    expect(getShippingPolicy([standard({ free_over_subtotal: null })]).thresholdLabel).toBeNull();
    expect(getShippingPolicy([standard({ free_over_subtotal: 0 })]).threshold).toBeNull();
    expect(getShippingPolicy([standard({ free_over_subtotal: null })]).costLabel).toMatch(/15.000/);
  });
});

describe('textos de la tienda', () => {
  let container; let root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useECommerceStore.setState({ shippingMethods: [] });
  });

  const render = (el, path = '/') => act(() => root.render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>));
  const byTestId = (id) => container.querySelector(`[data-testid="${id}"]`);

  it('el pie muestra el umbral configurado y se actualiza al cambiar', () => {
    useECommerceStore.setState({ shippingMethods: [standard({ free_over_subtotal: 300000 })] });
    render(<Footer />);
    expect(byTestId('footer-shipping').textContent).toMatch(/Gratis desde \$300.000 COP/);
    expect(container.textContent).not.toMatch(/200.000/);
    act(() => useECommerceStore.setState({ shippingMethods: [standard({ free_over_subtotal: 150000 })] }));
    expect(byTestId('footer-shipping').textContent).toMatch(/\$150.000/);
  });

  it('el pie no promete envío gratis si no hay umbral', () => {
    useECommerceStore.setState({ shippingMethods: [standard({ free_over_subtotal: null })] });
    render(<Footer />);
    expect(byTestId('footer-shipping').textContent).toBe('A toda Colombia');
  });

  it('la página de envíos muestra umbral y tarifa reales', () => {
    useECommerceStore.setState({ shippingMethods: [standard({ free_over_subtotal: 180000, cost: 9000 })] });
    render(<InfoPage />, '/envios');
    expect(byTestId('info-free-shipping').textContent).toMatch(/\$180.000 COP/);
    expect(byTestId('info-standard-cost').textContent).toMatch(/\$9.000 COP para compras inferiores/);
    expect(container.textContent).not.toMatch(/200.000|15.000/);
  });

  it('la página de envíos sin umbral solo muestra la tarifa', () => {
    useECommerceStore.setState({ shippingMethods: [standard({ free_over_subtotal: null, cost: 9000 })] });
    render(<InfoPage />, '/envios');
    expect(byTestId('info-free-shipping')).toBeNull();
    expect(byTestId('info-standard-cost').textContent).toMatch(/\$9.000 COP por pedido/);
  });
});

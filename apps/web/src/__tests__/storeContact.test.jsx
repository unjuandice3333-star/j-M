// @vitest-environment jsdom
// Ejecución 159 (D137): el número de WhatsApp sale de UNA constante configurable (VITE_STORE_WHATSAPP) en el pie de
// página, el botón flotante, /contacto, la política de cambios y la posventa de «Mis pedidos».
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { normalizeWhatsapp, resolveStoreWhatsapp, formatWhatsapp, whatsappUrl, PLACEHOLDER_WHATSAPP } from '../config/storeContact.js';

vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('storeContact (funciones puras)', () => {
  it('normaliza formatos habituales y rechaza basura', () => {
    expect(normalizeWhatsapp('+57 315 123 4567')).toBe('573151234567');
    expect(normalizeWhatsapp(' "57-315-123-4567" ')).toBe('573151234567');
    expect(normalizeWhatsapp('(57) 315.123.4567')).toBe('573151234567');
    for (const bad of [undefined, null, '', '   ', 'abc', '123', '57315123456789012', 'https://wa.me/57315', 573151234567]) {
      expect(normalizeWhatsapp(bad)).toBeNull();
    }
  });

  it('usa el marcador si la variable falta o no es válida', () => {
    expect(resolveStoreWhatsapp({})).toBe(PLACEHOLDER_WHATSAPP);
    expect(resolveStoreWhatsapp({ VITE_STORE_WHATSAPP: 'no-es-numero' })).toBe(PLACEHOLDER_WHATSAPP);
    expect(resolveStoreWhatsapp({ VITE_STORE_WHATSAPP: '+57 315 123 4567' })).toBe('573151234567');
  });

  it('formatea para mostrar y construye enlaces wa.me con el texto codificado', () => {
    expect(formatWhatsapp('573151234567')).toBe('+57 315 123 4567');
    expect(formatWhatsapp('14155550123')).toBe('+14155550123');
    expect(whatsappUrl(undefined, '573151234567')).toBe('https://wa.me/573151234567');
    expect(whatsappUrl('Hola & chao', '573151234567')).toBe('https://wa.me/573151234567?text=Hola%20%26%20chao');
  });
});

describe('número configurado por entorno en toda la tienda', () => {
  let root; let host;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function render(el) {
    host = document.createElement('div'); document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(el));
    return host;
  }
  const waLinks = (c) => [...c.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => a.getAttribute('href'));

  it('pie de página, botón flotante, /contacto, política y posventa usan VITE_STORE_WHATSAPP', async () => {
    vi.stubEnv('VITE_STORE_WHATSAPP', '+57 315 123 4567');
    vi.resetModules();
    const { Footer } = await import('../components/Footer/Footer');
    const { WhatsAppButton } = await import('../components/Common/WhatsAppButton');
    const { default: InfoPage } = await import('../pages/InfoPage');
    const { exchangeRequestUrl } = await import('../utils/orderAftercare.js');

    const c = await render(
      <MemoryRouter initialEntries={['/contacto']}>
        <Footer />
        <WhatsAppButton />
        <InfoPage />
      </MemoryRouter>,
    );
    const links = waLinks(c);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const href of links) expect(href.startsWith('https://wa.me/573151234567')).toBe(true);
    expect(c.innerHTML).not.toContain(PLACEHOLDER_WHATSAPP);
    expect(exchangeRequestUrl({ order_number: 'JM-1' }).startsWith('https://wa.me/573151234567?text=')).toBe(true);

    act(() => root.unmount()); host.remove();
    const p = await render(<MemoryRouter initialEntries={['/cambios-y-devoluciones']}><InfoPage /></MemoryRouter>);
    expect(p.textContent).toContain('+57 315 123 4567');
    expect(p.textContent).not.toContain('300 000 0000');
  });

  it('sin variable conserva el marcador (comportamiento previo)', async () => {
    vi.stubEnv('VITE_STORE_WHATSAPP', '');
    vi.resetModules();
    const { Footer } = await import('../components/Footer/Footer');
    const c = await render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(waLinks(c)).toEqual([`https://wa.me/${PLACEHOLDER_WHATSAPP}`]);
  });
});

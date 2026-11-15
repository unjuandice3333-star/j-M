// @vitest-environment jsdom
// Ejecución 149 (D127): eliminar una colección o «Restaurar» una imagen editorial hacía desaparecer el control pulsado
// y el foco caía en <body>. Criterio D125 (`useRowFocusRestore`).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { buildEditorialItems } from '../utils/homeTaxonomy';

const db = { collections: [], content: {} };
vi.mock('../config/supabase', () => ({ default: {}, supabase: {} }));
vi.mock('../services/collectionsAdminService', async (orig) => {
  const real = await orig();
  const svc = {
    ...real.collectionsAdminService,
    list: vi.fn(async () => db.collections.map((c) => ({ ...c }))),
    listProducts: vi.fn(async () => []),
    remove: vi.fn(async (id) => { db.collections = db.collections.filter((c) => c.id !== id); }),
  };
  return { ...real, collectionsAdminService: svc, default: svc };
});
vi.mock('../services/siteContentService', async (orig) => {
  const real = await orig();
  const svc = {
    ...real.default,
    getAll: vi.fn(async () => ({ ...db.content })),
    listLibrary: vi.fn(async () => []),
    reset: vi.fn(async (key) => { delete db.content[key]; }),
  };
  return { ...real, default: svc };
});
vi.mock('../services/productService', () => ({ default: { getStorefrontTaxonomy: vi.fn(async () => null) } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const col = (id, name) => ({ id, name, slug: id, kind: 'look', sort_order: 0, is_active: true, subtitle: null, image_url: null, collection_products: [] });

describe('Foco tras eliminar colección / restaurar imagen (D127)', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
  const flush = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  const byLabel = (scope, label) => [...scope.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);
  const byText = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const press = async (el) => { el.focus(); await act(async () => { el.click(); }); await flush(); };

  it('colecciones: la tarjeta eliminada → foco en la que ocupó su lugar; la última → aviso de vacío', async () => {
    db.collections = [col('a', 'Look A'), col('b', 'Look B')];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { AdminCollectionsPage } = await import('../pages/admin/AdminCollectionsPage');
    await act(async () => { root.render(<MemoryRouter><AdminCollectionsPage /></MemoryRouter>); });
    await flush();
    await press(byLabel(container, 'Eliminar Look A'));
    expect(container.querySelector('[data-row-key="a"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[data-row-key="b"]'));
    await press(byLabel(container, 'Eliminar Look B'));
    expect(document.activeElement.textContent).toMatch(/Aún no hay colecciones/);
  });

  it('colecciones: si se cancela la confirmación no se mueve el foco', async () => {
    db.collections = [col('a', 'Look A')];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { AdminCollectionsPage } = await import('../pages/admin/AdminCollectionsPage');
    await act(async () => { root.render(<MemoryRouter><AdminCollectionsPage /></MemoryRouter>); });
    await flush();
    const del = byLabel(container, 'Eliminar Look A');
    await press(del);
    expect(document.activeElement).toBe(del);
  });

  it('imágenes: tras «Restaurar» el foco vuelve a «Cambiar» de la misma tarjeta', async () => {
    const item = buildEditorialItems(null)[0];
    db.content = { [item.key]: { url: 'https://img.test/a.jpg', alt: 'a', storagePath: null, updatedAt: '2026-11-01T00:00:00Z' } };
    const { AdminEditorialImagesPage } = await import('../pages/admin/AdminEditorialImagesPage');
    await act(async () => { root.render(<MemoryRouter><AdminEditorialImagesPage /></MemoryRouter>); });
    await flush();
    await press(byLabel(container, `Restaurar imagen ${item.title}`));
    const dialog = document.querySelector('[aria-label="Confirmar restauración"]');
    expect(dialog).toBeTruthy();
    await press(byText(dialog, 'Restaurar'));
    expect(byLabel(container, `Restaurar imagen ${item.title}`)).toBeUndefined();
    expect(document.activeElement).toBe(byLabel(container, `Cambiar imagen ${item.title}`));
  });
});

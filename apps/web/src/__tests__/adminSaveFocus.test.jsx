// @vitest-environment jsdom
// Ejecución 154 (D132): botones de guardar del admin que se deshabilitan mientras guardan. Chromium les quita el foco
// y, al terminar con un error general (el formulario sigue abierto) o tras guardar el producto, quedaba en <body>.
// jsdom conserva el foco en un botón deshabilitado: la pérdida se simula con blur() mientras se guarda (igual que D130/D131).
// Las páginas, validaciones y helpers son los reales; solo se sustituyen los servicios de datos.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../config/supabase', () => ({ default: { from: () => { throw new Error('sin BD en esta prueba'); } }, supabase: {} }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host; let root;
const flush = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const setValue = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase().includes(text.toUpperCase()));
const inputByLabel = (text) => [...host.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text))?.querySelector('input,select');
const render = async (ui, url = '/') => {
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>));
  await flush();
};
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
/** Pulsa el botón con el foco en él y simula que Chromium lo saca al deshabilitarse. */
const pressAndLoseFocus = async (btn) => {
  btn.focus();
  // Igual que D131: blur() en el mismo lote que el clic (jsdom no permite quitar el foco a un botón ya deshabilitado).
  await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); btn.blur(); });
  expect(document.activeElement).toBe(document.body);
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); host = null; });

describe('modales del admin: error general al guardar → foco en el botón de guardar', () => {
  it('/admin/configuracion — «Guardar» del método de envío', async () => {
    const mod = await import('../services/shippingAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    const d = deferred();
    vi.spyOn(mod.default, 'save').mockReturnValue(d.promise);
    const { default: Page } = await import('../pages/admin/AdminSettingsPage');
    await render(<Page />);
    await click(button('NUEVO MÉTODO'));
    await setValue(inputByLabel('Código'), 'express');
    await setValue(inputByLabel('Nombre'), 'Express');
    await setValue(inputByLabel('Tarifa'), '10000');
    const save = [...host.querySelectorAll('[role="dialog"] button[type="submit"]')][0];
    await pressAndLoseFocus(save);
    expect(mod.default.save).toHaveBeenCalled();
    await act(async () => { d.reject(new Error('Sin conexión')); });
    await flush();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(save);
    expect(save.disabled).toBe(false);
  });

  it('/admin/colecciones — «Guardar» de la colección', async () => {
    const mod = await import('../services/collectionsAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    vi.spyOn(mod.default, 'listProducts').mockResolvedValue([
      { id: 'p1', name: 'Polo', reference: 'JM-1', status: 'active' }, { id: 'p2', name: 'Jean', reference: 'JM-2', status: 'active' }]);
    const d = deferred();
    vi.spyOn(mod.default, 'save').mockReturnValue(d.promise);
    const { default: Page } = await import('../pages/admin/AdminCollectionsPage');
    await render(<Page />);
    await click(button('NUEVA COLECCIÓN'));
    await setValue(inputByLabel('Nombre'), 'Look noche');
    const pick = host.querySelector('select[aria-label="Producto para agregar"]');
    for (const id of ['p1', 'p2']) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(pick, id);
        pick.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await click(button('Agregar'));
    }
    const save = host.querySelector('[role="dialog"] button[type="submit"]');
    await pressAndLoseFocus(save);
    await act(async () => { d.reject(new Error('Servicio no disponible')); });
    await flush();
    expect(mod.default.save).toHaveBeenCalled();
    expect(document.activeElement).toBe(save);
  });

  it('/admin/descuentos — «Guardar cupón»', async () => {
    const mod = await import('../services/couponsAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    vi.spyOn(mod.default, 'usage').mockResolvedValue({});
    const d = deferred();
    vi.spyOn(mod.default, 'save').mockReturnValue(d.promise);
    const { default: Page } = await import('../pages/admin/AdminDiscountsPage');
    await render(<Page />);
    await click(button('NUEVO CUPÓN') ?? button('CREAR'));
    await setValue(inputByLabel('Código'), 'JM20');
    await setValue(inputByLabel('Porcentaje'), '20');
    const save = button('Guardar cupón');
    await pressAndLoseFocus(save);
    expect(mod.default.save).toHaveBeenCalled();
    await act(async () => { d.reject(new Error('Sin conexión')); });
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Sin conexión/);
    expect(document.activeElement).toBe(save);
  });
});

describe('/admin/descuentos — guardar un cupón que sale del filtro', () => {
  it('desmarcar «Activo» en «Activos»: foco en la fila que ocupó su lugar, no en <body>', async () => {
    const cp = (id, code, is_active) => ({ id, code, description: '', discount_type: 'percent', discount_value: 10, min_subtotal: 0, max_uses: null,
      max_uses_per_email: null, used_count: 0, is_active, starts_at: null, expires_at: null, created_at: '2026-11-01T00:00:00Z' });
    const rows = [cp('a', 'AAA', true), cp('b', 'BBB', true)];
    const mod = await import('../services/couponsAdminService');
    vi.spyOn(mod.default, 'list').mockImplementation(async () => rows.map((r) => ({ ...r })));
    vi.spyOn(mod.default, 'usage').mockResolvedValue({});
    vi.spyOn(mod.default, 'save').mockImplementation(async (form) => { rows[0].is_active = form.is_active; return { ...rows[0] }; });
    const { default: Page } = await import('../pages/admin/AdminDiscountsPage');
    await render(<Page />, '/admin/descuentos?estado=activos');
    const rowA = host.querySelector('tr[data-row-key="a"]');
    const edit = [...rowA.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Editar');
    edit.focus();
    await click(edit);
    const active = [...host.querySelectorAll('[role="dialog"] input[type="checkbox"]')].find((i) => i.closest('label')?.textContent.includes('Activo'));
    await click(active);
    await click(button('Guardar cupón'));
    await flush();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('tr[data-row-key="a"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('tr[data-row-key="b"]'));
  });
});

describe('/admin/productos/nuevo — «Guardar borrador» y «Guardar y publicar»', () => {
  const setup = async () => {
    const ps = await import('../services/productService');
    vi.spyOn(ps.productService, 'getReferenceData').mockResolvedValue({
      categories: [{ slug: 'camisetas', name: 'Camisetas', size_group: 'alpha' }],
      colors: [{ slug: 'negro', name: 'Negro', hex_code: '#000000' }],
      sizes: [{ code: 'M', size_group: 'alpha' }],
      styleLines: [], occasions: [],
    });
    const { useECommerceStore } = await import('../store/eCommerceStore');
    useECommerceStore.setState({ loadProducts: async () => {} });
    const as = await import('../services/adminService');
    const { default: Page } = await import('../pages/admin/AdminProductFormPage');
    await render(<Page />, '/admin/productos/nuevo');
    await setValue(host.querySelector('#pf-name'), 'Camiseta Básica');
    await setValue(host.querySelector('#pf-price'), '50000');
    await click(host.querySelector('button[data-field="colors"]'));
    await click(host.querySelector('button[data-field="sizes"]'));
    return as;
  };

  it('con error del servidor: foco de vuelta en el botón pulsado y aviso de error', async () => {
    const as = await setup();
    const d = deferred();
    vi.spyOn(as.adminService, 'upsertProduct').mockReturnValue(d.promise);
    const draft = button('Guardar borrador');
    await pressAndLoseFocus(draft);
    expect(as.adminService.upsertProduct).toHaveBeenCalled();
    await act(async () => { d.reject(new Error('La referencia ya existe.')); });
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/La referencia ya existe/);
    expect(document.activeElement).toBe(draft);
  });

  it('al publicar con éxito: foco de vuelta en «Guardar y publicar» y aviso de estado', async () => {
    const as = await setup();
    const d = deferred();
    vi.spyOn(as.adminService, 'upsertProduct').mockReturnValue(d.promise);
    vi.spyOn(as.adminService, 'setProductStatus').mockResolvedValue(undefined);
    vi.spyOn(as.adminService, 'getProductForEdit').mockReturnValue(new Promise(() => {}));
    await setValue(host.querySelector('input[aria-label="URL de imagen para Negro"]'), 'https://img.example/negro.jpg');
    await click(button('Agregar URL'));
    const publish = button('Guardar y publicar');
    await pressAndLoseFocus(publish);
    await act(async () => { d.resolve({ product_id: 'prod-1' }); });
    await flush();
    expect(as.adminService.setProductStatus).toHaveBeenCalledWith('prod-1', 'active');
    expect(host.querySelector('[role="status"]')?.textContent).toMatch(/guardado y publicado/);
    expect(document.activeElement).toBe(publish);
  });
});

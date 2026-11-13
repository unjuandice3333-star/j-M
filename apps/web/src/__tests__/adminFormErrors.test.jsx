// @vitest-environment jsdom
// Ejecución 109 (D80): errores accesibles en los formularios del admin (producto, cupón, colección, método de envío).
// Al guardar con errores: cada control con error tiene aria-invalid y aria-describedby → id del mensaje, el mensaje NO
// forma parte del nombre del control (va fuera del <label>) y el foco va al primer campo con error en el orden visual.
// Las validaciones y las páginas son las reales; solo se sustituyen las lecturas de datos (sin Supabase).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { fieldA11y, focusFirstError, firstErrorKey } from '../utils/formErrors';

vi.mock('../config/supabase', () => ({ default: { from: () => { throw new Error('sin BD en esta prueba'); } }, supabase: {} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const submit = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const setValue = (el, value) => act(async () => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase().includes(text.toUpperCase()));
const inputByLabel = (text) => [...host.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text))?.querySelector('input,select');
const render = async (ui) => {
  host = document.createElement('div'); document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter>{ui}</MemoryRouter>));
  await flush();
};

/** El control está enlazado a un mensaje visible y su nombre (label) no contiene el mensaje. */
const expectLinked = (el, msg) => {
  expect(el.getAttribute('aria-invalid')).toBe('true');
  const id = el.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  const note = document.getElementById(id);
  expect(note?.textContent).toMatch(msg);
  expect(el.closest('label')?.textContent ?? '').not.toMatch(msg);
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); host = null; });

describe('utils/formErrors', () => {
  it('fieldA11y solo enlaza mientras hay error; firstErrorKey respeta el orden dado', () => {
    expect(fieldA11y({}, 'x', 'name')).toEqual({ 'data-field': 'name', 'aria-invalid': false });
    expect(fieldA11y({ name: 'mal' }, 'x', 'name')).toEqual({ 'data-field': 'name', 'aria-invalid': true, 'aria-describedby': 'x-name-error' });
    expect(firstErrorKey(['a', 'b', 'c'], { c: 1, b: 1 })).toBe('b');
    expect(firstErrorKey(['a'], {})).toBeNull();
  });
  it('focusFirstError busca dentro del formulario y no enfoca controles deshabilitados', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input data-field="a" disabled><input data-field="b">';
    document.body.appendChild(form);
    expect(focusFirstError(form, ['a', 'b'], { a: 1 })).toBeNull();
    expect(focusFirstError(form, ['a', 'b'], { b: 1 })).toBe('b');
    expect(document.activeElement).toBe(form.querySelector('[data-field="b"]'));
    form.remove();
  });
});

describe('/admin/configuracion — método de envío', () => {
  it('enlaza cada error a su campo y enfoca el primero', async () => {
    const mod = await import('../services/shippingAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    const save = vi.spyOn(mod.default, 'save');
    const { default: Page } = await import('../pages/admin/AdminSettingsPage');
    await render(<Page />);
    await click(button('NUEVO MÉTODO'));
    const form = host.querySelector('[role="dialog"] form') ?? host.querySelector('form');
    await setValue(inputByLabel('Código'), 'express');
    await setValue(inputByLabel('Orden'), '-1');
    await submit(form);
    expect(save).not.toHaveBeenCalled();
    const name = inputByLabel('Nombre');
    expect(document.activeElement).toBe(name);
    expectLinked(name, /nombre es obligatorio/);
    expectLinked(inputByLabel('Orden'), /entero entre 0 y 9999/);
    expect(inputByLabel('Código').getAttribute('aria-invalid')).toBe('false');
    expect(inputByLabel('Código').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('/admin/colecciones — colección', () => {
  it('enlaza los errores (incluido el de productos) y enfoca el primero', async () => {
    const mod = await import('../services/collectionsAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    vi.spyOn(mod.default, 'listProducts').mockResolvedValue([{ id: 'p1', name: 'Polo', reference: 'JM-1', status: 'active' }]);
    const save = vi.spyOn(mod.default, 'save');
    const { default: Page } = await import('../pages/admin/AdminCollectionsPage');
    await render(<Page />);
    await click(button('NUEVA COLECCIÓN'));
    const form = host.querySelector('form');
    await setValue(inputByLabel('Nombre'), 'Look noche');
    await setValue(inputByLabel('Slug'), 'Look Noche');
    await setValue(inputByLabel('Tipo'), 'look');
    await submit(form);
    expect(save).not.toHaveBeenCalled();
    const slug = inputByLabel('Slug');
    expect(document.activeElement).toBe(slug);
    expectLinked(slug, /Slug: minúsculas/);
    expectLinked(host.querySelector('select[aria-label="Producto para agregar"]'), /al menos 2 productos/);
    expect(inputByLabel('Nombre').getAttribute('aria-invalid')).toBe('false');
  });
});

describe('/admin/descuentos — cupón', () => {
  it('muestra cada error junto a su campo (antes solo el primero, sin campo) y enfoca el primero', async () => {
    const mod = await import('../services/couponsAdminService');
    vi.spyOn(mod.default, 'list').mockResolvedValue([]);
    vi.spyOn(mod.default, 'usage').mockResolvedValue({});
    const { default: Page } = await import('../pages/admin/AdminDiscountsPage');
    await render(<Page />);
    await click(button('NUEVO CUPÓN') ?? button('CREAR'));
    const form = host.querySelector('form');
    await setValue(inputByLabel('Código'), 'JM20');
    await setValue(inputByLabel('Porcentaje'), '95');
    await submit(form);
    const pct = inputByLabel('Porcentaje');
    expect(document.activeElement).toBe(pct);
    expectLinked(pct, /entre 1 y 90/);
    expect(inputByLabel('Código').getAttribute('aria-invalid')).toBe('false');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/Revisa los campos marcados/);
  });
});

describe('/admin/productos/nuevo — producto', () => {
  it('enlaza errores de campos y grupos y enfoca el primero en orden visual', async () => {
    const ps = await import('../services/productService');
    vi.spyOn(ps.productService, 'getReferenceData').mockResolvedValue({
      categories: [{ slug: 'camisetas', name: 'Camisetas', size_group: 'alpha' }],
      colors: [{ slug: 'negro', name: 'Negro', hex_code: '#000000' }],
      sizes: [{ code: 'M', size_group: 'alpha' }],
      styleLines: [], occasions: [],
    });
    const as = await import('../services/adminService');
    const upsert = vi.spyOn(as.adminService, 'upsertProduct');
    const { default: Page } = await import('../pages/admin/AdminProductFormPage');
    await render(<Page />);
    const form = host.querySelector('form');
    await setValue(host.querySelector('#pf-name'), 'Camiseta Básica');
    await setValue(host.querySelector('#pf-price'), '0');
    await submit(form);
    expect(upsert).not.toHaveBeenCalled();
    const price = host.querySelector('#pf-price');
    expect(document.activeElement).toBe(price);
    expectLinked(price, /mayor que 0/);
    expect(host.querySelector('#pf-name').getAttribute('aria-invalid')).toBe('false');
    // Grupos (colores, tallas): el primer botón apunta al mensaje, sin aria-invalid (no válido en un botón)
    const colorBtn = host.querySelector('button[data-field="colors"]');
    expect(document.getElementById(colorBtn.getAttribute('aria-describedby'))?.textContent).toMatch(/al menos un color/);
    expect(colorBtn.hasAttribute('aria-invalid')).toBe(false);
    const sizeBtn = host.querySelector('button[data-field="sizes"]');
    expect(document.getElementById(sizeBtn.getAttribute('aria-describedby'))?.textContent).toMatch(/al menos una talla/);
    // Con precio válido, el primer error pasa a ser el de colores: el foco va al primer color
    await setValue(host.querySelector('#pf-price'), '50000');
    await submit(form);
    expect(document.activeElement).toBe(colorBtn);
  });
});

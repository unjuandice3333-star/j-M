// @vitest-environment jsdom
// Colecciones y looks del panel: validación, sincronización de productos (orden, altas y bajas) y UI real.
// Solo se simula Supabase; el servicio y la página son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/** Supabase falso que registra cada consulta encadenada (tabla, operación, filtros) y responde según la tabla. */
function recordingSupabase() {
  const calls = [];
  const state = { tables: {}, insertId: 'new-id', fail: {} };
  const from = vi.fn((table) => {
    const call = { table, op: 'select', filters: [], payload: null, opts: null };
    calls.push(call);
    const result = () => {
      if (state.fail[`${table}.${call.op}`]) return { data: null, error: state.fail[`${table}.${call.op}`] };
      if (call.op === 'select') return { data: state.tables[table] ?? [], error: null };
      if (call.op === 'insert') return { data: { id: state.insertId }, error: null };
      return { data: null, error: null };
    };
    const q = {
      select: () => q, order: () => q,
      insert: (p) => { call.op = 'insert'; call.payload = p; return q; },
      update: (p) => { call.op = 'update'; call.payload = p; return q; },
      upsert: (p, o) => { call.op = 'upsert'; call.payload = p; call.opts = o; return q; },
      delete: () => { call.op = 'delete'; return q; },
      eq: (c, v) => { call.filters.push(['eq', c, v]); return q; },
      not: (c, o, v) => { call.filters.push(['not', c, o, v]); return q; },
      single: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  });
  return { calls, state, from };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let svc;

beforeEach(async () => {
  vi.resetModules();
  supa = recordingSupabase();
  svc = await import('../services/collectionsAdminService.js');
});

const base = (over = {}) => ({ ...svc.emptyCollection(), name: 'Look Oficina', kind: 'look', productIds: ['p1', 'p2'], ...over });

describe('validateCollection', () => {
  it('genera el slug desde el nombre y normaliza la fila', () => {
    const { errors, row } = svc.validateCollection(base({ name: '  Cita & Salidas ', subtitle: '  ', sort_order: '3' }));
    expect(errors).toEqual({});
    expect(row).toEqual({ slug: 'cita-salidas', name: 'Cita & Salidas', subtitle: null, image_url: null, kind: 'look', is_active: true, sort_order: 3 });
  });
  it('rechaza nombre vacío, slug inválido, imagen no https, orden inválido y tipo desconocido', () => {
    const { errors } = svc.validateCollection(base({ name: '', slug: 'Mal Slug', image_url: 'http://x/y.jpg', sort_order: '-1', kind: 'otro' }));
    expect(Object.keys(errors).sort()).toEqual(['image_url', 'kind', 'name', 'slug', 'sort_order']);
  });
  it('un look activo necesita 2 productos; inactivo o colección no', () => {
    expect(svc.validateCollection(base({ productIds: ['p1'] })).errors.products).toMatch(/al menos 2/);
    expect(svc.validateCollection(base({ productIds: ['p1'], is_active: false })).errors.products).toBeUndefined();
    expect(svc.validateCollection(base({ productIds: [], kind: 'collection' })).errors).toEqual({});
  });
  it('rechaza productos repetidos', () => {
    expect(svc.validateCollection(base({ productIds: ['p1', 'p1'] })).errors.products).toMatch(/repetidos/);
  });
  it('toCollectionForm ordena los productos por posición', () => {
    const f = svc.toCollectionForm({ id: 'c1', slug: 's', name: 'N', subtitle: null, image_url: null, kind: 'look', is_active: true, sort_order: 2,
      collection_products: [{ product_id: 'b', position: 1 }, { product_id: 'a', position: 0 }] });
    expect(f.productIds).toEqual(['a', 'b']);
    expect(f.sort_order).toBe('2');
  });
});

describe('collectionsAdminService.save', () => {
  it('crea la colección y luego inserta sus productos con posición', async () => {
    const id = await svc.collectionsAdminService.save(base());
    expect(id).toBe('new-id');
    const [ins, del, up] = supa.calls;
    expect(ins).toMatchObject({ table: 'collections', op: 'insert' });
    expect(ins.payload.slug).toBe('look-oficina');
    expect(del).toMatchObject({ table: 'collection_products', op: 'delete' });
    expect(del.filters).toEqual([['eq', 'collection_id', 'new-id'], ['not', 'product_id', 'in', '(p1,p2)']]);
    expect(up).toMatchObject({ table: 'collection_products', op: 'upsert', opts: { onConflict: 'collection_id,product_id' } });
    expect(up.payload).toEqual([{ collection_id: 'new-id', product_id: 'p1', position: 0 }, { collection_id: 'new-id', product_id: 'p2', position: 1 }]);
  });
  it('al editar actualiza por id; sin productos borra todos y no hace upsert', async () => {
    await svc.collectionsAdminService.save(base({ id: 'c9', kind: 'collection', productIds: [] }));
    expect(supa.calls.map((c) => `${c.table}.${c.op}`)).toEqual(['collections.update', 'collection_products.delete']);
    expect(supa.calls[0].filters).toEqual([['eq', 'id', 'c9']]);
    expect(supa.calls[1].filters).toEqual([['eq', 'collection_id', 'c9']]);
  });
  it('no toca la BD si la validación falla', async () => {
    await expect(svc.collectionsAdminService.save(base({ name: '' }))).rejects.toMatchObject({ hint: 'VALIDATION' });
    expect(supa.calls).toHaveLength(0);
  });
  it('traduce slug duplicado (23505) y falta de permisos (42501)', async () => {
    supa.state.fail['collections.insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "collections_slug_key"' };
    await expect(svc.collectionsAdminService.save(base())).rejects.toThrow(/Ya existe otro registro con el slug/);
    supa.state.fail['collections.insert'] = { code: '42501', message: 'new row violates row-level security policy' };
    await expect(svc.collectionsAdminService.save(base())).rejects.toThrow(/No tienes permisos/);
  });
});

describe('AdminCollectionsPage (UI)', () => {
  let host, root;
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

  beforeEach(() => {
    supa.state.tables = {
      collections: [{ id: 'c1', slug: 'look-oficina', name: 'Look Oficina', subtitle: 'Para el lunes', image_url: null, kind: 'look', is_active: true, sort_order: 0,
        collection_products: [{ product_id: 'p2', position: 0 }, { product_id: 'p1', position: 1 }] }],
      products: [{ id: 'p1', name: 'Camisa Oxford', reference: 'CAM-1', status: 'active' }, { id: 'p2', name: 'Jean Slim', reference: 'JEA-1', status: 'active' },
        { id: 'p3', name: 'Blazer', reference: 'BLA-1', status: 'draft' }],
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  const mount = async () => {
    const { AdminCollectionsPage } = await import('../pages/admin/AdminCollectionsPage.jsx');
    await act(async () => root.render(<AdminCollectionsPage />));
    await flush();
  };
  const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const typeIn = (el, value) => act(async () => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });

  it('lista las colecciones de la BD (no datos simulados)', async () => {
    await mount();
    expect(host.textContent).toMatch(/COLECCIONES Y LOOKS \(1\)/);
    expect(host.querySelectorAll('[data-testid="collection-card"]')).toHaveLength(1);
    expect(host.textContent).toMatch(/2 producto\(s\)/);
  });

  it('editar: carga productos en orden, permite agregar uno y guarda en la BD', async () => {
    await mount();
    await click(button('Editar'));
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog.textContent).toMatch(/1\. Jean Slim[\s\S]*2\. Camisa Oxford/);
    const picker = dialog.querySelector('select[aria-label="Producto para agregar"]');
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Selecciona un producto…', 'Blazer (BLA-1) · draft']);
    await typeIn(picker, 'p3');
    await click(button('Agregar'));
    expect(dialog.textContent).toMatch(/3\. Blazer/);
    supa.calls.length = 0;
    await act(async () => { dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const up = supa.calls.find((c) => c.op === 'upsert');
    expect(supa.calls.find((c) => c.op === 'update').filters).toEqual([['eq', 'id', 'c1']]);
    expect(up.payload.map((r) => r.product_id)).toEqual(['p2', 'p1', 'p3']);
    expect(host.querySelector('[role="status"]').textContent).toMatch(/guardada/);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('nueva: muestra errores de validación sin llamar a la BD', async () => {
    await mount();
    await click(button('NUEVA COLECCIÓN'));
    supa.calls.length = 0;
    const dialog = host.querySelector('[role="dialog"]');
    await act(async () => { dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(dialog.textContent).toMatch(/El nombre es obligatorio/);
    expect(supa.calls).toHaveLength(0);
  });

  it('eliminar pide confirmación y borra por id', async () => {
    await mount();
    vi.stubGlobal('confirm', () => true);
    window.confirm = () => true;
    supa.calls.length = 0;
    await click(host.querySelector('button[aria-label="Eliminar Look Oficina"]'));
    await flush();
    expect(supa.calls[0]).toMatchObject({ table: 'collections', op: 'delete', filters: [['eq', 'id', 'c1']] });
  });
});

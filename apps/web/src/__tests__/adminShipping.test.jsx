// @vitest-environment jsdom
// Configuración de envíos del panel (/admin/configuracion): validación, guardado en shipping_methods y UI real.
// Solo se simula Supabase; el servicio y la página son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/** Supabase falso que registra cada consulta encadenada (tabla, operación, filtros, payload). */
function recordingSupabase() {
  const calls = [];
  const state = { tables: {}, fail: {}, updateMatches: 1 };
  const from = vi.fn((table) => {
    const call = { table, op: 'select', filters: [], payload: null };
    calls.push(call);
    const result = () => {
      if (state.fail[`${table}.${call.op}`]) return { data: null, error: state.fail[`${table}.${call.op}`] };
      if (call.op === 'select') return { data: state.tables[table] ?? [], error: null };
      if (call.op === 'insert') return { data: { code: call.payload.code }, error: null };
      if (call.op === 'update') return { data: Array.from({ length: state.updateMatches }, () => ({ code: call.filters[0]?.[2] })), error: null };
      return { data: null, error: null };
    };
    const q = {
      select: () => q, order: () => q,
      insert: (p) => { call.op = 'insert'; call.payload = p; return q; },
      update: (p) => { call.op = 'update'; call.payload = p; return q; },
      eq: (c, v) => { call.filters.push(['eq', c, v]); return q; },
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
  svc = await import('../services/shippingAdminService.js');
});

const STANDARD = { code: 'standard', name: 'Envío estándar nacional', cost: 15000, free_over_subtotal: 200000, eta_text: '2 a 5 días hábiles', is_active: true, sort_order: 1 };
const EXPRESS = { code: 'express', name: 'Envío express', cost: 0, free_over_subtotal: null, eta_text: 'Tarifa por definir', is_active: false, sort_order: 2 };

describe('parseCOP y validateShippingMethod', () => {
  it('acepta pesos con puntos de miles o símbolo y rechaza decimales/texto', () => {
    expect(svc.parseCOP('15.000')).toBe(15000);
    expect(svc.parseCOP('$ 200.000')).toBe(200000);
    expect(svc.parseCOP('15000')).toBe(15000);
    expect(svc.parseCOP('15,5')).toBeNaN();
    expect(svc.parseCOP('abc')).toBeNaN();
    expect(svc.parseCOP('')).toBeNaN();
  });
  it('normaliza la fila de un método válido (umbral vacío → null)', () => {
    const { errors, row } = svc.validateShippingMethod({ ...svc.toShippingForm(STANDARD), cost: '18.000', free_over_subtotal: '', eta_text: '  ' });
    expect(errors).toEqual({});
    expect(row).toEqual({ code: 'standard', name: 'Envío estándar nacional', cost: 18000, free_over_subtotal: null, eta_text: null, is_active: true, sort_order: 1 });
  });
  it('rechaza código inválido, nombre vacío, umbral 0 y orden negativo', () => {
    const { errors } = svc.validateShippingMethod({ ...svc.emptyShippingMethod(), code: 'Express-1', cost: '1000', free_over_subtotal: '0', sort_order: '-1' });
    expect(Object.keys(errors).sort()).toEqual(['code', 'free_over_subtotal', 'name', 'sort_order']);
  });
  it('un método activo necesita tarifa > 0 (regla de la BD); inactivo admite 0', () => {
    expect(svc.validateShippingMethod({ ...svc.toShippingForm(EXPRESS), is_active: true }).errors.cost).toMatch(/mayor que 0/);
    expect(svc.validateShippingMethod(svc.toShippingForm(EXPRESS)).errors).toEqual({});
  });
  it('no permite desactivar «standard» (lo usa el checkout)', () => {
    expect(svc.validateShippingMethod({ ...svc.toShippingForm(STANDARD), is_active: false }).errors.is_active).toMatch(/checkout/);
  });
});

describe('shippingAdminService.save', () => {
  it('editar: actualiza por código sin cambiar el código', async () => {
    await svc.shippingAdminService.save({ ...svc.toShippingForm(STANDARD), cost: '20000' });
    expect(supa.calls).toHaveLength(1);
    expect(supa.calls[0]).toMatchObject({ table: 'shipping_methods', op: 'update', filters: [['eq', 'code', 'standard']] });
    expect(supa.calls[0].payload).not.toHaveProperty('code');
    expect(supa.calls[0].payload.cost).toBe(20000);
  });
  it('editar sin filas afectadas (RLS o borrado) avisa en vez de fingir éxito', async () => {
    supa.state.updateMatches = 0;
    await expect(svc.shippingAdminService.save(svc.toShippingForm(STANDARD))).rejects.toMatchObject({ hint: 'NOT_FOUND' });
  });
  it('crear: inserta la fila completa; código duplicado (23505, mensaje real de PostgreSQL) se traduce', async () => {
    const form = { ...svc.emptyShippingMethod(), code: 'pickup_bogota', name: 'Recogida en tienda', cost: '1', is_active: true };
    await svc.shippingAdminService.save(form);
    expect(supa.calls[0]).toMatchObject({ table: 'shipping_methods', op: 'insert' });
    expect(supa.calls[0].payload.code).toBe('pickup_bogota');
    supa.state.fail['shipping_methods.insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "shipping_methods_pkey"' };
    await expect(svc.shippingAdminService.save(form)).rejects.toThrow(/Ya existe otro registro/);
  });
  it('no toca la BD si la validación falla; 42501 → sin permisos', async () => {
    await expect(svc.shippingAdminService.save({ ...svc.toShippingForm(STANDARD), name: '' })).rejects.toMatchObject({ hint: 'VALIDATION' });
    expect(supa.calls).toHaveLength(0);
    supa.state.fail['shipping_methods.update'] = { code: '42501', message: 'permission denied' };
    await expect(svc.shippingAdminService.save(svc.toShippingForm(STANDARD))).rejects.toThrow(/No tienes permisos/);
  });
});

describe('AdminSettingsPage (UI)', () => {
  let host, root;
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const typeIn = (el, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const fieldIn = (dialog, text) => [...dialog.querySelectorAll('label')].find((l) => l.textContent.startsWith(text)).querySelector('input');
  const submit = (dialog) => act(async () => { dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

  beforeEach(() => {
    supa.state.tables = { shipping_methods: [STANDARD, EXPRESS] };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  const mount = async () => {
    const { AdminSettingsPage } = await import('../pages/admin/AdminSettingsPage.jsx');
    await act(async () => root.render(<AdminSettingsPage />));
    await flush();
  };

  it('lista los métodos de la BD con tarifa y umbral', async () => {
    await mount();
    const rows = host.querySelectorAll('[data-testid="shipping-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/standard.*Envío estándar nacional.*15\.000.*200\.000.*ACTIVO/);
    expect(rows[1].textContent).toMatch(/INACTIVO/);
  });

  it('editar la tarifa de standard guarda en la BD y muestra confirmación', async () => {
    await mount();
    await click(host.querySelector('button[aria-label="Editar Envío estándar nacional"]'));
    const dialog = host.querySelector('[role="dialog"]');
    expect(fieldIn(dialog, 'Código').disabled).toBe(true);
    await typeIn(fieldIn(dialog, 'Tarifa'), '18.000');
    supa.calls.length = 0;
    await submit(dialog);
    await flush();
    const up = supa.calls.find((c) => c.op === 'update');
    expect(up.payload).toMatchObject({ cost: 18000, free_over_subtotal: 200000, is_active: true });
    expect(host.querySelector('[role="status"]').textContent).toMatch(/guardado/);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('desactivar standard muestra el error y no llama a la BD', async () => {
    await mount();
    await click(host.querySelector('button[aria-label="Editar Envío estándar nacional"]'));
    const dialog = host.querySelector('[role="dialog"]');
    await click(dialog.querySelector('input[type="checkbox"]'));
    supa.calls.length = 0;
    await submit(dialog);
    expect(dialog.textContent).toMatch(/no se puede desactivar/);
    expect(supa.calls).toHaveLength(0);
  });

  it('error de carga se muestra como alerta', async () => {
    supa.state.fail['shipping_methods.select'] = { code: 'PGRST205', message: "Could not find the table 'public.shipping_methods'" };
    await mount();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/métodos de envío/);
  });
});

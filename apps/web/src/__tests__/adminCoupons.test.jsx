// @vitest-environment jsdom
// Cupones del panel (/admin/descuentos): validación alineada con los CHECK de public.coupons, fechas en hora local
// Solo se simula Supabase; el servicio y la página son los reales.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, useLocation } from 'react-router-dom';

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
      in: (c, v) => { call.filters.push(['in', c, v]); return q; },
      single: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  });
  return { calls, state, from };
}

let supa;
vi.mock('../config/supabase', () => ({ get default() { return supa; }, get supabase() { return supa; } }));

// La zona horaria de la tienda (Colombia, UTC-5) hace visible el defecto de fechas desplazadas.
process.env.TZ = 'America/Bogota';

let svc;
beforeEach(async () => {
  vi.resetModules();
  supa = recordingSupabase();
  svc = await import('../services/couponsAdminService.js');
});

const C = {
  id: 'c-1', code: 'BIENVENIDA10', description: 'Primera compra', discount_type: 'percent', discount_value: 10, min_subtotal: 100000,
  max_uses: 50, max_uses_per_email: 1, used_count: 3, is_active: true,
  starts_at: '2026-12-01T05:00:00+00:00', expires_at: '2027-01-01T04:59:00+00:00', created_at: '2026-11-01T00:00:00Z',
};

describe('fechas: hora local, sin desplazamiento', () => {
  it('el entorno de prueba está en UTC-5 (si no, la prueba no detectaría el defecto)', () => {
    expect(new Date('2026-12-01T05:00:00Z').getTimezoneOffset()).toBe(300);
  });
  it('toLocalInput muestra la hora local de Bogotá', () => {
    expect(svc.toLocalInput('2026-12-01T05:00:00+00:00')).toBe('2026-12-01T00:00');
    expect(svc.toLocalInput(null)).toBe('');
    expect(svc.toLocalInput('basura')).toBe('');
  });
  it('editar y guardar sin cambios conserva exactamente las fechas', () => {
    const { errors, row } = svc.validateCoupon(svc.toCouponForm(C));
    expect(errors).toEqual({});
    expect(new Date(row.starts_at).getTime()).toBe(new Date(C.starts_at).getTime());
    expect(new Date(row.expires_at).getTime()).toBe(new Date(C.expires_at).getTime());
  });
});

describe('validateCoupon (espejo de los CHECK de la BD)', () => {
  const base = () => ({ ...svc.emptyCouponForm(), code: 'promo-1' });
  it('normaliza código a mayúsculas y campos vacíos a null', () => {
    const { errors, row } = svc.validateCoupon(base());
    expect(errors).toEqual({});
    expect(row).toEqual({ code: 'PROMO-1', description: null, discount_type: 'percent', discount_value: 10, min_subtotal: 0,
      max_uses: null, max_uses_per_email: null, starts_at: null, expires_at: null, is_active: true });
  });
  it('porcentaje 1–90 (coupons_percent_range): 91 y 100 se rechazan antes de llegar a la BD', () => {
    expect(svc.validateCoupon({ ...base(), discount_value: '90' }).errors).toEqual({});
    expect(svc.validateCoupon({ ...base(), discount_value: '91' }).errors.discount_value).toMatch(/entre 1 y 90/);
    expect(svc.validateCoupon({ ...base(), discount_value: '100' }).errors.discount_value).toMatch(/entre 1 y 90/);
    expect(svc.validateCoupon({ ...base(), discount_value: '0' }).errors.discount_value).toBeTruthy();
  });
  it('valor fijo > 0; envío gratis guarda discount_value 0', () => {
    expect(svc.validateCoupon({ ...base(), discount_type: 'fixed', discount_value: '0' }).errors.discount_value).toBeTruthy();
    expect(svc.validateCoupon({ ...base(), discount_type: 'fixed', discount_value: '20000' }).row.discount_value).toBe(20000);
    const fs = svc.validateCoupon({ ...base(), discount_type: 'free_shipping', discount_value: '' });
    expect(fs.errors).toEqual({});
    expect(fs.row.discount_value).toBe(0);
  });
  it('usos 0, código corto y fin anterior al inicio se rechazan', () => {
    const { errors } = svc.validateCoupon({ ...base(), code: 'AB', max_uses: '0', max_uses_per_email: '0',
      starts_at: '2026-12-02T00:00', expires_at: '2026-12-01T00:00' });
    expect(Object.keys(errors).sort()).toEqual(['code', 'expires_at', 'max_uses', 'max_uses_per_email']);
  });
});

describe('couponsAdminService', () => {
  it('editar actualiza por id; sin filas afectadas avisa en vez de fingir éxito', async () => {
    await svc.couponsAdminService.save(svc.toCouponForm(C));
    expect(supa.calls[0]).toMatchObject({ table: 'coupons', op: 'update', filters: [['eq', 'id', 'c-1']] });
    supa.state.updateMatches = 0;
    await expect(svc.couponsAdminService.save(svc.toCouponForm(C))).rejects.toMatchObject({ hint: 'NOT_FOUND' });
    await expect(svc.couponsAdminService.setActive('c-1', false)).rejects.toMatchObject({ hint: 'NOT_FOUND' });
  });
  it('crear inserta; código duplicado (23505) se traduce; validación fallida no toca la BD', async () => {
    const form = { ...svc.emptyCouponForm(), code: 'NUEVO' };
    await svc.couponsAdminService.save(form);
    expect(supa.calls[0]).toMatchObject({ table: 'coupons', op: 'insert' });
    supa.state.fail['coupons.insert'] = { code: '23505', message: 'duplicate key value violates unique constraint "coupons_code_key"' };
    await expect(svc.couponsAdminService.save(form)).rejects.toThrow(/Ya existe otro registro con el código/);
    supa.calls.length = 0;
    await expect(svc.couponsAdminService.save({ ...form, discount_value: '95' })).rejects.toMatchObject({ hint: 'VALIDATION' });
    expect(supa.calls).toHaveLength(0);
  });
  it('couponState: programado, vencido, agotado, inactivo', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(svc.couponState(C, now).label).toBe('Programado');
    expect(svc.couponState({ ...C, starts_at: null, expires_at: '2026-11-01T00:00:00Z' }, now).label).toBe('Vencido');
    expect(svc.couponState({ ...C, starts_at: null, used_count: 50 }, now).label).toBe('Agotado');
    expect(svc.couponState({ ...C, is_active: false }, now).label).toBe('Inactivo');
  });
});

describe('AdminDiscountsPage (UI)', () => {
  let host, root;
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const typeIn = (el, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const fieldIn = (dialog, text) => [...dialog.querySelectorAll('label')].find((l) => l.textContent.startsWith(text)).querySelector('input');
  const submit = (dialog) => act(async () => { dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const btn = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

  let location;
  const Spy = () => { location = useLocation(); return null; };
  const mount = async (url = '/admin/descuentos', coupons = [C], redemptions = []) => {
    supa.state.tables = { coupons, coupon_redemptions: redemptions };
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const { AdminDiscountsPage } = await import('../pages/admin/AdminDiscountsPage.jsx');
    await act(async () => root.render(<MemoryRouter initialEntries={[url]}><AdminDiscountsPage /><Spy /></MemoryRouter>));
    await flush();
  };
  beforeEach(async () => { await mount(); });

  it('editar muestra la fecha local y guardar sin cambios no desplaza la vigencia', async () => {
    await click(btn('Editar'));
    const dialog = host.querySelector('[role="dialog"]');
    expect(fieldIn(dialog, 'Inicio').value).toBe('2026-12-01T00:00');
    supa.calls.length = 0;
    await submit(dialog);
    await flush();
    const up = supa.calls.find((c) => c.op === 'update');
    expect(new Date(up.payload.starts_at).toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(host.querySelector('[role="status"]').textContent).toMatch(/BIENVENIDA10 actualizado/);
  });

  it('95 % muestra el error de rango y no llama a la BD', async () => {
    await click(btn('Editar'));
    const dialog = host.querySelector('[role="dialog"]');
    await typeIn(fieldIn(dialog, 'Porcentaje'), '95');
    supa.calls.length = 0;
    await submit(dialog);
    // Ejecución 109 (D80): aviso general + mensaje junto al campo, enlazado con aria-describedby y con el foco en él
    expect(dialog.querySelector('[role="alert"]').textContent).toMatch(/Revisa los campos marcados/);
    const pct = fieldIn(dialog, 'Porcentaje');
    expect(document.getElementById(pct.getAttribute('aria-describedby')).textContent).toMatch(/entre 1 y 90/);
    expect(document.activeElement).toBe(pct);
    expect(supa.calls).toHaveLength(0);
  });

  const FRESH = { ...C, id: 'c-9', code: 'SINUSO', used_count: 0 };
  const RED = [
    { coupon_id: 'c-1', status: 'confirmed', discount_amount: 15000 },
    { coupon_id: 'c-1', status: 'confirmed', discount_amount: 12000 },
    { coupon_id: 'c-1', status: 'confirmed', discount_amount: 10000 },
    { coupon_id: 'c-1', status: 'reserved', discount_amount: 9000 },
  ];

  it('desactivar un cupón sin usos actualiza is_active sin pedir confirmación', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [FRESH]);
    const confirm = vi.spyOn(window, 'confirm');
    supa.calls.length = 0;
    await click(btn('Desactivar'));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(supa.calls[0]).toMatchObject({ table: 'coupons', op: 'update', payload: { is_active: false } });
    expect(host.querySelector('[role="status"]').textContent).toMatch(/desactivado/);
    confirm.mockRestore();
  });

  it('desactivar un cupón con usos pide confirmación; cancelar no toca la BD', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [C], RED);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    supa.calls.length = 0;
    await click(btn('Desactivar'));
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/BIENVENIDA10.*4 pedidos.*1 con pago pendiente/);
    expect(supa.calls.filter((c) => c.op === 'update')).toHaveLength(0);
    confirm.mockReturnValue(true);
    await click(btn('Desactivar'));
    await flush();
    expect(supa.calls.find((c) => c.op === 'update')).toMatchObject({ table: 'coupons', payload: { is_active: false } });
    confirm.mockRestore();
  });

  it('activar un cupón inactivo con usos no pide confirmación', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [{ ...C, is_active: false }], RED);
    const confirm = vi.spyOn(window, 'confirm');
    await click(btn('Activar'));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('USOS muestra el descuento otorgado en pedidos pagados y los pagos pendientes', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [C, FRESH], RED);
    const red = supa.calls.find((c) => c.table === 'coupon_redemptions');
    expect(red.filters).toEqual([['in', 'status', ['reserved', 'confirmed']]]);
    const cell = host.querySelector('[data-testid="usos-BIENVENIDA10"]').textContent.replace(/\s/g, ' ');
    expect(cell).toMatch(/3 \/ 50/);
    expect(cell).toMatch(/37\.000 descontados/);
    expect(cell).toMatch(/\+1 con pago pendiente/);
    expect(host.querySelector('[data-testid="usos-SINUSO"]').textContent).not.toMatch(/descontados|pendiente/);
  });

  it('USOS enlaza a /admin/pedidos?cupon=CODIGO solo si el cupón tiene usos (ejecución 87)', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [C, FRESH], RED);
    expect(host.querySelector('[data-testid="pedidos-cupon-BIENVENIDA10"]').getAttribute('href')).toBe('/admin/pedidos?cupon=BIENVENIDA10');
    expect(host.querySelector('[data-testid="pedidos-cupon-SINUSO"]')).toBeNull();
  });

  it('si falla el uso, la tabla sigue visible con un aviso', async () => {
    root.unmount(); host.remove();
    supa.state.fail['coupon_redemptions.select'] = { code: '42501', message: 'permission denied' };
    await mount('/admin/descuentos', [C]);
    expect(codes()).toEqual(['BIENVENIDA10']);
    expect([...host.querySelectorAll('[role="alert"]')].some((a) => /solo el contador/.test(a.textContent))).toBe(true);
  });

  const OFF = { ...C, id: 'c-2', code: 'VIEJO', description: 'Liquidación', is_active: false };
  const codes = () => [...host.querySelectorAll('tbody tr td:first-child')].map((td) => td.firstChild?.textContent);

  it('?q= y ?estado= de la URL filtran la tabla al cargar', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos?q=liquidacion&estado=inactivos', [C, OFF]);
    expect(host.querySelector('input[aria-label="Buscar cupones"]').value).toBe('liquidacion');
    expect(host.querySelector('select[aria-label="Filtrar por estado"]').value).toBe('inactivos');
    expect(codes()).toEqual(['VIEJO']);
  });

  it('escribir y elegir estado actualizan la URL; «Todos» y búsqueda vacía no se escriben', async () => {
    root.unmount(); host.remove();
    await mount('/admin/descuentos', [C, OFF]);
    await typeIn(host.querySelector('input[aria-label="Buscar cupones"]'), 'bienvenida');
    expect(new URLSearchParams(location.search).get('q')).toBe('bienvenida');
    expect(codes()).toEqual(['BIENVENIDA10']);
    const sel = host.querySelector('select[aria-label="Filtrar por estado"]');
    await act(async () => { sel.value = 'inactivos'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(new URLSearchParams(location.search).get('estado')).toBe('inactivos');
    expect(host.textContent).toMatch(/No hay cupones con este filtro/);
    await act(async () => { sel.value = 'todos'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await typeIn(host.querySelector('input[aria-label="Buscar cupones"]'), '');
    expect(location.search).toBe('');
    expect(codes()).toEqual(['BIENVENIDA10', 'VIEJO']);
  });

});

describe('filterCoupons / couponStatusFromParam (ejecución 85)', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const rows = [
    { id: 'a', code: 'NAVIDAD', description: 'Campaña de diciembre', is_active: true, starts_at: '2026-12-01T05:00:00Z', expires_at: null, max_uses: null, used_count: 0 },
    { id: 'b', code: 'VERANO', description: 'Promoción Jóvenes', is_active: true, starts_at: null, expires_at: '2026-10-01T05:00:00Z', max_uses: null, used_count: 0 },
    { id: 'c', code: 'ENVIOGRATIS', description: null, is_active: true, starts_at: null, expires_at: null, max_uses: null, used_count: 0 },
    { id: 'd', code: 'LIMITADO', description: 'Solo 5', is_active: true, starts_at: null, expires_at: null, max_uses: 5, used_count: 5 },
    { id: 'e', code: 'VIEJO', description: '', is_active: false, starts_at: null, expires_at: null, max_uses: null, used_count: 0 },
  ];
  const ids = (r) => r.map((c) => c.id);
  it('filtra por la misma clave que muestra la columna ESTADO', () => {
    expect(ids(svc.filterCoupons(rows, '', 'todos', now))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(svc.filterCoupons(rows, '', 'programados', now))).toEqual(['a']);
    expect(ids(svc.filterCoupons(rows, '', 'vencidos', now))).toEqual(['b']);
    expect(ids(svc.filterCoupons(rows, '', 'activos', now))).toEqual(['c']);
    expect(ids(svc.filterCoupons(rows, '', 'agotados', now))).toEqual(['d']);
    expect(ids(svc.filterCoupons(rows, '', 'inactivos', now))).toEqual(['e']);
  });
  it('busca sin tildes ni mayúsculas en código y descripción', () => {
    expect(ids(svc.filterCoupons(rows, 'jovenes', 'todos', now))).toEqual(['b']);
    expect(ids(svc.filterCoupons(rows, '  navi ', 'todos', now))).toEqual(['a']);
    expect(ids(svc.filterCoupons(rows, 'envio', 'vencidos', now))).toEqual([]);
  });
  it('estado desconocido o ausente → «todos»', () => {
    expect(svc.couponStatusFromParam(null)).toBe('todos');
    expect(svc.couponStatusFromParam('basura')).toBe('todos');
    expect(svc.couponStatusFromParam('vencidos')).toBe('vencidos');
  });
});

describe('summarizeRedemptions / couponUseCount (ejecución 86)', () => {
  it('suma pagados y pendientes por cupón e ignora los liberados', () => {
    const u = svc.summarizeRedemptions([
      { coupon_id: 'a', status: 'confirmed', discount_amount: 1000 },
      { coupon_id: 'a', status: 'confirmed', discount_amount: '2500' },
      { coupon_id: 'a', status: 'reserved', discount_amount: 700 },
      { coupon_id: 'a', status: 'released', discount_amount: 99999 },
      { coupon_id: 'b', status: 'released', discount_amount: 5 },
    ]);
    expect(u).toEqual({ a: { paid: 2, paidDiscount: 3500, pending: 1, pendingDiscount: 700 } });
    expect(svc.summarizeRedemptions(null)).toEqual({});
  });
  it('couponUseCount usa el mayor entre used_count y los pagados, más los pendientes', () => {
    expect(svc.couponUseCount({ used_count: 0 }, undefined)).toBe(0);
    expect(svc.couponUseCount({ used_count: 3 }, undefined)).toBe(3);
    expect(svc.couponUseCount({ used_count: 3 }, { paid: 3, pending: 2 })).toBe(5);
    expect(svc.couponUseCount({ used_count: 0 }, { paid: 0, pending: 1 })).toBe(1);
  });
});

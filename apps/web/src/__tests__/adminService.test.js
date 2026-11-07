import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
const { adminService, adminError, slugify, toReference } = await import('../services/adminService.js');

beforeEach(() => { supa.rpc.mockClear(); supa.state.rpc = {}; });

describe('adminService: utilidades', () => {
  it('slugify y toReference normalizan tildes y símbolos', () => {
    expect(slugify('  Camisa Lino — Edición Ñandú! ')).toBe('camisa-lino-edicion-nandu');
    expect(toReference('camisa lino #01')).toBe('CAMISA-LINO-01');
    expect(slugify(null)).toBe('');
  });
});

describe('adminService.adminError', () => {
  it('traduce los HINT JM_* a mensajes en español', () => {
    const e = adminError({ hint: 'JM_PUBLISH_NO_IMAGES', message: 'x' });
    expect(e.message).toMatch(/al menos una imagen/);
    expect(e.hint).toBe('JM_PUBLISH_NO_IMAGES');
  });
  it('23505 identifica el campo duplicado', () => {
    expect(adminError({ code: '23505', message: 'duplicate key ... products_slug_key' }).message).toMatch(/el slug/);
    expect(adminError({ code: '23505', message: 'variants_sku_key sku' }).message).toMatch(/un SKU/);
    expect(adminError({ code: '23505', message: 'otra cosa' }).message).toMatch(/un valor único/);
  });
  it('23514 y 42501 (RLS) tienen mensaje propio', () => {
    expect(adminError({ code: '23514' }).hint).toBe('CHECK');
    expect(adminError({ code: '42501' }).message).toMatch(/No tienes permisos/);
  });
});

describe('adminService: llamadas RPC', () => {
  it('upsertProduct envía el payload en p y devuelve los datos', async () => {
    supa.state.rpc.admin_upsert_product = { data: { id: 'p1' }, error: null };
    const out = await adminService.upsertProduct({ name: 'X' });
    expect(out).toEqual({ id: 'p1' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_upsert_product', { p: { name: 'X' } });
  });
  it('adjustInventory mapea los argumentos a los parámetros de la RPC', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: {}, error: null };
    await adminService.adjustInventory('v1', -2, 'damage', 'roto');
    expect(supa.rpc).toHaveBeenCalledWith('admin_adjust_inventory',
      { p_variant_id: 'v1', p_quantity_change: -2, p_movement_type: 'damage', p_reason: 'roto' });
  });
  it('transitionOrder usa nota y guía nulas por defecto', async () => {
    supa.state.rpc.admin_transition_order = { data: {}, error: null };
    await adminService.transitionOrder('o1', 'processing');
    expect(supa.rpc).toHaveBeenCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'processing', p_note: null, p_tracking: null });
  });
  it('un error de la BD se lanza traducido (RLS / transición inválida)', async () => {
    supa.state.rpc.admin_transition_order = { data: null, error: { hint: 'JM_INVALID_TRANSITION', message: 'bad' } };
    await expect(adminService.transitionOrder('o1', 'shipped')).rejects.toThrow(/no puede pasar a ese estado/);
    supa.state.rpc.admin_set_product_status = { data: null, error: { code: '42501', message: 'rls' } };
    await expect(adminService.setProductStatus('p1', 'active')).rejects.toThrow(/No tienes permisos/);
  });
});

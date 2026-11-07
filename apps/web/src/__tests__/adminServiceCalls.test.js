import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

const { adminService } = await import('../services/adminService.js');

beforeEach(() => {
  supa.rpc.mockClear();
  supa.state.rpc = {};
});

describe('adminService (RPC admin_*)', () => {
  it('upsertProduct envía el payload como { p } y devuelve el resultado', async () => {
    supa.state.rpc.admin_upsert_product = { data: { id: 'p1' }, error: null };
    const payload = { name: 'Camisa', reference: 'CAM-1' };
    await expect(adminService.upsertProduct(payload)).resolves.toEqual({ id: 'p1' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_upsert_product', { p: payload });
  });

  it('upsertProduct traduce JM_COLORS_REQUIRED', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { hint: 'JM_COLORS_REQUIRED', message: 'x' } };
    await expect(adminService.upsertProduct({})).rejects.toThrow('El producto debe tener al menos un color.');
  });

  it('upsertProduct traduce referencia duplicada (23505)', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { code: '23505', message: 'duplicate key products_reference_key' } };
    await expect(adminService.upsertProduct({})).rejects.toThrow('la referencia');
  });

  it('upsertProduct traduce falta de permisos (42501)', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(adminService.upsertProduct({})).rejects.toThrow('No tienes permisos');
  });

  it('adjustInventory mapea los parámetros de la RPC', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: { stock: 7 }, error: null };
    await adminService.adjustInventory('v1', 5, 'restock', 'ingreso');
    expect(supa.rpc).toHaveBeenCalledWith('admin_adjust_inventory', {
      p_variant_id: 'v1', p_quantity_change: 5, p_movement_type: 'restock', p_reason: 'ingreso',
    });
  });

  it('adjustInventory traduce JM_BELOW_RESERVED', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: null, error: { hint: 'JM_BELOW_RESERVED', message: 'x' } };
    await expect(adminService.adjustInventory('v1', -9, 'damage', 'x')).rejects.toThrow('por debajo de lo reservado');
  });

  it('transitionOrder envía nota y guía (null por defecto)', async () => {
    supa.state.rpc.admin_transition_order = { data: { status: 'shipped' }, error: null };
    await adminService.transitionOrder('o1', 'processing');
    expect(supa.rpc).toHaveBeenLastCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'processing', p_note: null, p_tracking: null });
    const tracking = { carrier: 'Servientrega', number: '123' };
    await adminService.transitionOrder('o1', 'shipped', 'ok', tracking);
    expect(supa.rpc).toHaveBeenLastCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'shipped', p_note: 'ok', p_tracking: tracking });
  });

  it('transitionOrder traduce JM_TRACKING_REQUIRED y JM_INVALID_TRANSITION', async () => {
    supa.state.rpc.admin_transition_order = { data: null, error: { hint: 'JM_TRACKING_REQUIRED', message: 'x' } };
    await expect(adminService.transitionOrder('o1', 'shipped')).rejects.toThrow('transportadora');
    supa.state.rpc.admin_transition_order = { data: null, error: { hint: 'JM_INVALID_TRANSITION', message: 'x' } };
    await expect(adminService.transitionOrder('o1', 'paid')).rejects.toThrow('no puede pasar');
  });

  it('setProductStatus traduce JM_PUBLISH_NO_IMAGES', async () => {
    supa.state.rpc.admin_set_product_status = { data: null, error: { hint: 'JM_PUBLISH_NO_IMAGES', message: 'x' } };
    await expect(adminService.setProductStatus('p1', 'active')).rejects.toThrow('al menos una imagen');
    expect(supa.rpc).toHaveBeenCalledWith('admin_set_product_status', { p_product_id: 'p1', p_status: 'active' });
  });

  it('dashboardMetrics envía el rango', async () => {
    supa.state.rpc.admin_dashboard_metrics = { data: { orders: 3 }, error: null };
    await expect(adminService.dashboardMetrics('2026-01-01', '2026-02-01')).resolves.toEqual({ orders: 3 });
    expect(supa.rpc).toHaveBeenCalledWith('admin_dashboard_metrics', { p_from: '2026-01-01', p_to: '2026-02-01' });
  });
});

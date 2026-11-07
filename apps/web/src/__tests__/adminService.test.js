import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));
vi.mock('../config/runtimeConfig.js', () => ({
  getClientConfig: () => ({ supabase: { url: 'https://x.supabase.test' } }),
}));

const { adminService } = await import('../services/adminService.js');

beforeEach(() => {
  supa.rpc.mockClear();
  supa.state.rpc = {};
});

describe('adminService — RPC administrativas', () => {
  it('upsertProduct envía el payload en { p } y devuelve lo guardado', async () => {
    supa.state.rpc.admin_upsert_product = { data: { id: 'p9' }, error: null };
    const payload = { reference: 'CAM-1', name: 'Camisa', colors: ['negro'] };
    await expect(adminService.upsertProduct(payload)).resolves.toEqual({ id: 'p9' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_upsert_product', { p: payload });
  });

  it('upsertProduct traduce el HINT JM_* a un mensaje de administración', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { message: 'x', hint: 'JM_COLORS_REQUIRED' } };
    await expect(adminService.upsertProduct({})).rejects.toMatchObject({
      message: 'El producto debe tener al menos un color.', hint: 'JM_COLORS_REQUIRED',
    });
  });

  it('upsertProduct traduce duplicados (23505) indicando el campo', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { code: '23505', message: 'duplicate key ... products_slug_key' } };
    await expect(adminService.upsertProduct({})).rejects.toMatchObject({ message: 'Ya existe otro registro con el slug.', hint: 'UNIQUE' });
  });

  it('un error de permisos (42501) se muestra como falta de permisos', async () => {
    supa.state.rpc.admin_upsert_product = { data: null, error: { code: '42501', message: 'denied' } };
    await expect(adminService.upsertProduct({})).rejects.toMatchObject({ hint: 'JM_FORBIDDEN' });
  });

  it('setProductStatus, adjustInventory y transitionOrder mapean sus argumentos', async () => {
    supa.state.rpc.admin_set_product_status = { data: true, error: null };
    supa.state.rpc.admin_adjust_inventory = { data: true, error: null };
    supa.state.rpc.admin_transition_order = { data: true, error: null };
    await adminService.setProductStatus('p1', 'archived');
    await adminService.adjustInventory('v1', -2, 'damage', 'roto');
    await adminService.transitionOrder('o1', 'shipped', 'ok', { carrier: 'X', number: '1' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_set_product_status', { p_product_id: 'p1', p_status: 'archived' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_adjust_inventory', { p_variant_id: 'v1', p_quantity_change: -2, p_movement_type: 'damage', p_reason: 'roto' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'shipped', p_note: 'ok', p_tracking: { carrier: 'X', number: '1' } });
  });

  it('transitionOrder usa null por defecto en nota y guía; el estado inválido sube con su mensaje', async () => {
    supa.state.rpc.admin_transition_order = { data: null, error: { message: 'x', hint: 'JM_INVALID_TRANSITION' } };
    await expect(adminService.transitionOrder('o1', 'delivered')).rejects.toMatchObject({ hint: 'JM_INVALID_TRANSITION' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'delivered', p_note: null, p_tracking: null });
  });

  it('dashboardMetrics pasa el rango de fechas', async () => {
    supa.state.rpc.admin_dashboard_metrics = { data: { orders: 3 }, error: null };
    await expect(adminService.dashboardMetrics('2026-01-01', '2026-02-01')).resolves.toEqual({ orders: 3 });
    expect(supa.rpc).toHaveBeenCalledWith('admin_dashboard_metrics', { p_from: '2026-01-01', p_to: '2026-02-01' });
  });
});

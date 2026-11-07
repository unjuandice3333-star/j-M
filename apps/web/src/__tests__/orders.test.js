import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeSupabaseMock } from './helpers.js';

const supa = makeSupabaseMock();
vi.mock('../config/supabase', () => ({ default: supa, supabase: supa }));

let orderService, toOrderError, adminService, adminError;
beforeEach(async () => {
  vi.resetModules();
  supa.state.rpc = {}; supa.state.tables = {}; supa.rpc.mockClear();
  ({ orderService, toOrderError } = await import('../services/orderService.js'));
  ({ adminService, adminError } = await import('../services/adminService.js'));
});

describe('pedidos del cliente', () => {
  it('historial: devuelve los pedidos con sus líneas tal como los entrega la BD (RLS filtra por usuario)', async () => {
    const rows = [{ id: 'o2', order_number: 'JM-000002', status: 'paid', online_order_items: [{ product_name: 'Camisa', quantity: 2 }] }, { id: 'o1', status: 'cancelled', online_order_items: [] }];
    supa.state.tables.online_orders = rows;
    expect(await orderService.getMyOrders()).toEqual(rows);
    expect(supa.from).toHaveBeenCalledWith('online_orders');
  });
  it('seguimiento público exige número y token; un token incorrecto devuelve null (no filtra datos)', async () => {
    supa.state.rpc.get_order_public = ({ p_public_token }) => ({ data: p_public_token === 'ok' ? { order_number: 'JM-000001', status: 'paid' } : null, error: null });
    expect(await orderService.getPublicOrder('JM-000001', 'ok')).toMatchObject({ status: 'paid' });
    expect(await orderService.getPublicOrder('JM-000001', 'malo')).toBeNull();
  });
  it('cancelación: envía pedido, token y motivo; la BD decide si es posible', async () => {
    supa.state.rpc.cancel_my_order = { data: { status: 'cancelled' }, error: null };
    await orderService.cancelOrder('o1', 'tok', 'me arrepentí');
    expect(supa.rpc).toHaveBeenCalledWith('cancel_my_order', { p_order_id: 'o1', p_public_token: 'tok', p_reason: 'me arrepentí' });
  });
  it.each([
    ['JM_INVALID_TRANSITION', /no se puede cambiar/i], ['JM_ORDER_NOT_FOUND', /No encontramos/], ['JM_ORDER_NOT_PAYABLE', /ya no admite pagos/],
    ['JM_PAYMENT_WINDOW_EXPIRED', /expiró/], ['JM_TOO_MANY_ATTEMPTS', /máximo de intentos/],
  ])('cancelar/pagar un pedido en un estado no permitido (%s) muestra el motivo, no un error técnico', async (hint, re) => {
    supa.state.rpc.cancel_my_order = { data: null, error: { hint, message: 'detalle interno SQL' } };
    const err = await orderService.cancelOrder('o1', 'tok').catch((e) => e);
    expect(err.message).toMatch(re);
    expect(err.message).not.toMatch(/SQL/);
  });
  it('un error ya traducido no se vuelve a traducir (conserva su mensaje)', () => {
    const e1 = toOrderError({ hint: 'JM_EMPTY_CART' });
    expect(toOrderError(e1)).toBe(e1);
  });
  it('error sin pista conocida → mensaje genérico sin filtrar detalles', () => {
    expect(toOrderError({ message: 'relation "x" does not exist' }).message).toBe('No se pudo completar la operación. Inténtalo de nuevo.');
  });
});

describe('gestión de pedidos e inventario (admin)', () => {
  it('transitionOrder envía estado destino, nota y guía', async () => {
    supa.state.rpc.admin_transition_order = { data: { status: 'shipped' }, error: null };
    await adminService.transitionOrder('o1', 'shipped', 'despachado', { carrier: 'Servientrega', number: '123' });
    expect(supa.rpc).toHaveBeenCalledWith('admin_transition_order', { p_order_id: 'o1', p_to: 'shipped', p_note: 'despachado', p_tracking: { carrier: 'Servientrega', number: '123' } });
  });
  it.each([
    ['JM_INVALID_TRANSITION', /no puede pasar a ese estado/], ['JM_TRACKING_REQUIRED', /transportadora y número de guía/], ['JM_FORBIDDEN', /No tienes permisos/],
  ])('transición rechazada por la BD (%s) → mensaje de negocio', async (hint, re) => {
    supa.state.rpc.admin_transition_order = { data: null, error: { hint, message: 'x' } };
    await expect(adminService.transitionOrder('o1', 'delivered')).rejects.toThrow(re);
  });
  it('un usuario sin permisos (RLS/42501) recibe "sin permisos", no un error técnico', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: null, error: { code: '42501', message: 'permission denied' } };
    await expect(adminService.adjustInventory('v1', 5, 'restock', 'x')).rejects.toThrow(/No tienes permisos/);
  });
  it('ajuste de inventario envía variante, delta, tipo y motivo; rechaza dejar el stock bajo lo reservado', async () => {
    supa.state.rpc.admin_adjust_inventory = { data: { stock: 15 }, error: null };
    await adminService.adjustInventory('v1', 5, 'restock', 'llegó mercancía');
    expect(supa.rpc).toHaveBeenCalledWith('admin_adjust_inventory', { p_variant_id: 'v1', p_quantity_change: 5, p_movement_type: 'restock', p_reason: 'llegó mercancía' });
    supa.state.rpc.admin_adjust_inventory = { data: null, error: { hint: 'JM_BELOW_RESERVED', message: 'x' } };
    await expect(adminService.adjustInventory('v1', -50, 'adjustment', 'x')).rejects.toThrow(/por debajo de lo reservado/);
  });
  it('duplicados de SKU/slug se explican', () => {
    expect(adminError({ code: '23505', message: 'duplicate key "variants_sku_key" sku' }).message).toMatch(/un SKU/);
    expect(adminError({ code: '23505', message: 'products_slug_key slug' }).message).toMatch(/el slug/);
  });
});

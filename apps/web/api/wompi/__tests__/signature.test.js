import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRes, sha256, fakeSupabase } from './helpers.js';

let fake;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const { default: handler } = await import('../signature.js');
const UUID = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_secret';
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  fake = fakeSupabase({ online_orders: { single: { data: { id: UUID, order_number: 'JM-1001', total: 129900 }, error: null } } });
});

describe('POST /api/wompi/signature', () => {
  it('rechaza métodos distintos de POST', async () => {
    const res = mockRes(); await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
  it('exige reference u order_id', async () => {
    const res = mockRes(); await handler({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
  });
  it('falla si falta el secreto de integridad', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const res = mockRes(); await handler({ method: 'POST', body: { order_id: UUID } }, res);
    expect(res.statusCode).toBe(500);
  });
  it('firma con el total autoritativo de la BD (no del cliente)', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { order_id: UUID, amount: 1 } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.amount_in_cents).toBe(12990000);
    expect(res.body.signature).toBe(sha256('JM-1001' + '12990000' + 'COP' + 'test_integrity_secret'));
  });
  it('orden inexistente devuelve error', async () => {
    fake = fakeSupabase({ online_orders: { single: { data: null, error: { message: 'nf' } } } });
    const res = mockRes(); await handler({ method: 'POST', body: { order_id: UUID } }, res);
    expect(res.statusCode).toBe(444);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

let order = { id: '11111111-1111-4111-8111-111111111111', order_number: 'JM-100', total: 150000 };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q = { select: () => q, eq: () => q, single: async () => (order ? { data: order, error: null } : { data: null, error: {} }) };
    return { from: () => q };
  },
}));

const mockRes = () => { const r = {}; r.setHeader = () => {}; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };
let handler;
beforeEach(async () => {
  process.env.SUPABASE_URL = 'http://x'; process.env.WOMPI_INTEGRITY_SECRET = 'int_secret';
  order = { id: '11111111-1111-4111-8111-111111111111', order_number: 'JM-100', total: 150000 };
  handler = (await import('../api/wompi/signature.js')).default;
});

describe('wompi integrity signature', () => {
  it('computes signature from server-side order total (ignores client amount)', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { order_id: order.id, amount: 1 } }, res);
    expect(res.statusCode).toBe(200);
    const expected = crypto.createHash('sha256').update('JM-10015000000COPint_secret').digest('hex');
    expect(res.body.signature).toBe(expected);
    expect(res.body.amount_in_cents).toBe(15000000);
  });
  it('400 without reference/order_id', async () => {
    const res = mockRes(); await handler({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
  });
  it('500 without integrity secret', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const res = mockRes(); await handler({ method: 'POST', body: { reference: 'JM-100' } }, res);
    expect(res.statusCode).toBe(500);
  });
  it('rejects non-POST', async () => {
    const res = mockRes(); await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
});

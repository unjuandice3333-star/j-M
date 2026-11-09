import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

let order = { id: 'x', order_number: 'JM-1001', total: 125000.5 };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => (order ? { data: order } : { error: {} }) }) }) }),
  }),
}));

import handler from '../api/wompi/signature.js';

const mkRes = () => {
  const r = { headers: {} };
  r.setHeader = (k, v) => (r.headers[k] = v);
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.end = () => r;
  return r;
};

describe('wompi signature endpoint', () => {
  beforeEach(() => {
    process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_secret';
    process.env.SUPABASE_URL = 'http://x';
    order = { id: 'x', order_number: 'JM-1001', total: 125000.5 };
  });

  it('rejects non-POST', async () => {
    const r = mkRes();
    await handler({ method: 'GET' }, r);
    expect(r.code).toBe(405);
  });

  it('requires reference or order_id', async () => {
    const r = mkRes();
    await handler({ method: 'POST', body: {} }, r);
    expect(r.code).toBe(400);
  });

  it('uses server-side order total, ignoring client amount', async () => {
    const r = mkRes();
    await handler({ method: 'POST', body: { reference: 'JM-1001', amount: 1 } }, r);
    expect(r.code).toBe(200);
    expect(r.body.amount_in_cents).toBe(12500050);
    const expected = crypto.createHash('sha256').update('JM-10011250005 0COPtest_integrity_secret'.replace(' ', '')).digest('hex');
    expect(r.body.signature).toBe(expected);
  });

  it('fails when secret missing', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const r = mkRes();
    await handler({ method: 'POST', body: { reference: 'JM-1001' } }, r);
    expect(r.code).toBe(500);
  });
});

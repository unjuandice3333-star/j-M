import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Fake Supabase state, configured per test
const db = { order: null, tx: null, calls: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q,
        eq: () => q,
        or: () => q,
        single: async () => ({ data: table === 'online_orders' ? db.order : null, error: db.order ? null : { message: 'nf' } }),
        maybeSingle: async () => ({ data: table === 'online_orders' ? db.order : db.tx, error: null }),
        update: (v) => { db.calls.push([table, 'update', v]); return { eq: async () => ({ error: null }) }; },
        insert: async (v) => { db.calls.push([table, 'insert', v]); return { error: null }; },
        upsert: async (v) => { db.calls.push([table, 'upsert', v]); return { error: null }; },
      };
      return q;
    },
  }),
}));

const mockRes = () => {
  const r = { headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

const SECRET = 'evt_secret';
const sign = (payload, props, ts) => {
  const s = props.map((p) => p.split('.').reduce((o, k) => o[k], payload.data)).join('') + ts + SECRET;
  return crypto.createHash('sha256').update(s).digest('hex');
};
const PROPS = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
const makeEvent = (over = {}) => {
  const payload = {
    data: { transaction: { id: 'tx1', reference: 'JM-1', status: 'APPROVED', amount_in_cents: 5000000, currency: 'COP', ...over } },
    timestamp: 1700000000,
  };
  payload.signature = { properties: PROPS, checksum: sign(payload, PROPS, payload.timestamp) };
  return payload;
};

describe('wompi webhook', () => {
  let handler;
  beforeEach(async () => {
    process.env.SUPABASE_URL = 'http://x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    process.env.WOMPI_EVENTS_SECRET = SECRET;
    db.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 50000 };
    db.tx = null;
    db.calls = [];
    handler = (await import('../webhook.js')).default;
  });

  it('rejects non-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    expect(res.code).toBe(405);
  });

  it('rejects bad checksum with 401', async () => {
    const body = makeEvent();
    body.signature.checksum = 'deadbeef';
    const res = mockRes();
    await handler({ method: 'POST', body }, res);
    expect(res.code).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects signature missing required properties', async () => {
    const body = makeEvent();
    body.signature.properties = ['transaction.id'];
    const res = mockRes();
    await handler({ method: 'POST', body }, res);
    expect(res.code).toBe(400);
  });

  it('marks order paid on APPROVED with matching amount', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent() }, res);
    expect(res.code).toBe(200);
    expect(res.body.order_status).toBe('paid');
    expect(db.calls.some((c) => c[0] === 'online_orders' && c[2].status === 'paid')).toBe(true);
  });

  it('rejects APPROVED with amount mismatch (422)', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent({ amount_in_cents: 100 }) }, res);
    expect(res.code).toBe(422);
    expect(db.calls).toHaveLength(0);
  });

  it('cancels pending order on DECLINED', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('cancelled');
  });

  it('does not cancel an already paid order on late DECLINED', async () => {
    db.order.status = 'paid';
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('paid');
  });

  it('is idempotent when order and tx already final', async () => {
    db.order.status = 'paid';
    db.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx1', transaction_reference: 'JM-1' };
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent() }, res);
    expect(res.code).toBe(200);
    expect(db.calls).toHaveLength(0);
  });

  it('blocks tx hijack to another reference (409)', async () => {
    db.tx = { id: 't', order_id: 'o1', status: 'PENDING', wompi_transaction_id: 'tx1', transaction_reference: 'JM-OTHER' };
    const res = mockRes();
    await handler({ method: 'POST', body: makeEvent() }, res);
    expect(res.code).toBe(409);
  });
});

describe('wompi signature endpoint', () => {
  it('computes sha256(reference+cents+COP+secret) from DB total, ignoring client amount', async () => {
    process.env.WOMPI_INTEGRITY_SECRET = 'integ';
    process.env.SUPABASE_URL = 'http://x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    db.order = { id: 'o1', order_number: 'JM-1', total: 50000 };
    const handler = (await import('../signature.js')).default;
    const res = mockRes();
    await handler({ method: 'POST', body: { reference: 'JM-1', amount: 1 } }, res);
    const expected = crypto.createHash('sha256').update('JM-15000000COPinteg').digest('hex');
    expect(res.code).toBe(200);
    expect(res.body.signature).toBe(expected);
    expect(res.body.amount_in_cents).toBe(5000000);
  });
});

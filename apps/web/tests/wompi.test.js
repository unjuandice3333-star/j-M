import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, tx: null, updates: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        maybeSingle: async () => ({ data: table === 'online_orders' ? state.order : state.tx, error: null }),
        single: async () => ({ data: state.order, error: state.order ? null : { message: 'nf' } }),
        update: (v) => { state.updates.push([table, v]); return q; },
        insert: async () => ({ error: null }),
        upsert: async (v) => { state.updates.push([table, v]); return { error: null }; },
        then: (r) => r({ error: null }),
      };
      return q;
    },
  }),
}));

const { default: webhook } = await import('../api/wompi/webhook.js');
const { default: signature } = await import('../api/wompi/signature.js');

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

const SECRET = 'evsecret';
function event(overrides = {}, secret = SECRET) {
  const tx = { id: 'tx1', status: 'APPROVED', amount_in_cents: 5000000, reference: 'JM-1', currency: 'COP', ...overrides };
  const ts = 1700000000;
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = crypto.createHash('sha256')
    .update(tx.id + tx.status + tx.amount_in_cents + ts + secret).digest('hex');
  return { data: { transaction: tx }, timestamp: ts, signature: { properties: props, checksum } };
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.WOMPI_EVENTS_SECRET = SECRET; process.env.WOMPI_INTEGRITY_SECRET = 'integ';
  state.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 50000 };
  state.tx = null; state.updates = [];
});

describe('wompi webhook', () => {
  it('rejects bad checksum', async () => {
    const res = mkRes();
    await webhook({ method: 'POST', body: event({}, 'wrong') }, res);
    expect(res.code).toBe(401);
  });
  it('rejects missing signature', async () => {
    const res = mkRes();
    await webhook({ method: 'POST', body: { data: {} } }, res);
    expect(res.code).toBe(401);
  });
  it('marks order paid on APPROVED', async () => {
    const res = mkRes();
    await webhook({ method: 'POST', body: event() }, res);
    expect(res.code).toBe(200);
    expect(res.body.order_status).toBe('paid');
  });
  it('rejects amount mismatch', async () => {
    const res = mkRes();
    await webhook({ method: 'POST', body: event({ amount_in_cents: 100 }) }, res);
    expect(res.code).toBe(422);
  });
  it('cancels on DECLINED', async () => {
    const res = mkRes();
    await webhook({ method: 'POST', body: event({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('cancelled');
  });
  it('does not downgrade a paid order', async () => {
    state.order.status = 'paid';
    const res = mkRes();
    await webhook({ method: 'POST', body: event({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('paid');
  });
});

describe('wompi signature', () => {
  it('returns correct integrity hash from DB total', async () => {
    const res = mkRes();
    await signature({ method: 'POST', body: { reference: 'JM-1' } }, res);
    expect(res.code).toBe(200);
    const expected = crypto.createHash('sha256').update('JM-15000000COPinteg').digest('hex');
    expect(res.body.signature).toBe(expected);
  });
  it('404 for unknown order', async () => {
    state.order = null;
    const res = mkRes();
    await signature({ method: 'POST', body: { reference: 'nope' } }, res);
    expect(res.code).toBe(404);
  });
  it('rejects GET', async () => {
    const res = mkRes();
    await signature({ method: 'GET' }, res);
    expect(res.code).toBe(405);
  });
});

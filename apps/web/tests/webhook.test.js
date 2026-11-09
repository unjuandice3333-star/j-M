import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, tx: null, updates: [], upserts: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        maybeSingle: async () => ({ data: table === 'online_orders' ? state.order : state.tx, error: null }),
        update: (v) => { state.updates.push({ table, v }); return q; },
        insert: async () => ({ error: null }),
        upsert: async (v) => { state.upserts.push({ table, v }); return { error: null }; },
        then: (res) => res({ error: null }),
      };
      return q;
    },
  }),
}));

import handler from '../api/wompi/webhook.js';

const SECRET = 'test_events_secret';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function makeEvent({ status = 'APPROVED', amount = 10000000, ref = 'JM-1', id = 'tx-1', tamper = false } = {}) {
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const ts = 1700000000;
  const checksum = sha(`${id}${status}${amount}${ts}${SECRET}`);
  return {
    timestamp: ts,
    signature: { properties: props, checksum: tamper ? 'deadbeef' : checksum },
    data: { transaction: { id, status, amount_in_cents: amount, reference: ref, currency: 'COP' } },
  };
}
const res = () => {
  const r = { code: 0, body: null };
  r.setHeader = () => r; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r;
  return r;
};
const call = async (body) => { const r = res(); await handler({ method: 'POST', body }, r); return r; };

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  state.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 100000 };
  state.tx = null; state.updates = []; state.upserts = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Wompi webhook', () => {
  it('rejects non-POST', async () => {
    const r = res(); await handler({ method: 'GET' }, r); expect(r.code).toBe(405);
  });
  it('rejects missing signature', async () => {
    expect((await call({ data: {} })).code).toBe(401);
  });
  it('rejects bad checksum', async () => {
    expect((await call(makeEvent({ tamper: true }))).code).toBe(401);
  });
  it('rejects signature lacking required properties', async () => {
    const e = makeEvent(); e.signature.properties = ['transaction.id'];
    expect((await call(e)).code).toBe(400);
  });
  it('marks order paid on APPROVED with matching amount', async () => {
    const r = await call(makeEvent());
    expect(r.code).toBe(200); expect(r.body.order_status).toBe('paid');
    expect(state.upserts).toHaveLength(1);
  });
  it('rejects amount mismatch (fraud)', async () => {
    expect((await call(makeEvent({ amount: 100 }))).code).toBe(422);
    expect(state.updates).toHaveLength(0);
  });
  it('cancels order on DECLINED', async () => {
    const r = await call(makeEvent({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('cancelled');
  });
  it('does not cancel an already-paid order on late DECLINED', async () => {
    state.order.status = 'paid';
    const r = await call(makeEvent({ status: 'DECLINED', id: 'tx-2' }));
    expect(r.body.order_status).toBe('paid');
  });
  it('is idempotent when order and tx already final', async () => {
    state.order.status = 'paid';
    state.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1' };
    const r = await call(makeEvent());
    expect(r.code).toBe(200); expect(r.body.message).toMatch(/Idempotente/);
    expect(state.updates).toHaveLength(0);
  });
  it('blocks tx hijack onto another reference', async () => {
    state.tx = { id: 't', order_id: 'o1', status: 'PENDING', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' };
    expect((await call(makeEvent())).code).toBe(409);
  });
});

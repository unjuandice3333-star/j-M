import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, tx: null, updates: [], upserts: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q,
        eq: () => q,
        or: () => q,
        single: async () => ({ data: table === 'online_orders' ? state.order : null, error: null }),
        maybeSingle: async () => ({ data: table === 'online_orders' ? state.order : state.tx, error: null }),
        update: (v) => { state.updates.push({ table, v }); return { eq: async () => ({ error: null }) }; },
        insert: async () => ({ error: null }),
        upsert: async (v) => { state.upserts.push({ table, v }); return { error: null }; },
      };
      return q;
    },
  }),
}));

import handler from '../api/wompi/webhook.js';
import signatureHandler from '../api/wompi/signature.js';

const SECRET = 'test_events_secret';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function makeEvent({ status = 'APPROVED', amount = 15000000, ref = 'JM-1001', txId = 'tx-1', secret = SECRET, props } = {}) {
  const properties = props || ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const ts = 1700000000;
  const payload = {
    event: 'transaction.updated',
    data: { transaction: { id: txId, status, amount_in_cents: amount, reference: ref, currency: 'COP' } },
    timestamp: ts,
    signature: { properties },
  };
  payload.signature.checksum = sha(`${txId}${status}${amount}${ts}${secret}`);
  return payload;
}

function call(h, { method = 'POST', body } = {}) {
  const res = { headers: {}, statusCode: 0, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; } };
  return h({ method, body }, res).then(() => res);
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  state.order = { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 };
  state.tx = null; state.updates = []; state.upserts = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('wompi webhook', () => {
  it('rejects non-POST', async () => {
    expect((await call(handler, { method: 'GET' })).statusCode).toBe(405);
  });
  it('rejects missing signature', async () => {
    const e = makeEvent(); delete e.signature;
    expect((await call(handler, { body: e })).statusCode).toBe(401);
  });
  it('rejects bad checksum', async () => {
    expect((await call(handler, { body: makeEvent({ secret: 'wrong' }) })).statusCode).toBe(401);
  });
  it('rejects signature lacking required properties', async () => {
    const e = makeEvent({ props: ['transaction.id'] });
    expect((await call(handler, { body: e })).statusCode).toBe(400);
  });
  it('marks order paid on APPROVED with matching amount', async () => {
    const r = await call(handler, { body: makeEvent() });
    expect(r.statusCode).toBe(200);
    expect(r.body.order_status).toBe('paid');
    expect(state.updates[0].v.status).toBe('paid');
    expect(state.upserts[0].v.status).toBe('APPROVED');
  });
  it('rejects amount mismatch (fraud)', async () => {
    const r = await call(handler, { body: makeEvent({ amount: 100 }) });
    expect(r.statusCode).toBe(422);
    expect(state.updates).toHaveLength(0);
  });
  it('cancels pending order on DECLINED', async () => {
    const r = await call(handler, { body: makeEvent({ status: 'DECLINED' }) });
    expect(r.body.order_status).toBe('cancelled');
  });
  it('does not cancel an already paid order on late DECLINED', async () => {
    state.order.status = 'paid';
    const r = await call(handler, { body: makeEvent({ status: 'DECLINED' }) });
    expect(r.body.order_status).toBe('paid');
  });
  it('is idempotent when order and tx already final', async () => {
    state.order.status = 'paid';
    state.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' };
    const r = await call(handler, { body: makeEvent() });
    expect(r.statusCode).toBe(200);
    expect(state.updates).toHaveLength(0);
    expect(state.upserts).toHaveLength(0);
  });
  it('blocks tx id reuse across references', async () => {
    state.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'OTHER' };
    expect((await call(handler, { body: makeEvent() })).statusCode).toBe(409);
  });
  it('404 when order unknown', async () => {
    state.order = null;
    expect((await call(handler, { body: makeEvent() })).statusCode).toBe(404);
  });
});

describe('wompi signature endpoint', () => {
  beforeEach(() => { process.env.WOMPI_INTEGRITY_SECRET = 'integ'; process.env.WOMPI_PUBLIC_KEY = 'pub_test_x'; });
  it('computes SHA-256 from server-side order total, ignoring client amounts', async () => {
    const r = await call(signatureHandler, { body: { reference: 'JM-1001', amount: 1 } });
    expect(r.statusCode).toBe(200);
    expect(r.body.amount_in_cents).toBe(15000000);
    expect(r.body.signature).toBe(sha('JM-1001' + '15000000' + 'COP' + 'integ'));
  });
  it('400 without reference/order_id', async () => {
    expect((await call(signatureHandler, { body: {} })).statusCode).toBe(400);
  });
});

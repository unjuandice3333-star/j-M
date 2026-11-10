import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, tx: null, updates: [], upserts: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        maybeSingle: async () => ({
          data: table === 'online_orders' ? state.order : state.tx,
          error: null,
        }),
        update: (v) => { state.updates.push({ table, v }); return chain; },
        upsert: async (v) => { state.upserts.push({ table, v }); return { error: null }; },
        insert: async () => ({ error: null }),
        then: (res) => res({ error: null }),
      };
      return chain;
    },
  }),
}));

import handler from '../webhook.js';

const SECRET = 'test_events_secret';
const TS = 1700000000;

function makeEvent({ status = 'APPROVED', amount = 5000000, ref = 'JM-1', tamper = false } = {}) {
  const tx = { id: 'tx-1', status, amount_in_cents: amount, reference: ref, currency: 'COP' };
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = crypto
    .createHash('sha256')
    .update(`tx-1${status}${amount}${TS}${SECRET}`)
    .digest('hex');
  return {
    data: { transaction: tamper ? { ...tx, amount_in_cents: 1 } : tx },
    timestamp: TS,
    signature: { properties: props, checksum },
  };
}

function run(body, method = 'POST') {
  const res = {
    code: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return handler({ method, body }, res).then(() => res);
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  state.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 50000 };
  state.tx = null;
  state.updates = [];
  state.upserts = [];
});

describe('Wompi webhook', () => {
  it('rejects non-POST', async () => {
    expect((await run({}, 'GET')).code).toBe(405);
  });
  it('rejects missing signature', async () => {
    expect((await run({ data: {}, timestamp: 1 })).code).toBe(401);
  });
  it('rejects tampered payload (bad checksum)', async () => {
    expect((await run(makeEvent({ tamper: true }))).code).toBe(401);
  });
  it('marks order paid on valid APPROVED event', async () => {
    const r = await run(makeEvent());
    expect(r.code).toBe(200);
    expect(r.body.order_status).toBe('paid');
    expect(state.updates[0].v.status).toBe('paid');
  });
  it('rejects amount mismatch with 422', async () => {
    state.order.total = 99999;
    expect((await run(makeEvent())).code).toBe(422);
    expect(state.updates).toHaveLength(0);
  });
  it('cancels order on DECLINED', async () => {
    const r = await run(makeEvent({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('cancelled');
  });
  it('is idempotent when already paid', async () => {
    state.order.status = 'paid';
    state.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1' };
    const r = await run(makeEvent());
    expect(r.code).toBe(200);
    expect(state.updates).toHaveLength(0);
  });
  it('never downgrades a paid order on DECLINED', async () => {
    state.order.status = 'paid';
    const r = await run(makeEvent({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('paid');
  });
  it('404 when order missing', async () => {
    state.order = null;
    expect((await run(makeEvent())).code).toBe(404);
  });
});

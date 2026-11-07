import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mutable fake DB state for the mocked Supabase client
const db = { order: null, tx: null, updates: [], upserts: [], events: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        single: async () => ({ data: table === 'online_orders' ? db.order : null, error: db.order ? null : { message: 'nf' } }),
        maybeSingle: async () => ({ data: table === 'online_orders' ? db.order : db.tx, error: null }),
        update: (v) => { db.updates.push({ table, v }); return { eq: async () => ({ error: null }) }; },
        upsert: async (v) => { db.upserts.push({ table, v }); return { error: null }; },
        insert: async (v) => { db.events.push(v); return { error: null }; },
      };
      return q;
    },
  }),
}));

import webhook from '../api/wompi/webhook.js';
import signature from '../api/wompi/signature.js';

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

const SECRET = 'test_events_secret';
const ORDER = { id: '11111111-1111-4111-8111-111111111111', order_number: 'JM-1001', status: 'pending', total: 150000 };

function event({ status = 'APPROVED', amount = 15000000, currency = 'COP', ref = 'JM-1001', secret = SECRET, props } = {}) {
  const payload = {
    data: { transaction: { id: 'tx-1', status, amount_in_cents: amount, reference: ref, currency } },
    timestamp: 1700000000,
    signature: { properties: props || ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] },
  };
  const str = payload.signature.properties.map((p) => String(p.split('.').reduce((o, k) => o?.[k], payload.data))).join('') + payload.timestamp + secret;
  payload.signature.checksum = crypto.createHash('sha256').update(str).digest('hex');
  return payload;
}

beforeEach(() => {
  Object.assign(db, { order: { ...ORDER }, tx: null, updates: [], upserts: [], events: [] });
  process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.WOMPI_EVENTS_SECRET = SECRET; process.env.WOMPI_INTEGRITY_SECRET = 'integ';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const call = async (h, body, method = 'POST') => { const r = mkRes(); await h({ method, body }, r); return r; };

describe('Wompi webhook', () => {
  it('rejects non-POST', async () => expect((await call(webhook, {}, 'GET')).code).toBe(405));
  it('rejects missing signature', async () => expect((await call(webhook, { data: {}, timestamp: 1 })).code).toBe(401));
  it('rejects bad checksum', async () => {
    const e = event(); e.signature.checksum = 'deadbeef';
    expect((await call(webhook, e)).code).toBe(401);
  });
  it('rejects event signed with wrong secret', async () => expect((await call(webhook, event({ secret: 'other' }))).code).toBe(401));
  it('rejects signature missing required properties', async () =>
    expect((await call(webhook, event({ props: ['transaction.id'] }))).code).toBe(400));
  it('marks order paid on APPROVED and records the transaction', async () => {
    const r = await call(webhook, event());
    expect(r.code).toBe(200);
    expect(r.body.order_status).toBe('paid');
    expect(db.updates[0].v.status).toBe('paid');
    expect(db.upserts[0].v.status).toBe('APPROVED');
  });
  it('rejects amount mismatch (fraud)', async () => {
    const r = await call(webhook, event({ amount: 100 }));
    expect(r.code).toBe(422);
    expect(db.updates).toHaveLength(0);
  });
  it('rejects non-COP currency', async () => expect((await call(webhook, event({ currency: 'USD' }))).code).toBe(422));
  it('cancels pending order on DECLINED', async () => {
    const r = await call(webhook, event({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('cancelled');
  });
  it('never downgrades a paid order on DECLINED', async () => {
    db.order.status = 'paid';
    const r = await call(webhook, event({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('paid');
  });
  it('is idempotent when order and tx are already final', async () => {
    db.order.status = 'paid';
    db.tx = { order_id: ORDER.id, status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' };
    const r = await call(webhook, event());
    expect(r.code).toBe(200);
    expect(db.updates).toHaveLength(0);
    expect(db.upserts).toHaveLength(0);
  });
  it('blocks tx id reuse across references', async () => {
    db.tx = { order_id: ORDER.id, status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' };
    expect((await call(webhook, event())).code).toBe(409);
  });
  it('404 when order missing', async () => { db.order = null; expect((await call(webhook, event())).code).toBe(404); });
});

describe('Wompi integrity signature', () => {
  it('uses authoritative DB total, not client input', async () => {
    const r = await call(signature, { order_id: ORDER.id, amount: 1 });
    expect(r.code).toBe(200);
    expect(r.body.amount_in_cents).toBe(15000000);
    const expected = crypto.createHash('sha256').update('JM-1001' + 15000000 + 'COP' + 'integ').digest('hex');
    expect(r.body.signature).toBe(expected);
  });
  it('400 without reference/order_id', async () => expect((await call(signature, {})).code).toBe(400));
  it('500 when integrity secret unset', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    expect((await call(signature, { order_id: ORDER.id })).code).toBe(500);
  });
  it('unknown order rejected', async () => { db.order = null; expect((await call(signature, { order_id: ORDER.id })).code).toBe(444); });
});

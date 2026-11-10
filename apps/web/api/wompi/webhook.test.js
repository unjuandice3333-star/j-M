import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const SECRET = 'test_events_secret';
let db;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        update: (v) => { db.updates.push({ table, v }); return q; },
        insert: (v) => { db.inserts.push({ table, v }); return Promise.resolve({ error: null }); },
        upsert: (v) => { db.upserts.push({ table, v }); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({ data: db[table] ?? null, error: null }),
        then: (res) => res({ error: null })
      };
      return q;
    }
  })
}));

const { default: handler } = await import('./webhook.js');

function res() {
  const r = { headers: {}, code: 200, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

function signed({ status = 'APPROVED', amount = 15000000, ref = 'JM-1001', ts = 1700000000, tamper } = {}) {
  const tx = { id: 'tx-1', reference: ref, status, amount_in_cents: amount, currency: 'COP' };
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = crypto.createHash('sha256')
    .update(`${tx.id}${tx.status}${tx.amount_in_cents}${ts}${SECRET}`).digest('hex');
  const payload = { event: 'transaction.updated', data: { transaction: tx }, timestamp: ts,
    signature: { properties: props, checksum } };
  if (tamper) tamper(payload);
  return payload;
}

describe('Wompi webhook', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://x';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    process.env.WOMPI_EVENTS_SECRET = SECRET;
    db = { updates: [], inserts: [], upserts: [],
      online_orders: { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 },
      payment_transactions: null };
  });

  it('rechaza GET', async () => {
    const r = res(); await handler({ method: 'GET' }, r);
    expect(r.code).toBe(405);
  });

  it('rechaza firma inválida con 401 y no muta', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed({ tamper: (p) => { p.signature.checksum = 'deadbeef'.repeat(8); } }) }, r);
    expect(r.code).toBe(401);
    expect(db.updates).toHaveLength(0);
  });

  it('rechaza monto manipulado tras firmar', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed({ tamper: (p) => { p.data.transaction.amount_in_cents = 100; } }) }, r);
    expect(r.code).toBe(401);
  });

  it('rechaza firma sin propiedades obligatorias', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed({ tamper: (p) => { p.signature.properties = ['transaction.id']; } }) }, r);
    expect(r.code).toBe(400);
  });

  it('APPROVED con monto correcto marca la orden como paid', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed() }, r);
    expect(r.code).toBe(200);
    expect(r.body.order_status).toBe('paid');
    expect(db.updates[0].v.status).toBe('paid');
    expect(db.upserts[0].table).toBe('payment_transactions');
  });

  it('APPROVED con monto distinto al total devuelve 422', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed({ amount: 1000 }) }, r);
    expect(r.code).toBe(422);
    expect(db.updates).toHaveLength(0);
  });

  it('DECLINED cancela la orden pendiente', async () => {
    const r = res();
    await handler({ method: 'POST', body: signed({ status: 'DECLINED' }) }, r);
    expect(r.code).toBe(200);
    expect(r.body.order_status).toBe('cancelled');
  });

  it('DECLINED no degrada una orden ya pagada', async () => {
    db.online_orders.status = 'paid';
    const r = res();
    await handler({ method: 'POST', body: signed({ status: 'DECLINED' }) }, r);
    expect(r.body.order_status).toBe('paid');
  });
});

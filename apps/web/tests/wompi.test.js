import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// --- Supabase mock (chainable query builder with per-table handlers) ---
const db = { tables: {}, calls: [] };
function builder(table) {
  const q = { table, ops: [] };
  const api = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return undefined;
      return (...args) => {
        q.ops.push([prop, args]);
        if (['single', 'maybeSingle'].includes(prop)) {
          return Promise.resolve(db.tables[table]?.select ?? { data: null, error: null });
        }
        if (['update', 'insert', 'upsert'].includes(prop)) {
          db.calls.push({ table, op: prop, args });
          const res = Promise.resolve(db.tables[table]?.[prop] ?? { data: null, error: null });
          // allow chaining .eq() after update
          res.eq = () => res;
          return res;
        }
        return api;
      };
    },
  });
  return api;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: builder }) }));

const { default: webhook } = await import('../api/wompi/webhook.js');
const { default: signature } = await import('../api/wompi/signature.js');

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

const SECRET = 'test_events_secret';
function signedEvent(tx, { secret = SECRET, ts = 1700000000, props } = {}) {
  const properties = props ?? ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const payload = { event: 'transaction.updated', data: { transaction: { ...tx } }, timestamp: ts, sent_at: 'x' };
  const concat = properties.map((p) => String(p.split('.').reduce((o, k) => o?.[k], payload.data))).join('') + ts + secret;
  payload.signature = { properties, checksum: crypto.createHash('sha256').update(concat).digest('hex') };
  return payload;
}
const TX = { id: 'tx-1', reference: 'JM-1001', amount_in_cents: 15000000, currency: 'COP', status: 'APPROVED' };

beforeEach(() => {
  db.tables = {}; db.calls = [];
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  process.env.WOMPI_INTEGRITY_SECRET = 'integrity_secret';
  delete process.env.VITE_SUPABASE_URL;
  if (!process.env.DBG) vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

const post = (body) => ({ method: 'POST', body });

describe('wompi webhook', () => {
  it('rejects non-POST', async () => {
    const res = mockRes();
    await webhook({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
  it('rejects payload without signature (401)', async () => {
    const res = mockRes();
    await webhook(post({ data: { transaction: TX }, timestamp: 1 }), res);
    expect(res.statusCode).toBe(401);
  });
  it('rejects bad checksum (401)', async () => {
    const ev = signedEvent(TX, { secret: 'wrong' });
    const res = mockRes();
    await webhook(post(ev), res);
    expect(res.statusCode).toBe(401);
  });
  it('rejects signatures that omit required properties (400)', async () => {
    const ev = signedEvent(TX, { props: ['transaction.id'] });
    const res = mockRes();
    await webhook(post(ev), res);
    expect(res.statusCode).toBe(400);
  });
  it('rejects tampered amount after signing (401)', async () => {
    const ev = signedEvent(TX);
    ev.data.transaction.amount_in_cents = 1;
    const res = mockRes();
    await webhook(post(ev), res);
    expect(res.statusCode).toBe(401);
  });
  it('fails closed when events secret missing (500)', async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(500);
  });
  it('returns 404 for unknown order', async () => {
    db.tables.online_orders = { select: { data: null, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(404);
  });
  it('rejects APPROVED with amount mismatch (422)', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 999 }, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(422);
    expect(db.calls).toHaveLength(0);
  });
  it('marks order paid on valid APPROVED event', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 }, error: null } };
    db.tables.payment_transactions = { select: { data: null, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.order_status).toBe('paid');
    expect(db.calls.some((c) => c.table === 'online_orders' && c.op === 'update')).toBe(true);
    expect(db.calls.some((c) => c.table === 'payment_transactions' && c.op === 'upsert')).toBe(true);
  });
  it('is idempotent when order and tx already final', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'paid', total: 150000 }, error: null } };
    db.tables.payment_transactions = { select: { data: { id: 'p1', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' }, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(200);
    expect(db.calls).toHaveLength(0);
  });
  it('does not downgrade a paid order on later DECLINED', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'paid', total: 150000 }, error: null } };
    db.tables.payment_transactions = { select: { data: null, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent({ ...TX, id: 'tx-2', status: 'DECLINED' })), res);
    expect(res.body.order_status).toBe('paid');
  });
  it('cancels pending order on DECLINED', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 }, error: null } };
    db.tables.payment_transactions = { select: { data: null, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent({ ...TX, status: 'DECLINED' })), res);
    expect(res.body.order_status).toBe('cancelled');
  });
  it('blocks transaction id reuse with a different reference (409)', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 }, error: null } };
    db.tables.payment_transactions = { select: { data: { id: 'p1', order_id: 'o1', status: 'PENDING', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' }, error: null } };
    const res = mockRes();
    await webhook(post(signedEvent(TX)), res);
    expect(res.statusCode).toBe(409);
  });
});

describe('wompi integrity signature endpoint', () => {
  it('computes SHA-256(reference+cents+COP+secret) from the DB total, ignoring client amounts', async () => {
    db.tables.online_orders = { select: { data: { id: 'o1', order_number: 'JM-1001', total: 150000 }, error: null } };
    const res = mockRes();
    await signature({ method: 'POST', body: { reference: 'JM-1001', amount: 1 } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.amount_in_cents).toBe(15000000);
    expect(res.body.signature).toBe(
      crypto.createHash('sha256').update('JM-100115000000COPintegrity_secret').digest('hex')
    );
  });
  it('400 without reference/order_id', async () => {
    const res = mockRes();
    await signature({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
  });
  it('500 without integrity secret', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const res = mockRes();
    await signature({ method: 'POST', body: { reference: 'JM-1' } }, res);
    expect(res.statusCode).toBe(500);
  });
});

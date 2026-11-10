import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock en memoria de Supabase: sin red, sin secretos reales.
const db = { order: null, tx: null, updates: [], upserts: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        single: async () => ({ data: table === 'online_orders' ? db.order : null, error: db.order ? null : { message: 'nf' } }),
        maybeSingle: async () => ({ data: table === 'online_orders' ? db.order : db.tx, error: null }),
        update: (v) => { db.updates.push({ table, v }); return { eq: async () => ({ error: null }) }; },
        insert: async () => ({ error: null }),
        upsert: async (v) => { db.upserts.push(v); return { error: null }; },
      };
      return q;
    },
  }),
}));

const { default: webhook } = await import('../webhook.js');
const { default: signature } = await import('../signature.js');

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};
const EVENTS = 'test_events_secret';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const event = ({ status = 'APPROVED', amount = 15000000, ref = 'JM-1', checksum } = {}) => {
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const ts = 1700000000;
  const sum = checksum ?? sha(`tx1${status}${amount}${ts}${EVENTS}`);
  return {
    data: { transaction: { id: 'tx1', reference: ref, status, amount_in_cents: amount, currency: 'COP' } },
    timestamp: ts, signature: { properties: props, checksum: sum },
  };
};

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  process.env.WOMPI_EVENTS_SECRET = EVENTS; process.env.WOMPI_INTEGRITY_SECRET = 'integ';
  db.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 150000 };
  db.tx = null; db.updates = []; db.upserts = [];
});

describe('Wompi webhook', () => {
  it('rechaza método GET', async () => {
    const r = mkRes(); await webhook({ method: 'GET' }, r); expect(r.code).toBe(405);
  });
  it('rechaza checksum inválido (401)', async () => {
    const r = mkRes(); await webhook({ method: 'POST', body: event({ checksum: 'f'.repeat(64) }) }, r);
    expect(r.code).toBe(401); expect(db.updates).toHaveLength(0);
  });
  it('rechaza si faltan propiedades firmadas obligatorias', async () => {
    const e = event(); e.signature.properties = ['transaction.id'];
    const r = mkRes(); await webhook({ method: 'POST', body: e }, r); expect(r.code).toBe(400);
  });
  it('APPROVED con monto correcto marca la orden paid', async () => {
    const r = mkRes(); await webhook({ method: 'POST', body: event() }, r);
    expect(r.code).toBe(200); expect(r.body.order_status).toBe('paid');
    expect(db.upserts[0].status).toBe('APPROVED');
  });
  it('APPROVED con monto distinto es rechazado (422)', async () => {
    const r = mkRes(); await webhook({ method: 'POST', body: event({ amount: 100 }) }, r);
    expect(r.code).toBe(422); expect(db.updates).toHaveLength(0);
  });
  it('DECLINED cancela una orden pendiente', async () => {
    const r = mkRes(); await webhook({ method: 'POST', body: event({ status: 'DECLINED' }) }, r);
    expect(r.code).toBe(200); expect(r.body.order_status).toBe('cancelled');
  });
  it('DECLINED no cancela una orden ya pagada', async () => {
    db.order.status = 'paid';
    const r = mkRes(); await webhook({ method: 'POST', body: event({ status: 'DECLINED' }) }, r);
    expect(r.body.order_status).toBe('paid');
  });
  it('es idempotente si orden y transacción ya están finales', async () => {
    db.order.status = 'paid';
    db.tx = { order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx1', transaction_reference: 'JM-1' };
    const r = mkRes(); await webhook({ method: 'POST', body: event() }, r);
    expect(r.code).toBe(200); expect(db.updates).toHaveLength(0); expect(db.upserts).toHaveLength(0);
  });
  it('bloquea reutilizar wompi tx con otra referencia (409)', async () => {
    db.tx = { order_id: 'o1', status: 'PENDING', wompi_transaction_id: 'tx1', transaction_reference: 'OTHER' };
    const r = mkRes(); await webhook({ method: 'POST', body: event() }, r); expect(r.code).toBe(409);
  });
});

describe('Wompi signature', () => {
  it('firma SHA-256 con monto autoritativo de la orden (no del cliente)', async () => {
    const r = mkRes();
    await signature({ method: 'POST', body: { reference: 'JM-1', amount: 1 } }, r);
    expect(r.code).toBe(200);
    expect(r.body.amount_in_cents).toBe(15000000);
    expect(r.body.signature).toBe(sha('JM-1' + '15000000' + 'COP' + 'integ'));
  });
  it('400 sin reference/order_id y 500 sin secreto', async () => {
    let r = mkRes(); await signature({ method: 'POST', body: {} }, r); expect(r.code).toBe(400);
    delete process.env.WOMPI_INTEGRITY_SECRET;
    r = mkRes(); await signature({ method: 'POST', body: { reference: 'JM-1' } }, r); expect(r.code).toBe(500);
  });
});

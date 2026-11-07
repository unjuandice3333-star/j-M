import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Mock Supabase: configurable per test via `db`
const db = { order: null, tx: null, writes: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        single: async () => ({ data: db.order, error: db.order ? null : { message: 'nf' } }),
        maybeSingle: async () => ({ data: table === 'online_orders' ? db.order : db.tx, error: null }),
        update: (v) => { db.writes.push([table, 'update', v]); return { eq: async () => ({ error: null }) }; },
        insert: async (v) => { db.writes.push([table, 'insert', v]); return { error: null }; },
        upsert: async (v) => { db.writes.push([table, 'upsert', v]); return { error: null }; },
      };
      return q;
    },
  }),
}));

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

const UUID = '123e4567-e89b-42d3-a456-426614174000';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

describe('POST /api/wompi/signature', () => {
  let handler;
  beforeEach(async () => {
    process.env.WOMPI_INTEGRITY_SECRET = 'int_secret';
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    db.order = { id: UUID, order_number: 'JM-1001', total: 150000 };
    handler = (await import('../api/wompi/signature.js')).default;
  });

  it('rechaza métodos distintos de POST', async () => {
    const res = mkRes(); await handler({ method: 'GET' }, res);
    expect(res.code).toBe(405);
  });
  it('exige reference u order_id', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: {} }, res);
    expect(res.code).toBe(400);
  });
  it('firma con el monto autoritativo de la BD, no del cliente', async () => {
    const res = mkRes();
    await handler({ method: 'POST', body: { order_id: UUID, amount: 1 } }, res);
    expect(res.code).toBe(200);
    expect(res.body.amount_in_cents).toBe(15000000);
    expect(res.body.signature).toBe(sha('JM-1001' + '15000000' + 'COP' + 'int_secret'));
  });
  it('falla (500) sin WOMPI_INTEGRITY_SECRET', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const res = mkRes(); await handler({ method: 'POST', body: { order_id: UUID } }, res);
    expect(res.code).toBe(500);
  });
});

describe('POST /api/wompi/webhook', () => {
  let handler;
  const build = ({ status = 'APPROVED', amount = 15000000, secret = 'ev_secret', tamper = false } = {}) => {
    const payload = {
      event: 'transaction.updated', timestamp: 1700000000,
      data: { transaction: { id: 'tx-1', status, amount_in_cents: amount, reference: 'JM-1001', currency: 'COP' } },
      signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum: '' },
    };
    payload.signature.checksum = sha('tx-1' + status + amount + payload.timestamp + secret);
    if (tamper) payload.data.transaction.amount_in_cents = 1;
    return payload;
  };
  beforeEach(async () => {
    process.env.WOMPI_EVENTS_SECRET = 'ev_secret';
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
    db.order = { id: UUID, order_number: 'JM-1001', status: 'pending', total: 150000 };
    db.tx = null; db.writes = [];
    handler = (await import('../api/wompi/webhook.js')).default;
  });

  it('401 con checksum inválido', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: build({ secret: 'wrong' }) }, res);
    expect(res.code).toBe(401);
  });
  it('401 si el payload fue alterado tras firmar', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: build({ tamper: true }) }, res);
    expect(res.code).toBe(401);
  });
  it('400 si signature.properties omite campos obligatorios', async () => {
    const p = build(); p.signature.properties = ['transaction.id'];
    const res = mkRes(); await handler({ method: 'POST', body: p }, res);
    expect(res.code).toBe(400);
  });
  it('APPROVED marca la orden como paid y registra la transacción', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: build() }, res);
    expect(res.code).toBe(200);
    expect(res.body.order_status).toBe('paid');
    expect(db.writes.some(([t, op]) => t === 'payment_transactions' && op === 'upsert')).toBe(true);
  });
  it('422 si el monto firmado no coincide con el total de la orden', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: build({ amount: 100 }) }, res);
    expect(res.code).toBe(422);
    expect(db.writes.length).toBe(0);
  });
  it('DECLINED cancela una orden pendiente', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: build({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('cancelled');
  });
  it('DECLINED no revierte una orden ya pagada', async () => {
    db.order.status = 'paid';
    const res = mkRes(); await handler({ method: 'POST', body: build({ status: 'DECLINED' }) }, res);
    expect(res.body.order_status).toBe('paid');
  });
  it('es idempotente si orden y transacción ya están finales', async () => {
    db.order.status = 'paid'; db.tx = { id: 1, order_id: UUID, status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' };
    const res = mkRes(); await handler({ method: 'POST', body: build() }, res);
    expect(res.code).toBe(200); expect(db.writes.length).toBe(0);
  });
});

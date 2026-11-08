import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

let order = { id: 'o1', order_number: 'JM-100', total: 119000 };
vi.mock('@supabase/supabase-js', () => {
  const chain = {
    select: () => chain, eq: () => chain, or: () => chain,
    single: async () => ({ data: order, error: order ? null : { message: 'x' } }),
    maybeSingle: async () => ({ data: order, error: null }),
  };
  return { createClient: () => ({ from: () => chain, rpc: async () => ({ data: null, error: null }) }) };
});

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity';
  process.env.WOMPI_EVENTS_SECRET = 'test_events';
  order = { id: 'o1', order_number: 'JM-100', total: 119000 };
});

describe('/api/wompi/signature', () => {
  it('firma SHA-256 con monto del servidor, no del cliente', async () => {
    const { default: handler } = await import('../api/wompi/signature.js');
    const res = mkRes();
    await handler({ method: 'POST', body: { reference: 'JM-100', amount_in_cents: 1 } }, res);
    expect(res.code).toBe(200);
    expect(res.body.amount_in_cents).toBe(11900000);
    const expected = crypto.createHash('sha256').update('JM-10011900000COPtest_integrity').digest('hex');
    expect(res.body.signature).toBe(expected);
  });
  it('rechaza método GET y body vacío', async () => {
    const { default: handler } = await import('../api/wompi/signature.js');
    const r1 = mkRes(); await handler({ method: 'GET' }, r1); expect(r1.code).toBe(405);
    const r2 = mkRes(); await handler({ method: 'POST', body: {} }, r2); expect(r2.code).toBe(400);
  });
});

describe('/api/wompi/webhook firma', () => {
  const event = (checksum, props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']) => ({
    timestamp: 1700000000,
    signature: { checksum, properties: props },
    data: { transaction: { id: 'tx1', status: 'APPROVED', amount_in_cents: 11900000, reference: 'JM-100' } },
  });
  it('rechaza checksum inválido (401)', async () => {
    const { default: handler } = await import('../api/wompi/webhook.js');
    const res = mkRes();
    await handler({ method: 'POST', body: event('deadbeef') }, res);
    expect(res.code).toBe(401);
  });
  it('rechaza properties sin campos obligatorios (400)', async () => {
    const { default: handler } = await import('../api/wompi/webhook.js');
    const res = mkRes();
    await handler({ method: 'POST', body: event('x', ['transaction.id']) }, res);
    expect(res.code).toBe(400);
  });
  it('rechaza GET (405) y body ausente', async () => {
    const { default: handler } = await import('../api/wompi/webhook.js');
    const r1 = mkRes(); await handler({ method: 'GET' }, r1); expect(r1.code).toBe(405);
    const r2 = mkRes(); await handler({ method: 'POST', body: null }, r2); expect(r2.code).toBe(400);
  });
});

describe('/api/wompi/webhook monto', () => {
  it('rechaza APPROVED con monto distinto al total de la orden (422)', async () => {
    const { default: handler } = await import('../api/wompi/webhook.js');
    const ts = 1700000000;
    const amount = 100; // distinto a 11900000
    const sum = crypto.createHash('sha256').update(`tx1APPROVED${amount}${ts}test_events`).digest('hex');
    const body = {
      timestamp: ts,
      signature: { checksum: sum, properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'] },
      data: { transaction: { id: 'tx1', status: 'APPROVED', amount_in_cents: amount, reference: 'JM-100', currency: 'COP' } },
    };
    const res = mkRes();
    await handler({ method: 'POST', body }, res);
    expect(res.code).toBe(422);
  });
});

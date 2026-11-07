import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, existingTx: null };
vi.mock('@supabase/supabase-js', () => {
  const chain = (table) => {
    const c = {
      select: () => c, eq: () => c, or: () => c, insert: () => Promise.resolve({ error: null }),
      update: () => c, upsert: () => Promise.resolve({ error: null }),
      single: () => Promise.resolve(table === 'online_orders' && state.order ? { data: state.order, error: null } : { data: null, error: { message: 'nf' } }),
      maybeSingle: () => Promise.resolve({ data: table === 'online_orders' ? state.order : state.existingTx, error: null }),
      then: (r) => r({ error: null }),
    };
    return c;
  };
  return { createClient: () => ({ from: chain, rpc: () => Promise.resolve({ data: null, error: null }) }) };
});

const SECRET = 'test_events_secret';
const mkRes = () => {
  const r = { code: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};
const sign = (props, data, ts) => {
  const s = props.map((p) => p.split('.').reduce((o, k) => o?.[k], data)).join('') + ts + SECRET;
  return crypto.createHash('sha256').update(s).digest('hex');
};
const event = (over = {}, checksumOverride) => {
  const data = { transaction: { id: 'tx1', reference: 'JM-1', amount_in_cents: 5000000, status: 'APPROVED', currency: 'COP', ...over } };
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const timestamp = 1700000000;
  return { event: 'transaction.updated', data, timestamp, signature: { properties, checksum: checksumOverride ?? sign(properties, data, timestamp) } };
};

describe('Wompi webhook', () => {
  let handler;
  beforeEach(async () => {
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.WOMPI_EVENTS_SECRET = SECRET;
    state.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 50000 };
    state.existingTx = null;
    handler = (await import('../api/wompi/webhook.js')).default;
  });

  it('rechaza métodos distintos de POST', async () => {
    const res = mkRes(); await handler({ method: 'GET' }, res); expect(res.code).toBe(405);
  });
  it('rechaza payload sin firma (401)', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: { data: {} } }, res); expect(res.code).toBe(401);
  });
  it('rechaza checksum inválido (401)', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: event({}, 'a'.repeat(64)) }, res); expect(res.code).toBe(401);
  });
  it('rechaza firma que omite propiedades obligatorias (400)', async () => {
    const e = event(); e.signature.properties = ['transaction.id'];
    const res = mkRes(); await handler({ method: 'POST', body: e }, res); expect(res.code).toBe(400);
  });
  it('rechaza monto distinto al de la orden (422)', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: event({ amount_in_cents: 100 }) }, res); expect(res.code).toBe(422);
  });
  it('rechaza moneda distinta de COP (422)', async () => {
    const res = mkRes(); await handler({ method: 'POST', body: event({ currency: 'USD' }) }, res); expect(res.code).toBe(422);
  });
  it('404 si la orden no existe', async () => {
    state.order = null;
    const res = mkRes(); await handler({ method: 'POST', body: event() }, res); expect(res.code).toBe(404);
  });
  it('409 si la transacción ya pertenece a otra referencia', async () => {
    state.existingTx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx1', transaction_reference: 'OTRA' };
    const res = mkRes(); await handler({ method: 'POST', body: event() }, res); expect(res.code).toBe(409);
  });
  it('falla cerrado (500) sin WOMPI_EVENTS_SECRET', async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    const res = mkRes(); await handler({ method: 'POST', body: event() }, res); expect(res.code).toBe(500);
  });
});

describe('Wompi signature endpoint', () => {
  it('firma con el total autoritativo de la orden, no del cliente', async () => {
    process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.WOMPI_INTEGRITY_SECRET = 'integ';
    state.order = { id: 'o1', order_number: 'JM-1', total: 50000 };
    const handler = (await import('../api/wompi/signature.js')).default;
    const res = mkRes();
    await handler({ method: 'POST', body: { reference: 'JM-1', amount: 1 } }, res);
    expect(res.code).toBe(200);
    expect(res.body.amount_in_cents).toBe(5000000);
    expect(res.body.signature).toBe(crypto.createHash('sha256').update('JM-15000000COPinteg').digest('hex'));
  });
  it('400 sin reference ni order_id', async () => {
    const handler = (await import('../api/wompi/signature.js')).default;
    const res = mkRes(); await handler({ method: 'POST', body: {} }, res); expect(res.code).toBe(400);
  });
});

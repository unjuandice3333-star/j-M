import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRes, sha256, fakeSupabase } from './helpers.js';

let fake;
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
const { default: handler } = await import('../webhook.js');

const SECRET = 'events_secret';
function event({ status = 'APPROVED', amount = 12990000, ref = 'JM-1001', id = 'tx-1', secret = SECRET, tamper } = {}) {
  const ts = 1700000000;
  const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const checksum = sha256(id + status + amount + ts + secret);
  const ev = { event: 'transaction.updated', timestamp: ts,
    data: { transaction: { id, status, amount_in_cents: amount, reference: ref, currency: 'COP' } },
    signature: { properties: props, checksum } };
  if (tamper) tamper(ev);
  return ev;
}
const order = (status = 'pending') => ({ data: { id: 'o1', order_number: 'JM-1001', status, total: 129900 }, error: null });

beforeEach(() => {
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  fake = fakeSupabase({ online_orders: { maybeSingle: order() }, payment_transactions: { maybeSingle: { data: null, error: null } } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
const run = async (body) => { const res = mockRes(); await handler({ method: 'POST', body }, res); return res; };

describe('POST /api/wompi/webhook', () => {
  it('rechaza payload sin firma (401)', async () => {
    expect((await run({ data: {} })).statusCode).toBe(401);
  });
  it('rechaza checksum inválido (401)', async () => {
    expect((await run(event({ tamper: (e) => { e.signature.checksum = 'bad'; } }))).statusCode).toBe(401);
  });
  it('rechaza firma hecha con otro secreto (401)', async () => {
    expect((await run(event({ secret: 'otro' }))).statusCode).toBe(401);
  });
  it('rechaza si la firma no cubre amount_in_cents (400)', async () => {
    const ev = event({ tamper: (e) => { e.signature.properties = ['transaction.id', 'transaction.status']; } });
    expect((await run(ev)).statusCode).toBe(400);
  });
  it('APPROVED válido marca el pedido como paid', async () => {
    const res = await run(event());
    expect(res.statusCode).toBe(200);
    expect(res.body.order_status).toBe('paid');
    expect(fake.calls.some(([t, op, v]) => t === 'online_orders' && op === 'update' && v.status === 'paid')).toBe(true);
    expect(fake.calls.some(([t, op]) => t === 'payment_transactions' && op === 'upsert')).toBe(true);
  });
  it('monto distinto al total de la orden es rechazado (422)', async () => {
    expect((await run(event({ amount: 100 }))).statusCode).toBe(422);
  });
  it('DECLINED cancela un pedido pendiente', async () => {
    const res = await run(event({ status: 'DECLINED' }));
    expect(res.body.order_status).toBe('cancelled');
  });
  it('DECLINED no revierte un pedido ya pagado', async () => {
    fake = fakeSupabase({ online_orders: { maybeSingle: order('paid') }, payment_transactions: { maybeSingle: { data: null, error: null } } });
    const res = await run(event({ status: 'DECLINED' }));
    expect(res.body.order_status).toBe('paid');
  });
  it('idempotente: evento repetido no muta', async () => {
    fake = fakeSupabase({ online_orders: { maybeSingle: order('paid') },
      payment_transactions: { maybeSingle: { data: { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' }, error: null } } });
    const res = await run(event());
    expect(res.statusCode).toBe(200);
    expect(fake.calls.length).toBe(0);
  });
  it('anti-secuestro: tx ya ligada a otra referencia (409)', async () => {
    fake = fakeSupabase({ online_orders: { maybeSingle: order() },
      payment_transactions: { maybeSingle: { data: { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' }, error: null } } });
    expect((await run(event())).statusCode).toBe(409);
  });
  it('referencia desconocida (404)', async () => {
    fake = fakeSupabase({ online_orders: { maybeSingle: { data: null, error: null } } });
    expect((await run(event())).statusCode).toBe(404);
  });
});

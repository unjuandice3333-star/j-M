import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const state = { order: null, tx: null, calls: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const q = {
        select: () => q, eq: () => q, or: () => q,
        maybeSingle: async () => ({ data: table === 'online_orders' ? state.order : state.tx, error: null }),
        update: (v) => { state.calls.push([table, 'update', v]); return q; },
        insert: async (v) => { state.calls.push([table, 'insert', v]); return { error: null }; },
        upsert: async (v) => { state.calls.push([table, 'upsert', v]); return { error: null }; },
        then: (r) => r({ error: null }),
      };
      return q;
    },
  }),
}));

const SECRET = 'test_events_secret';
const { default: handler } = await import('../api/wompi/webhook.js');

function makeEvent({ status = 'APPROVED', amount = 15000000, ref = 'JM-1001', id = 'tx-1', secret = SECRET, props } = {}) {
  const properties = props || ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const data = { transaction: { id, status, amount_in_cents: amount, reference: ref, currency: 'COP' } };
  const timestamp = 1700000000;
  const concat = `${id}${status}${amount}${timestamp}${secret}`;
  const checksum = crypto.createHash('sha256').update(concat).digest('hex');
  return { event: 'transaction.updated', data, timestamp, signature: { properties, checksum } };
}
function run(body, method = 'POST') {
  const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method, body }, res).then(() => res);
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.WOMPI_EVENTS_SECRET = SECRET;
  state.order = { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 };
  state.tx = null; state.calls = [];
});

describe('Wompi webhook', () => {
  it('rechaza GET', async () => expect((await run({}, 'GET')).code).toBe(405));
  it('rechaza checksum inválido (401)', async () => expect((await run(makeEvent({ secret: 'wrong' }))).code).toBe(401));
  it('rechaza firma sin propiedades obligatorias (400)', async () => expect((await run(makeEvent({ props: ['transaction.id'] }))).code).toBe(400));
  it('rechaza payload sin firma (401)', async () => expect((await run({ data: {} })).code).toBe(401));
  it('APPROVED con monto correcto marca pedido paid', async () => {
    const r = await run(makeEvent());
    expect(r.code).toBe(200); expect(r.body.order_status).toBe('paid');
    expect(state.calls.some(c => c[0] === 'online_orders' && c[2].status === 'paid')).toBe(true);
  });
  it('APPROVED con monto distinto -> 422 y sin mutaciones', async () => {
    const r = await run(makeEvent({ amount: 100 }));
    expect(r.code).toBe(422); expect(state.calls.length).toBe(0);
  });
  it('DECLINED cancela pedido pendiente', async () => {
    const r = await run(makeEvent({ status: 'DECLINED' }));
    expect(r.code).toBe(200); expect(r.body.order_status).toBe('cancelled');
  });
  it('DECLINED no cancela un pedido ya pagado', async () => {
    state.order.status = 'paid';
    const r = await run(makeEvent({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('paid');
  });
  it('idempotente: evento repetido no muta', async () => {
    state.order.status = 'paid';
    state.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' };
    const r = await run(makeEvent());
    expect(r.code).toBe(200); expect(state.calls.length).toBe(0);
  });
  it('anti-secuestro: tx ya ligada a otra referencia -> 409', async () => {
    state.tx = { id: 't', order_id: 'o1', status: 'PENDING', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' };
    expect((await run(makeEvent())).code).toBe(409);
  });
  it('orden inexistente -> 404', async () => { state.order = null; expect((await run(makeEvent())).code).toBe(404); });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const db = { order: null, tx: null, calls: [] };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        maybeSingle: async () => ({
          data: table === 'online_orders' ? db.order : db.tx,
          error: null,
        }),
        update: (v) => { db.calls.push([table, 'update', v]); return { eq: async () => ({ error: null }) }; },
        insert: async (v) => { db.calls.push([table, 'insert', v]); return { error: null }; },
        upsert: async (v) => { db.calls.push([table, 'upsert', v]); return { error: null }; },
      };
      return chain;
    },
  }),
}));

import handler from '../api/wompi/webhook.js';

const SECRET = 'test_events_secret';
const PROPS = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];

function event({ status = 'APPROVED', amount = 5000000, id = 'tx-1', ref = 'JM-1', props = PROPS, secret = SECRET } = {}) {
  const payload = {
    timestamp: 1700000000,
    data: { transaction: { id, status, amount_in_cents: amount, reference: ref, currency: 'COP' } },
    signature: { properties: props, checksum: '' },
  };
  const str = props.map((p) => payload.data.transaction[p.split('.')[1]]).join('') + payload.timestamp + secret;
  payload.signature.checksum = crypto.createHash('sha256').update(str).digest('hex');
  return payload;
}

function run(body, method = 'POST') {
  const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  return handler({ method, body }, res).then(() => res);
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  db.order = { id: 'o1', order_number: 'JM-1', status: 'pending', total: 50000 };
  db.tx = null;
  db.calls = [];
});

describe('Wompi webhook', () => {
  it('rechaza métodos distintos de POST', async () => {
    expect((await run({}, 'GET')).code).toBe(405);
  });
  it('rechaza firma ausente', async () => {
    expect((await run({ data: {} })).code).toBe(401);
  });
  it('rechaza checksum inválido', async () => {
    const e = event(); e.signature.checksum = 'a'.repeat(64);
    expect((await run(e)).code).toBe(401);
    expect(db.calls).toHaveLength(0);
  });
  it('rechaza evento firmado con otro secreto', async () => {
    expect((await run(event({ secret: 'otro' }))).code).toBe(401);
  });
  it('rechaza si signature.properties omite propiedades obligatorias', async () => {
    expect((await run(event({ props: ['transaction.id'] }))).code).toBe(400);
  });
  it('APPROVED con monto correcto marca la orden como paid', async () => {
    const r = await run(event());
    expect(r.code).toBe(200);
    expect(r.body.order_status).toBe('paid');
    expect(db.calls.some(([t, op, v]) => t === 'online_orders' && op === 'update' && v.status === 'paid')).toBe(true);
  });
  it('APPROVED con monto manipulado devuelve 422 sin mutar', async () => {
    const r = await run(event({ amount: 100 }));
    expect(r.code).toBe(422);
    expect(db.calls).toHaveLength(0);
  });
  it('DECLINED cancela una orden pendiente', async () => {
    const r = await run(event({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('cancelled');
  });
  it('DECLINED no revierte una orden ya pagada', async () => {
    db.order.status = 'paid';
    const r = await run(event({ status: 'DECLINED' }));
    expect(r.body.order_status).toBe('paid');
  });
  it('es idempotente si orden y transacción ya están finales', async () => {
    db.order.status = 'paid';
    db.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1' };
    const r = await run(event());
    expect(r.code).toBe(200);
    expect(r.body.message).toMatch(/Idempotente/);
    expect(db.calls).toHaveLength(0);
  });
  it('409 si el id de Wompi ya pertenece a otra referencia', async () => {
    db.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-999' };
    expect((await run(event())).code).toBe(409);
  });
  it('404 si la orden no existe', async () => {
    db.order = null;
    expect((await run(event())).code).toBe(404);
  });
});

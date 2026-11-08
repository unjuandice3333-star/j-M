// Pruebas del webhook Wompi (Sandbox). Ejecutar: pnpm --filter @jm/web test
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const db = { order: null, tx: null, updates: [], upserts: [], events: [] };

function builder(table) {
  const q = {
    select: () => q, eq: () => q, or: () => q,
    maybeSingle: async () => ({ data: table === 'online_orders' ? db.order : db.tx, error: null }),
    update: (v) => { db.updates.push(v); return { eq: async () => ({ error: null }) }; },
    upsert: async (v) => { db.upserts.push(v); return { error: null }; },
    insert: async (v) => { db.events.push(v); return { error: null }; },
  };
  return q;
}
mock.module('@supabase/supabase-js', {
  namedExports: { createClient: () => ({ from: builder }) },
});

const { default: handler } = await import('../api/wompi/webhook.js');

const SECRET = 'test_events_secret';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.WOMPI_EVENTS_SECRET = SECRET;

function makeRes() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

function event({ status = 'APPROVED', amount = 15000000, ref = 'JM-1001', id = 'tx-1', currency = 'COP', tamper } = {}) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const timestamp = 1700000000;
  const checksum = crypto.createHash('sha256')
    .update(`${id}${status}${amount}${timestamp}${SECRET}`).digest('hex');
  const p = {
    event: 'transaction.updated', timestamp,
    signature: { properties, checksum },
    data: { transaction: { id, status, amount_in_cents: amount, reference: ref, currency, payment_method_type: 'CARD' } },
  };
  if (tamper) tamper(p);
  return p;
}
const call = async (body, method = 'POST') => { const res = makeRes(); await handler({ method, body }, res); return res; };

beforeEach(() => {
  db.order = { id: 'o1', order_number: 'JM-1001', status: 'pending', total: 150000 };
  db.tx = null; db.updates = []; db.upserts = []; db.events = [];
});

test('rechaza métodos distintos de POST', async () => {
  assert.equal((await call(null, 'GET')).code, 405);
});
test('rechaza payload sin firma', async () => {
  const e = event(); delete e.signature;
  assert.equal((await call(e)).code, 401);
});
test('rechaza checksum inválido', async () => {
  const e = event({ tamper: (p) => { p.signature.checksum = 'a'.repeat(64); } });
  assert.equal((await call(e)).code, 401);
});
test('rechaza monto alterado tras firmar (checksum no coincide)', async () => {
  const e = event({ tamper: (p) => { p.data.transaction.amount_in_cents = 100; } });
  assert.equal((await call(e)).code, 401);
});
test('rechaza signature.properties incompleto', async () => {
  const e = event({ tamper: (p) => { p.signature.properties = ['transaction.id']; } });
  assert.equal((await call(e)).code, 400);
});
test('APPROVED válido marca pedido como paid y registra transacción', async () => {
  const res = await call(event());
  assert.equal(res.code, 200);
  assert.equal(res.body.order_status, 'paid');
  assert.equal(db.updates[0].status, 'paid');
  assert.equal(db.upserts[0].wompi_transaction_id, 'tx-1');
});
test('monto firmado válido pero distinto al total del pedido -> 422', async () => {
  const res = await call(event({ amount: 100 }));
  assert.equal(res.code, 422);
  assert.equal(db.updates.length, 0);
});
test('moneda distinta de COP -> 422', async () => {
  assert.equal((await call(event({ currency: 'USD' }))).code, 422);
});
test('DECLINED cancela pedido pendiente', async () => {
  const res = await call(event({ status: 'DECLINED' }));
  assert.equal(res.body.order_status, 'cancelled');
});
test('DECLINED no revierte un pedido ya pagado', async () => {
  db.order.status = 'paid';
  const res = await call(event({ status: 'DECLINED' }));
  assert.equal(res.body.order_status, 'paid');
  assert.equal(db.updates.length, 0);
});
test('evento repetido es idempotente (sin mutaciones)', async () => {
  db.order.status = 'paid';
  db.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-1001' };
  const res = await call(event());
  assert.equal(res.code, 200);
  assert.equal(db.updates.length + db.upserts.length, 0);
});
test('tx de Wompi reutilizada con otra referencia -> 409', async () => {
  db.tx = { id: 't', order_id: 'o1', status: 'APPROVED', wompi_transaction_id: 'tx-1', transaction_reference: 'JM-OTHER' };
  assert.equal((await call(event())).code, 409);
});
test('orden inexistente -> 404', async () => {
  db.order = null;
  assert.equal((await call(event())).code, 404);
});

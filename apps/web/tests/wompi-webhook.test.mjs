import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../api/wompi/webhook.js';

const SECRET = 'test_events_secret';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-tests';
process.env.WOMPI_EVENTS_SECRET = SECRET;

function mkRes() {
  const r = { code: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

function signedPayload({ props, tamper } = {}) {
  const timestamp = 1700000000;
  const properties = props || ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const data = { transaction: { id: 'tx1', status: 'APPROVED', amount_in_cents: 100000, reference: 'JM-1', currency: 'COP' } };
  const str = properties.map((p) => p.split('.').reduce((o, k) => o?.[k], data)).join('') + timestamp + SECRET;
  const checksum = crypto.createHash('sha256').update(str).digest('hex');
  if (tamper) data.transaction.amount_in_cents = 1;
  return { event: 'transaction.updated', data, timestamp, signature: { properties, checksum } };
}

const call = async (method, body) => { const res = mkRes(); await handler({ method, body }, res); return res; };

test('rechaza métodos distintos de POST', async () => {
  assert.equal((await call('GET')).code, 405);
});
test('rechaza payload sin firma', async () => {
  assert.equal((await call('POST', { data: {} })).code, 401);
});
test('rechaza firma que omite propiedades obligatorias', async () => {
  const p = signedPayload({ props: ['transaction.id'] });
  assert.equal((await call('POST', p)).code, 400);
});
test('rechaza payload alterado (checksum inválido)', async () => {
  assert.equal((await call('POST', signedPayload({ tamper: true }))).code, 401);
});

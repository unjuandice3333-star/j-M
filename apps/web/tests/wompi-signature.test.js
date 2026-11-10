import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/wompi/signature.js';

const mkRes = () => {
  const r = { headers: {}, code: null, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
};

test('OPTIONS responde 200', async () => {
  const res = mkRes();
  await handler({ method: 'OPTIONS' }, res);
  assert.equal(res.code, 200);
});

test('GET rechazado con 405', async () => {
  const res = mkRes();
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 405);
});

test('POST sin reference/order_id da 400', async () => {
  const res = mkRes();
  await handler({ method: 'POST', body: {} }, res);
  assert.equal(res.code, 400);
});

test('POST sin WOMPI_INTEGRITY_SECRET da 500 sin filtrar secretos', async () => {
  const prev = process.env.WOMPI_INTEGRITY_SECRET;
  delete process.env.WOMPI_INTEGRITY_SECRET;
  const res = mkRes();
  await handler({ method: 'POST', body: { reference: 'JM-1' } }, res);
  if (prev !== undefined) process.env.WOMPI_INTEGRITY_SECRET = prev;
  assert.equal(res.code, 500);
});

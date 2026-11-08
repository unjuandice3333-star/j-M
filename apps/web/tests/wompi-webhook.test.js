import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => { throw new Error('DB should not be reached'); } }) }));

const SECRET = 'test_events_secret';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function mockRes() {
  const res = { headers: {}, statusCode: 0, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

function signedPayload(overrides = {}, props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], secret = SECRET) {
  const data = { transaction: { id: 'tx1', status: 'APPROVED', amount_in_cents: 1000000, reference: 'JM-1', currency: 'COP' } };
  const timestamp = 1700000000;
  const concat = props.map((p) => p.split('.').reduce((o, k) => o?.[k], data)).join('') + timestamp + secret;
  return { data, timestamp, signature: { properties: props, checksum: sha(concat) }, ...overrides };
}

let handler;
beforeEach(async () => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
  handler = (await import('../api/wompi/webhook.js')).default;
});

describe('wompi webhook security', () => {
  it('rejects non-POST', async () => {
    const res = mockRes(); await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
  it('500 when events secret missing', async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    const res = mockRes(); await handler({ method: 'POST', body: signedPayload() }, res);
    expect(res.statusCode).toBe(500);
  });
  it('401 when signature missing', async () => {
    const res = mockRes(); await handler({ method: 'POST', body: { data: {}, timestamp: 1 } }, res);
    expect(res.statusCode).toBe(401);
  });
  it('401 on bad checksum', async () => {
    const p = signedPayload(); p.signature.checksum = 'a'.repeat(64);
    const res = mockRes(); await handler({ method: 'POST', body: p }, res);
    expect(res.statusCode).toBe(401);
  });
  it('401 when payload tampered after signing', async () => {
    const p = signedPayload(); p.data.transaction.amount_in_cents = 1;
    const res = mockRes(); await handler({ method: 'POST', body: p }, res);
    expect(res.statusCode).toBe(401);
  });
  it('400 when required signed properties are omitted', async () => {
    const p = signedPayload({}, ['transaction.id']);
    const res = mockRes(); await handler({ method: 'POST', body: p }, res);
    expect(res.statusCode).toBe(400);
  });
  it('401 when signed with wrong secret', async () => {
    const p = signedPayload({}, undefined, 'other');
    const res = mockRes(); await handler({ method: 'POST', body: p }, res);
    expect(res.statusCode).toBe(401);
  });
  it('valid signature passes verification (reaches DB layer)', async () => {
    const res = mockRes();
    await expect(handler({ method: 'POST', body: signedPayload() }, res)).resolves.toBeDefined();
    // Past signature gate: either 500 (mock DB throws) — never 401/400
    expect([401, 400]).not.toContain(res.statusCode);
  });
});

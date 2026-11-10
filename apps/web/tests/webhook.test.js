import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));

import handler from '../api/wompi/webhook.js';

const SECRET = 'test_events_secret';

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

function signedPayload(overrides = {}, props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']) {
  const transaction = { id: 'tx1', status: 'APPROVED', amount_in_cents: 100000, reference: 'JM-1', currency: 'COP', ...overrides };
  const timestamp = 1700000000;
  const payload = { event: 'transaction.updated', data: { transaction }, timestamp, signature: { properties: props, checksum: '' } };
  const concat = props.map((p) => String(p.split('.').reduce((o, k) => o?.[k], payload.data))).join('') + timestamp + SECRET;
  payload.signature.checksum = crypto.createHash('sha256').update(concat).digest('hex');
  return payload;
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
  process.env.WOMPI_EVENTS_SECRET = SECRET;
});

describe('wompi webhook security', () => {
  it('rejects non-POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });
  it('fails closed when events secret missing', async () => {
    delete process.env.WOMPI_EVENTS_SECRET;
    const res = mockRes();
    await handler({ method: 'POST', body: signedPayload() }, res);
    expect(res.statusCode).toBe(500);
  });
  it('rejects payload without signature', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { data: {} } }, res);
    expect(res.statusCode).toBe(401);
  });
  it('rejects signature missing required properties', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: signedPayload({}, ['transaction.id']) }, res);
    expect(res.statusCode).toBe(400);
  });
  it('rejects tampered amount (bad checksum)', async () => {
    const p = signedPayload();
    p.data.transaction.amount_in_cents = 1;
    const res = mockRes();
    await handler({ method: 'POST', body: p }, res);
    expect(res.statusCode).toBe(401);
  });
  it('accepts valid signature and proceeds to order lookup (404 when unknown order)', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: signedPayload() }, res);
    expect(res.statusCode).toBe(404);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

let orderResult;
vi.mock('@supabase/supabase-js', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => orderResult,
  };
  return { createClient: () => ({ from: () => chain }) };
});

import handler from '../api/wompi/signature.js';

function mockRes() {
  const res = { headers: {}, statusCode: 0, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

describe('POST /api/wompi/signature', () => {
  beforeEach(() => {
    process.env.WOMPI_INTEGRITY_SECRET = 'test_integrity_secret';
    process.env.SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    orderResult = { data: { id: 'a', order_number: 'JM-1001', total: 125000 }, error: null };
  });

  it('rechaza métodos distintos de POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('exige reference u order_id', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
  });

  it('firma con el monto autoritativo de la BD (no del cliente)', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { reference: 'JM-1001', amount: 1 } }, res);
    expect(res.statusCode).toBe(200);
    const expected = crypto.createHash('sha256').update('JM-100112500000' + 'COP' + 'test_integrity_secret').digest('hex');
    expect(res.body.amount_in_cents).toBe(12500000);
    expect(res.body.signature).toBe(expected);
  });

  it('no filtra el secreto en la respuesta', async () => {
    const res = mockRes();
    await handler({ method: 'POST', body: { reference: 'JM-1001' } }, res);
    expect(JSON.stringify(res.body)).not.toContain('test_integrity_secret');
  });

  it('responde error si la orden no existe', async () => {
    orderResult = { data: null, error: { message: 'nf' } };
    const res = mockRes();
    await handler({ method: 'POST', body: { reference: 'nope' } }, res);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('500 si falta el secreto de integridad', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const res = mockRes();
    await handler({ method: 'POST', body: { reference: 'JM-1001' } }, res);
    expect(res.statusCode).toBe(500);
  });
});

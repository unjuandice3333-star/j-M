import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter, clientIp } from '../../api/_lib/rateLimit.js';
import { eventTimestampProblem, FUTURE_TOLERANCE_S, MAX_AGE_S } from '../../api/_lib/eventFreshness.js';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: (...a) => rpc(...a) }) }));

describe('eventTimestampProblem (webhook de Wompi)', () => {
  const now = 1_800_000_000_000; // ms
  const s = now / 1000;
  it('admite ahora, reintentos de horas y desfase de reloj hacia el futuro dentro de la tolerancia', () => {
    expect(eventTimestampProblem(s, now)).toBeNull();
    expect(eventTimestampProblem(s - 3 * 3600, now)).toBeNull();
    expect(eventTimestampProblem(s + FUTURE_TOLERANCE_S - 1, now)).toBeNull();
  });
  it('rechaza el futuro lejano y lo más antiguo que la ventana de reintentos', () => {
    expect(eventTimestampProblem(s + FUTURE_TOLERANCE_S + 5, now)).toBe('future');
    expect(eventTimestampProblem(s - MAX_AGE_S - 5, now)).toBe('too_old');
  });
  it('rechaza valores no numéricos, cero y negativos; acepta cadena numérica y milisegundos', () => {
    for (const bad of [undefined, null, 'ayer', '', 0, -5, NaN, {}, '12abc']) expect(eventTimestampProblem(bad, now)).toBe('invalid');
    expect(eventTimestampProblem(String(Math.floor(s)), now)).toBeNull();
    expect(eventTimestampProblem(now, now)).toBeNull();
  });
});

describe('createRateLimiter', () => {
  it('permite hasta el límite dentro de la ventana y luego bloquea indicando cuánto esperar', () => {
    let t = 1000; const check = createRateLimiter({ limit: 3, windowMs: 10_000, now: () => t });
    expect([1, 2, 3].map(() => check('a').allowed)).toEqual([true, true, true]);
    t = 4000; const r = check('a');
    expect(r.allowed).toBe(false); expect(r.retryAfterSeconds).toBe(7);
  });
  it('la ventana se desliza: tras expirar, vuelve a permitir; las claves son independientes', () => {
    let t = 0; const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(check('a').allowed).toBe(true); expect(check('b').allowed).toBe(true); expect(check('a').allowed).toBe(false);
    t = 1001; expect(check('a').allowed).toBe(true);
  });
  it('acota la memoria con muchísimas claves', () => {
    let t = 0; const check = createRateLimiter({ limit: 1, windowMs: 100, maxKeys: 50, now: () => t });
    for (let i = 0; i < 500; i++) { t += 1; check(`k${i}`); }
    expect(check('nuevo').allowed).toBe(true); // no se degradó
  });
  it('clientIp toma la primera IP de x-forwarded-for', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } })).toBe('1.2.3.4');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } })).toBe('9.9.9.9');
  });
});

describe('/api/wompi/signature: protección contra abuso (handler real, BD simulada)', () => {
  const ORDER = '11111111-1111-4111-8111-111111111111';
  const TOKEN = '22222222-2222-4222-8222-222222222222';
  let handler;
  const call = async (over = {}) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; return this; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await handler({ method: 'POST', headers: { 'x-forwarded-for': over.ip ?? '5.5.5.5' }, body: { order_id: over.order ?? ORDER, public_token: TOKEN } }, res);
    return res;
  };
  beforeEach(async () => {
    vi.resetModules(); rpc.mockReset();
    rpc.mockResolvedValue({ data: { reference: 'JM-1-1', amount_in_cents: 1000, currency: 'COP', order_number: 'JM-1', attempt_number: 1, payment_expires_at: null }, error: null });
    Object.assign(process.env, { APP_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'k', WOMPI_INTEGRITY_SECRET: 'test_integrity_x', WOMPI_PUBLIC_KEY: 'pub_test_x' });
    for (const k of ['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_GIT_COMMIT_REF']) delete process.env[k];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ({ default: handler } = await import('../../api/wompi/signature.js'));
  });
  it('el 7.º intento por minuto sobre el mismo pedido recibe 429 con Retry-After y NO llega a la BD', async () => {
    for (let i = 0; i < 6; i++) expect((await call()).code).toBe(200);
    const r = await call();
    expect(r.code).toBe(429); expect(r.body.code).toBe('RATE_LIMIT_ORDER'); expect(Number(r.headers['Retry-After'])).toBeGreaterThan(0);
    expect(rpc).toHaveBeenCalledTimes(6);
  });
  it('otro pedido desde la misma IP sigue funcionando hasta el límite por IP (30/min)', async () => {
    for (let i = 0; i < 30; i++) expect((await call({ order: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` })).code).toBe(200);
    const r = await call({ order: '33333333-3333-4333-8333-333333333333' });
    expect(r.code).toBe(429); expect(r.body.code).toBe('RATE_LIMIT_IP');
  });
  it('otra IP no se ve afectada', async () => {
    for (let i = 0; i < 6; i++) await call();
    expect((await call({ ip: '6.6.6.6', order: '44444444-4444-4444-8444-444444444444' })).code).toBe(200);
  });
  it('los parámetros inválidos se rechazan (400) antes de consumir el límite', async () => {
    const r = await call({ order: 'no-es-uuid' }); expect(r.code).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
});

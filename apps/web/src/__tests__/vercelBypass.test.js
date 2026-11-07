import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { deploymentHost, isDeploymentUrl, bypassHeadersFor, redactSecrets, cookiesFromSetCookie, fetchBypassCookies } from '../../e2e/playwright/vercelBypass.js';
import { sanitize, isSupabaseApi, describeRequest, entryFromResponse, explainCode, formatEntry } from '../../e2e/playwright/supabaseDiagnostics.js';

const BASE = 'https://jym-web-git-mission-team.vercel.app';
// Valores de prueba construidos en ejecución (sin literales con forma de secreto/JWT para no disparar el escáner de secretos).
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FAKE_JWT = [b64({ alg: 'HS256', typ: 'JWT' }), b64({ role: 'anon' }), 'f'.repeat(12)].join('.');
const FAKE_KEY = ['sb', 'secret', 'abcDEF123'].join('_');
const SECRET = ['valor', 'de', 'prueba', 'del', 'bypass'].join('-');

describe('bypass de Vercel: solo al hostname exacto del deployment', () => {
  it.each([
    'https://fonts.gstatic.com/s/inter/v13/x.woff2',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://abcdefghij.supabase.co/rest/v1/products',
    'https://www.googletagmanager.com/gtag/js',
    'https://jym-web-git-mission-team.vercel.app.evil.com/x',   // el host contiene al del deployment
    'https://evil-jym-web-git-mission-team.vercel.app/x',        // termina igual pero es otro host
    'http://jym-web-git-mission-team.vercel.app/x',              // mismo host, otro esquema
    'https://jym-web-git-mission-team.vercel.app:8443/x',        // otro puerto
  ])('NO recibe cabeceras de bypass: %s', (url) => {
    expect(bypassHeadersFor(url, BASE, SECRET)).toEqual({});
    expect(isDeploymentUrl(url, BASE)).toBe(false);
  });
  it('el deployment (cualquier ruta) sí las recibe; sin secreto, nunca', () => {
    expect(Object.keys(bypassHeadersFor(`${BASE}/api/wompi/signature`, BASE, SECRET)).sort()).toEqual(['x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie']);
    expect(bypassHeadersFor(`${BASE}/`, BASE, '')).toEqual({});
  });
  it('solo se admite https (o loopback para probar el mecanismo)', () => {
    expect(deploymentHost(BASE)).toBe('jym-web-git-mission-team.vercel.app');
    expect(deploymentHost('http://jym-web.vercel.app')).toBeNull();
    expect(deploymentHost('http://127.0.0.1:3000')).toBe('127.0.0.1:3000');
    expect(deploymentHost('no-es-url')).toBeNull();
  });
  it('redactSecrets elimina el secreto y los JWT de cualquier texto', () => {
    const out = redactSecrets(`falló con ${SECRET} y ${FAKE_JWT}`, SECRET);
    expect(out).not.toContain(SECRET); expect(out).not.toContain('eyJhbGci');
  });
  it('cookiesFromSetCookie limita la cookie al host del deployment', () => {
    const [c] = cookiesFromSetCookie(['_vercel_jwt=abc123; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Lax'], BASE);
    expect(c).toMatchObject({ name: '_vercel_jwt', value: 'abc123', domain: 'jym-web-git-mission-team.vercel.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
  });
});

describe('fetchBypassCookies contra un deployment protegido simulado (servidor local)', () => {
  let server;
  afterEach(() => new Promise((r) => (server ? server.close(r) : r())));
  const start = (handler) => new Promise((resolve) => { server = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)); });

  it('con el secreto correcto obtiene la cookie _vercel_jwt y el secreto NO se devuelve en el resultado', async () => {
    const seen = [];
    const base = await start((req, res) => {
      seen.push(req.headers['x-vercel-protection-bypass']);
      if (req.headers['x-vercel-protection-bypass'] === SECRET) { res.writeHead(200, { 'set-cookie': '_vercel_jwt=tok-abc; Path=/; HttpOnly' }); res.end('ok'); }
      else { res.writeHead(401); res.end('Authentication Required'); }
    });
    const r = await fetchBypassCookies({ baseURL: base, secret: SECRET });
    expect(r).toMatchObject({ ok: true, status: 200, hasVercelCookie: true });
    expect(r.cookies.map((c) => c.name)).toEqual(['_vercel_jwt']);
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(seen).toEqual([SECRET]);
  });
  it('con un secreto incorrecto informa 401 y explica la causa sin imprimir el secreto', async () => {
    const base = await start((req, res) => { res.writeHead(401); res.end('Authentication Required'); });
    const r = await fetchBypassCookies({ baseURL: base, secret: SECRET });
    expect(r.ok).toBe(false); expect(r.status).toBe(401);
    expect(r.reason).toMatch(/rechazó el secreto/); expect(JSON.stringify(r)).not.toContain(SECRET);
  });
  it('NO sigue una redirección hacia otro host con el secreto', async () => {
    const hits = [];
    const base = await start((req, res) => { hits.push(req.url); res.writeHead(302, { location: 'https://fonts.gstatic.com/x' }); res.end(); });
    const r = await fetchBypassCookies({ baseURL: base, secret: SECRET, fetchImpl: (u, o) => { if (!String(u).startsWith(base)) throw new Error(`salió hacia ${u}`); return fetch(u, o); } });
    expect(r.hasVercelCookie).toBeFalsy(); expect(hits.length).toBe(1);
  });
  it('sin secreto o con URL no segura no hace ninguna petición', async () => {
    let calls = 0; const f = () => { calls++; };
    expect((await fetchBypassCookies({ baseURL: BASE, secret: '', fetchImpl: f })).ok).toBe(false);
    expect((await fetchBypassCookies({ baseURL: 'http://x.vercel.app', secret: SECRET, fetchImpl: f })).ok).toBe(false);
    expect(calls).toBe(0);
  });
});

describe('diagnóstico de respuestas de Supabase', () => {
  it('reconoce la API y describe tabla, RPC y consulta sin la llave', () => {
    expect(isSupabaseApi('https://x.supabase.co/rest/v1/products?select=*')).toBe(true);
    expect(isSupabaseApi('https://fonts.gstatic.com/s/x.woff2')).toBe(false);
    expect(describeRequest('https://x.supabase.co/rest/v1/rpc/quote_cart?apikey=SECRETA')).toMatchObject({ kind: 'rpc', name: 'quote_cart', query: '' });
    expect(describeRequest('https://x.supabase.co/rest/v1/collections?select=slug&apikey=SECRETA').query).toBe('select=slug');
  });
  it('extrae código, mensaje, detalle y pista del cuerpo de un 404 y de un 400 de PostgREST', () => {
    const e404 = entryFromResponse({ url: 'https://x.supabase.co/rest/v1/shipping_methods?select=*', method: 'GET', status: 404,
      bodyText: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.shipping_methods' in the schema cache", details: null, hint: "Perhaps you meant the table 'public.shipments'" }) });
    expect(e404).toMatchObject({ status: 404, name: 'shipping_methods', code: 'PGRST205' });
    expect(e404.hint).toMatch(/shipments/); expect(e404.meaning).toMatch(/no existe en el esquema/);
    const e400 = entryFromResponse({ url: 'https://x.supabase.co/rest/v1/collections?select=a', method: 'GET', status: 400, bodyText: JSON.stringify({ code: '42703', message: 'column collections.kind does not exist', details: null, hint: null }) });
    expect(formatEntry(e400)).toMatch(/400 GET rest\/collections \[42703\].*undefined_column/);
  });
  it('sanitize quita JWT, llaves y correos de los cuerpos', () => {
    expect(sanitize(`x ${FAKE_JWT} y juan@correo.co ${FAKE_KEY}`)).toBe('x <jwt> y <correo> <llave>');
  });
  it('las respuestas correctas no llevan código ni mensaje', () => {
    expect(entryFromResponse({ url: 'https://x.supabase.co/rest/v1/products', method: 'GET', status: 200, bodyText: '' })).toEqual({ method: 'GET', status: 200, kind: 'rest', name: 'products', query: '' });
    expect(explainCode('PGRST200')).toMatch(/relación/);
  });
});

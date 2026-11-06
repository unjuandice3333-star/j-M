// M26-T3 — Pruebas de las guardas de configuración en ejecución (cliente y funciones de Vercel).
// node --test scripts/env/runtime_config.test.mjs
// Todos los valores con forma de llave/secreto se componen en tiempo de ejecución y son ficticios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readClientConfig, ConfigError, jwtRole } from '../../apps/web/src/config/clientConfig.js';
import { readServerConfig, requireServerConfig, clean } from '../../apps/web/api/_lib/serverConfig.js';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role })}.${'s'.repeat(43)}`;
const k = (...parts) => parts.join('');
const PUB_TEST = k('pub_', 'test_', 'a'.repeat(24));
const PUB_PROD = k('pub_', 'prod_', 'b'.repeat(24));
const INT_TEST = k('test_', 'integrity_', 'c'.repeat(24));
const INT_PROD = k('prod_', 'integrity_', 'd'.repeat(24));
const EVT_TEST = k('test_', 'events_', 'e'.repeat(24));
const EVT_PROD = k('prod_', 'events_', 'f'.repeat(24));
const HOST = 'r'.repeat(20) + '.supa' + 'base.co';

const client = (over = {}) => ({
  VITE_APP_ENV: 'local', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwt('anon'),
  VITE_WOMPI_PUBLIC_KEY: PUB_TEST, VITE_WOMPI_ENV: 'sandbox', ...over,
});
const problemsOf = (env) => { try { readClientConfig(env); return []; } catch (e) { assert.ok(e instanceof ConfigError); return e.problems; } };
const server = (over = {}) => ({
  APP_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
  WOMPI_PUBLIC_KEY: PUB_TEST, WOMPI_INTEGRITY_SECRET: INT_TEST, WOMPI_EVENTS_SECRET: EVT_TEST, ...over,
});
const ALL = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'];

// ============================================================ cliente (navegador)
test('cliente positivo: local, QA y producción coherentes', () => {
  assert.equal(readClientConfig(client({ VITE_APP_ENV: 'local' })).wompi.env, 'sandbox');
  assert.deepEqual(problemsOf(client({ VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://' + HOST })), []);
  assert.deepEqual(problemsOf(client({ VITE_APP_ENV: 'production', VITE_SUPABASE_URL: 'https://' + HOST, VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' })), []);
  // M26-R1 (MAJ-2): VITE_APP_ENV pasa a ser obligatoria en ejecución
  assert.ok(problemsOf(client({ VITE_APP_ENV: undefined })).some((p) => /^VITE_APP_ENV: obligatoria/.test(p)));
});
test('cliente positivo: la configuración devuelta es inmutable y no inventa valores', () => {
  const c = readClientConfig(client());
  assert.ok(Object.isFrozen(c) && Object.isFrozen(c.wompi));
  assert.equal(c.wompi.publicKey, PUB_TEST);
  assert.equal(c.appEnv, 'local');
});
test('cliente negativo: cada variable obligatoria ausente o vacía (sin valores por defecto de Wompi)', () => {
  for (const n of ['VITE_APP_ENV', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_WOMPI_PUBLIC_KEY', 'VITE_WOMPI_ENV']) {
    for (const v of [undefined, '', ' ']) {
      const env = client(); if (v === undefined) delete env[n]; else env[n] = v;
      assert.ok(problemsOf(env).some((p) => p.startsWith(`${n}: obligatoria`)), `${n}=${JSON.stringify(v)}`);
    }
  }
  assert.ok(problemsOf(undefined).length === 5);
});
test('cliente negativo: llaves de servidor en el navegador', () => {
  assert.ok(problemsOf(client({ VITE_SUPABASE_ANON_KEY: jwt('service_role') })).some((p) => /rol distinto de anon/.test(p)));
  assert.ok(problemsOf(client({ VITE_SUPABASE_ANON_KEY: k('sb_', 'secret_', 'x'.repeat(20)) })).some((p) => /llave secreta/.test(p)));
});
test('cliente negativo: Wompi incoherente o desconocido', () => {
  assert.ok(problemsOf(client({ VITE_WOMPI_PUBLIC_KEY: PUB_PROD })).some((p) => /no coincide/.test(p)), 'llave prod con modo sandbox');
  assert.ok(problemsOf(client({ VITE_WOMPI_ENV: 'production' })).some((p) => /no coincide/.test(p)), 'llave test con modo production');
  assert.ok(problemsOf(client({ VITE_WOMPI_PUBLIC_KEY: 'otra_llave' })).some((p) => /pub_test_ o pub_prod_/.test(p)));
  assert.ok(problemsOf(client({ VITE_WOMPI_ENV: 'live' })).some((p) => /sandbox o production/.test(p)));
  assert.ok(problemsOf(client({ VITE_APP_ENV: 'qa', VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' })).some((p) => /en qa solo se admite sandbox/.test(p)));
  assert.ok(problemsOf(client({ VITE_APP_ENV: 'staging' })).some((p) => /local, qa o production/.test(p)));
});
test('cliente negativo: URL inválida, con ruta o credenciales', () => {
  for (const u of ['no-es-url', 'ftp://' + HOST, 'https://' + HOST + '/rest/v1', 'https://u:p@' + HOST]) {
    assert.ok(problemsOf(client({ VITE_SUPABASE_URL: u })).some((p) => p.startsWith('VITE_SUPABASE_URL')), u.slice(0, 8));
  }
});
test('cliente: jwtRole decodifica sin dependencias y tolera basura', () => {
  assert.equal(jwtRole(jwt('anon')), 'anon');
  assert.equal(jwtRole('no.es.jwt'), undefined);
  assert.equal(jwtRole('eyJ.%%%.x'), undefined);
});

// ============================================================ servidor (Vercel)
test('servidor positivo: sandbox, producción y normalización de comillas/espacios', () => {
  assert.equal(readServerConfig(ALL, server()).ok, true);
  assert.equal(readServerConfig(ALL, server({ APP_ENV: 'production', SUPABASE_URL: 'https://' + HOST, WOMPI_PUBLIC_KEY: PUB_PROD, WOMPI_INTEGRITY_SECRET: INT_PROD, WOMPI_EVENTS_SECRET: EVT_PROD })).ok, true);
  const r = readServerConfig(['WOMPI_EVENTS_SECRET'], { APP_ENV: 'local', WOMPI_EVENTS_SECRET: `  "${EVT_TEST}" ` });
  assert.equal(r.ok, true); assert.equal(r.config.WOMPI_EVENTS_SECRET, EVT_TEST);
  assert.equal(clean(undefined), '');
});
test('servidor positivo: cada endpoint solo exige lo que usa', () => {
  assert.equal(readServerConfig(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_EVENTS_SECRET'], { ...server(), WOMPI_PUBLIC_KEY: undefined, WOMPI_INTEGRITY_SECRET: undefined }).ok, true);
});
test('servidor negativo: sin respaldo a variables de cliente (VITE_*)', () => {
  const env = { ...server(), SUPABASE_URL: undefined, WOMPI_PUBLIC_KEY: undefined, VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_WOMPI_PUBLIC_KEY: PUB_TEST };
  const r = readServerConfig(ALL, env);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /^SUPABASE_URL: obligatoria y ausente \(existe VITE_SUPABASE_URL/.test(e)));
  assert.ok(r.errors.some((e) => /^WOMPI_PUBLIC_KEY: obligatoria y ausente \(existe VITE_WOMPI_PUBLIC_KEY/.test(e)));
});
test('servidor negativo: la llave anon nunca sustituye a la de servicio', () => {
  assert.ok(readServerConfig(ALL, server({ SUPABASE_SERVICE_ROLE_KEY: undefined, VITE_SUPABASE_ANON_KEY: jwt('anon') })).errors.some((e) => /^SUPABASE_SERVICE_ROLE_KEY: obligatoria/.test(e)));
  assert.ok(readServerConfig(ALL, server({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon') })).errors.some((e) => /rol distinto de service_role/.test(e)));
  assert.ok(readServerConfig(ALL, server({ SUPABASE_SERVICE_ROLE_KEY: k('sb_', 'publishable_', 'x'.repeat(20)) })).errors.some((e) => /publicable/.test(e)));
});
test('servidor negativo: sandbox y producción mezclados, prefijos desconocidos, URL inválida, nombre desconocido', () => {
  // Mezcla sandbox/producción: en production (en local/qa la regla MAJ-2 rechaza antes cualquier secreto de producción)
  const prodEnv = { APP_ENV: 'production', SUPABASE_URL: 'https://' + HOST };
  assert.ok(readServerConfig(ALL, server({ ...prodEnv, WOMPI_INTEGRITY_SECRET: INT_PROD })).errors.some((e) => /^WOMPI_INTEGRITY_SECRET: no coincide/.test(e)));
  assert.ok(readServerConfig(ALL, server({ ...prodEnv, WOMPI_EVENTS_SECRET: EVT_PROD })).errors.some((e) => /^WOMPI_EVENTS_SECRET: no coincide/.test(e)));
  assert.ok(readServerConfig(ALL, server({ WOMPI_INTEGRITY_SECRET: INT_PROD })).errors.some((e) => /^WOMPI_INTEGRITY_SECRET: con APP_ENV=local/.test(e)));
  assert.ok(readServerConfig(ALL, server({ WOMPI_EVENTS_SECRET: 'otro_' + 'x'.repeat(10) })).errors.some((e) => /debe empezar por test_events_/.test(e)));
  assert.ok(readServerConfig(ALL, server({ WOMPI_PUBLIC_KEY: 'pk_' + 'x'.repeat(10) })).errors.some((e) => /^WOMPI_PUBLIC_KEY/.test(e)));
  assert.ok(readServerConfig(ALL, server({ SUPABASE_URL: 'https://' + HOST + '/x' })).errors.some((e) => /^SUPABASE_URL/.test(e)));
  assert.ok(readServerConfig(['OTRA'], server()).errors.some((e) => /no es una variable de servidor conocida/.test(e)));
});
test('seguridad: los errores de cliente y servidor nunca incluyen valores', () => {
  const s = readServerConfig(ALL, server({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon'), WOMPI_INTEGRITY_SECRET: INT_PROD, SUPABASE_URL: 'https://u:clave@' + HOST + '/x' })).errors.join('\n');
  let c = '';
  try { readClientConfig(client({ VITE_SUPABASE_ANON_KEY: jwt('service_role'), VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_SUPABASE_URL: 'https://u:clave@' + HOST + '/x' })); } catch (e) { c = e.message; }
  for (const v of ['s'.repeat(43), 'd'.repeat(24), 'b'.repeat(24), 'clave', 'r'.repeat(20)]) assert.ok(!s.includes(v) && !c.includes(v), `filtra ${v.slice(0, 3)}…`);
});

// ============================================== endpoints reales de Vercel (fallo rápido)
// Con configuración inválida, el handler responde 500 genérico ANTES de crear el cliente de Supabase.
const fakeRes = () => { const r = { code: 0, body: undefined, headers: {} };
  r.setHeader = (k2, v) => { r.headers[k2] = v; }; r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; };
const withEnv = async (env, fn) => {
  const saved = { ...process.env };
  for (const n of [...ALL, 'VITE_SUPABASE_URL', 'VITE_WOMPI_PUBLIC_KEY', 'VITE_SUPABASE_ANON_KEY']) delete process.env[n];
  Object.assign(process.env, env);
  const errs = []; const origErr = console.error; console.error = (...a) => errs.push(a.join(' '));
  try { return { r: await fn(), logs: errs.join('\n') }; } finally { console.error = origErr; process.env = saved; }
};
test('endpoint signature: solo variables VITE_* → 500 sin tocar Supabase y log con nombres', async () => {
  const { default: handler } = await import('../../apps/web/api/wompi/signature.js');
  const { r, logs } = await withEnv({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwt('anon'), VITE_WOMPI_PUBLIC_KEY: PUB_TEST, WOMPI_INTEGRITY_SECRET: INT_TEST },
    async () => { const res = fakeRes(); await handler({ method: 'POST', body: { reference: 'JM-1' } }, res); return res; });
  assert.equal(r.code, 500);
  assert.deepEqual(r.body, { error: 'Configuración de servidor incompleta.' });
  for (const n of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_PUBLIC_KEY']) assert.match(logs, new RegExp(`${n}: obligatoria`));
  assert.ok(!logs.includes('c'.repeat(24)) && !logs.includes('s'.repeat(43)), 'el log no contiene valores');
});
test('endpoint webhook: secreto de eventos de producción con llave de servicio anon → 500', async () => {
  const { default: handler } = await import('../../apps/web/api/wompi/webhook.js');
  const { r, logs } = await withEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt('anon'), WOMPI_EVENTS_SECRET: 'otro' },
    async () => { const res = fakeRes(); await handler({ method: 'POST', body: {} }, res); return res; });
  assert.equal(r.code, 500);
  assert.match(logs, /SUPABASE_SERVICE_ROLE_KEY: JWT con un rol distinto de service_role/);
  assert.match(logs, /WOMPI_EVENTS_SECRET: debe empezar por/);
});
test('endpoints: OPTIONS y método no permitido siguen sin exigir configuración', async () => {
  const { default: handler } = await import('../../apps/web/api/wompi/webhook.js');
  const { r } = await withEnv({}, async () => { const res = fakeRes(); await handler({ method: 'GET' }, res); return res; });
  assert.equal(r.code, 405);
});
test('requireServerConfig devuelve la configuración cuando es válida', () => {
  const res = fakeRes();
  const cfg = requireServerConfig(res, 'prueba', ALL, server());
  assert.equal(cfg.WOMPI_PUBLIC_KEY, PUB_TEST); assert.equal(res.code, 0);
});

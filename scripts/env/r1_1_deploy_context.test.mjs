// M26-R1.1 (MAJ-2) — Separación estricta Local / QA / Preview / Production (servidor, cliente y guarda de build).
// Fixtures ficticios compuestos en ejecución. "Production" se simula con un proyecto ficticio (OTHER_REF): la fábrica
// no conoce ni guarda la referencia real de Production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readServerConfig } from '../../apps/web/api/_lib/serverConfig.js';
import { readClientConfig, ConfigError } from '../../apps/web/src/config/clientConfig.js';
import { deployContext, deployContextProblems, readDeploySignals, publicDeploySignals } from '../../apps/web/src/config/deployContext.js';
import { deployGuard } from '../../apps/web/vite.config.js';
import { allowlistText, staleTargets, TARGETS } from './sync_allowlist.mjs';
import { configWithQaHosts, QA_PROJECT_HOST, QA_PROJECT_REF } from './test_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SB = '.supa' + 'base.co';
const OTHER_REF = 'v'.repeat(20);
const PROD_URL = `https://${OTHER_REF}${SB}`;
const QA_URL = `https://${QA_PROJECT_HOST}`;
const j = (...p) => p.join('');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, ref, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role })}.${fill.repeat(43)}`;
const PUB = j('pub_', 'test_', 'a'.repeat(24)); const PUB_PROD = j('pub_', 'prod_', 'b'.repeat(24));
const INT = j('test_', 'integrity_', 'c'.repeat(24)); const INT_PROD = j('prod_', 'integrity_', 'd'.repeat(24));
const EVT = j('test_', 'events_', 'e'.repeat(24)); const EVT_PROD = j('prod_', 'events_', 'f'.repeat(24));
const SECRET_VALUES = [PUB_PROD, INT_PROD, EVT_PROD, INT, EVT, OTHER_REF];

// Señales de plataforma
const NONE = {};
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'mission/m26-dev-qa-environments' };
const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };
const clientSignals = (deploy) => publicDeploySignals(readDeploySignals(deploy));

// Perfiles completos (servidor + cliente) por entorno declarado
const ALLOWED = { local: ['127.0.0.1', 'localhost'], qa: [QA_PROJECT_HOST] };
const LOCAL = { APP_ENV: 'local', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', undefined, 's'), WOMPI_PUBLIC_KEY: PUB, WOMPI_INTEGRITY_SECRET: INT, WOMPI_EVENTS_SECRET: EVT,
  VITE_APP_ENV: 'local', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwt('anon', undefined, 'n'), VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox' };
const QA = { ...LOCAL, APP_ENV: 'qa', SUPABASE_URL: QA_URL, SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', QA_PROJECT_REF, 'h'),
  VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: QA_URL, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_PROJECT_REF, 'g') };
const PROD = { APP_ENV: 'production', SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', OTHER_REF, 'p'), WOMPI_PUBLIC_KEY: PUB_PROD, WOMPI_INTEGRITY_SECRET: INT_PROD, WOMPI_EVENTS_SECRET: EVT_PROD,
  VITE_APP_ENV: 'production', VITE_SUPABASE_URL: PROD_URL, VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'q'), VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' };

const ALL = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET'];
const server = (cfg, deploy) => { const r = readServerConfig(ALL, { ...cfg, ...deploy }, { allowedHosts: ALLOWED }); return r.ok ? [] : r.errors; };
const client = (cfg, deploy) => { try { readClientConfig(cfg, { allowedHosts: ALLOWED, deploy: clientSignals(deploy) }); return []; } catch (e) { assert.ok(e instanceof ConfigError); return e.problems; } };
const build = (cfg, deploy) => deployGuard({ viteAppEnv: cfg.VITE_APP_ENV, processEnv: { ...deploy, APP_ENV: cfg.APP_ENV } }).problems;
const has = (list, re) => list.some((p) => re.test(p));
const noLeak = (...lists) => { const t = lists.flat().join('\n'); for (const v of SECRET_VALUES) assert.ok(!t.includes(v), 'un mensaje revela un valor'); };

// --------------------------------------------------------------- escenarios del encargo
test('1. Local con configuración local → PASS (servidor, cliente y build), sin variables de Vercel', () => {
  assert.deepEqual(server(LOCAL, NONE), []); assert.deepEqual(client(LOCAL, NONE), []); assert.deepEqual(build(LOCAL, NONE), []);
});
test('2. QA con configuración QA (fuera de Vercel: check:qa / build:qa) → PASS', () => {
  assert.deepEqual(server(QA, NONE), []); assert.deepEqual(client(QA, NONE), []); assert.deepEqual(build(QA, NONE), []);
});
test('3. Preview con configuración QA → PASS', () => {
  assert.deepEqual(server(QA, PREVIEW), []); assert.deepEqual(client(QA, PREVIEW), []); assert.deepEqual(build(QA, PREVIEW), []);
});
test('4. Preview con APP_ENV=production → FAIL (servidor; y el build, por contradicción con VITE_APP_ENV)', () => {
  const s = server(PROD, PREVIEW); assert.ok(has(s, /^APP_ENV: un despliegue Preview solo admite qa/));
  assert.ok(has(server({ ...QA, APP_ENV: 'production' }, PREVIEW), /^APP_ENV: un despliegue Preview solo admite qa/));
  assert.ok(has(build({ ...QA, APP_ENV: 'production' }, PREVIEW), /contradictorias/));
  noLeak(s);
});
test('5. Preview con VITE_APP_ENV=production → FAIL (cliente y build)', () => {
  const c = client(PROD, PREVIEW); assert.ok(has(c, /^VITE_APP_ENV: un despliegue Preview solo admite qa/));
  assert.ok(has(build(PROD, PREVIEW), /^VITE_APP_ENV: un despliegue Preview solo admite qa/));
  assert.ok(has(build({ ...QA, VITE_APP_ENV: 'production', APP_ENV: undefined }, PREVIEW), /Preview solo admite qa/));
  noLeak(c);
});
test('6. Preview con la URL de Supabase de Production (declarando qa) → FAIL (servidor y cliente)', () => {
  const s = server({ ...QA, SUPABASE_URL: PROD_URL }, PREVIEW); const c = client({ ...QA, VITE_SUPABASE_URL: PROD_URL }, PREVIEW);
  assert.ok(has(s, /^SUPABASE_URL: host no permitido para qa/)); assert.ok(has(c, /^VITE_SUPABASE_URL: host no permitido para qa/));
  noLeak(s, c);
});
test('7. Preview con credenciales de Production (declarando qa) → FAIL', () => {
  const s = server({ ...QA, WOMPI_PUBLIC_KEY: PUB_PROD, WOMPI_INTEGRITY_SECRET: INT_PROD, WOMPI_EVENTS_SECRET: EVT_PROD }, PREVIEW);
  assert.ok(has(s, /^WOMPI_PUBLIC_KEY: con APP_ENV=qa/)); assert.ok(has(s, /^WOMPI_INTEGRITY_SECRET: con APP_ENV=qa/)); assert.ok(has(s, /^WOMPI_EVENTS_SECRET: con APP_ENV=qa/));
  const c = client({ ...QA, VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' }, PREVIEW);
  assert.ok(has(c, /en qa solo se admite sandbox/));
  // Y la configuración completa de Production en un Preview: rechazada en todas las capas
  assert.ok(server(PROD, PREVIEW).length > 0 && client(PROD, PREVIEW).length > 0 && build(PROD, PREVIEW).length > 0);
  noLeak(s, c);
});
test('8. Production legítimo (VERCEL_ENV=production, rama main) con configuración de Production → PASS', () => {
  assert.deepEqual(server(PROD, PRODUCTION), []); assert.deepEqual(client(PROD, PRODUCTION), []); assert.deepEqual(build(PROD, PRODUCTION), []);
  // Despliegue Production sin rama ni destino (p. ej. CLI): solo con VERCEL_ENV=production también es válido
  assert.deepEqual(server(PROD, { VERCEL: '1', VERCEL_ENV: 'production' }), []);
});
test('9. Variables ausentes → comportamiento explícito y seguro (falla cerrado)', () => {
  // Sin APP_ENV / VITE_APP_ENV
  assert.ok(has(server({ ...QA, APP_ENV: undefined }, PREVIEW), /^APP_ENV: obligatoria y ausente/));
  assert.ok(has(client({ ...QA, VITE_APP_ENV: undefined }, PREVIEW), /^VITE_APP_ENV: obligatoria y ausente/));
  assert.ok(has(build({ ...QA, VITE_APP_ENV: undefined }, PREVIEW), /^VITE_APP_ENV: obligatoria en un despliegue de Vercel/));
  assert.ok(has(build({ ...QA, VITE_APP_ENV: undefined }, PRODUCTION), /^VITE_APP_ENV: obligatoria en un despliegue de Vercel/));
  // Sin señales de plataforma: production no es identificable → rechazado en las tres capas
  assert.ok(has(server(PROD, NONE), /^APP_ENV: production solo se admite/));
  assert.ok(has(client(PROD, NONE), /^VITE_APP_ENV: production solo se admite/));
  assert.ok(has(build(PROD, NONE), /^VITE_APP_ENV: production solo se admite/));
  // En Vercel sin VERCEL_ENV (exposición de variables de sistema desactivada): production rechazado, qa admitido
  const unknown = { VERCEL: '1' };
  assert.ok(has(server(PROD, unknown), /VERCEL_ENV no está disponible/)); assert.ok(has(client(PROD, unknown), /VERCEL_ENV no está disponible/));
  assert.ok(has(build(PROD, unknown), /VERCEL_ENV no está disponible/));
  assert.deepEqual(server(QA, unknown), []);
  // Cliente sin señales incrustadas (opción deploy ausente) → igual que sin señales
  assert.throws(() => readClientConfig(PROD, { allowedHosts: ALLOWED }), ConfigError);
});
test('10. Variables contradictorias → FAIL', () => {
  // Production con otra rama, otro destino o un entorno declarado distinto
  const otherBranch = { ...PRODUCTION, VERCEL_GIT_COMMIT_REF: 'mission/m26-dev-qa-environments' };
  assert.ok(has(server(PROD, otherBranch), /^VERCEL_GIT_COMMIT_REF: un despliegue Production solo se admite desde la rama main/));
  assert.ok(has(client(PROD, otherBranch), /^VERCEL_GIT_COMMIT_REF/)); assert.ok(has(build(PROD, otherBranch), /^VERCEL_GIT_COMMIT_REF/));
  assert.ok(has(server(PROD, { ...PRODUCTION, VERCEL_TARGET_ENV: 'preview' }), /^VERCEL_TARGET_ENV: contradice/));
  assert.ok(has(server(QA, PRODUCTION), /^APP_ENV: un despliegue Production exige production/));
  assert.ok(has(client(QA, PRODUCTION), /^VITE_APP_ENV: un despliegue Production exige production/));
  // Servidor y cliente declaran entornos distintos
  assert.ok(has(server({ ...QA, VITE_APP_ENV: 'production' }, PREVIEW), /^APP_ENV y VITE_APP_ENV: contradictorias/));
  assert.ok(has(build({ ...PROD, APP_ENV: 'qa' }, PRODUCTION), /contradictorias/));
  // Production apuntando a un proyecto de la fábrica (QA o local)
  assert.ok(has(server({ ...PROD, SUPABASE_URL: QA_URL }, PRODUCTION), /no se admite un host de local o qa/));
  assert.ok(has(client({ ...PROD, VITE_SUPABASE_URL: QA_URL }, PRODUCTION), /no se admite un host de local o qa/));
  assert.ok(has(server({ ...PROD, SUPABASE_URL: 'http://127.0.0.1:54321' }, PRODUCTION), /production debe ser https/));
  // VERCEL_ENV con un valor desconocido
  assert.ok(has(server(QA, { VERCEL: '1', VERCEL_ENV: 'staging' }), /^VERCEL_ENV: valor no reconocido/));
});

// ------------------------------------------------- intentos de elusión (comillas, espacios, vacíos, mayúsculas)
test('elusión: comillas y espacios en las señales o en el entorno declarado no cambian el resultado', () => {
  const quotedPreview = { VERCEL: ' "1" ', VERCEL_ENV: ` "preview" `, VERCEL_TARGET_ENV: "'preview'" };
  assert.equal(deployContext(readDeploySignals(quotedPreview)), 'preview');
  assert.ok(has(server(PROD, quotedPreview), /Preview solo admite qa/));
  assert.ok(has(server({ ...QA, APP_ENV: '  "production" ' }, PREVIEW), /Preview solo admite qa/));
  assert.ok(has(client({ ...QA, VITE_APP_ENV: " 'production' ", VITE_SUPABASE_URL: PROD_URL, VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' }, PREVIEW), /Preview solo admite qa/));
  assert.ok(has(build({ ...PROD, VITE_APP_ENV: ' "production" ' }, PREVIEW), /Preview solo admite qa/));
  // Rama con espacios/comillas sigue siendo otra rama
  assert.ok(has(server(PROD, { ...PRODUCTION, VERCEL_GIT_COMMIT_REF: ' "main-2" ' }), /rama main/));
  assert.deepEqual(server(PROD, { ...PRODUCTION, VERCEL_GIT_COMMIT_REF: ' "main" ' }), []);
});
test('elusión: valores vacíos o con otra capitalización no identifican Production', () => {
  for (const env of ['', '   ', '""', 'Production', 'PRODUCTION', 'prod']) {
    const d = { VERCEL: '1', VERCEL_ENV: env };
    assert.ok(server(PROD, d).length > 0, `servidor con VERCEL_ENV de longitud ${env.length}`);
    assert.ok(client(PROD, d).length > 0, 'cliente');
    assert.ok(build(PROD, d).length > 0, 'build');
  }
  // VERCEL_ENV=production sin VERCEL=1 sigue contando como Production (VERCEL_ENV es la señal determinante)
  assert.deepEqual(server(PROD, { VERCEL_ENV: 'production' }), []);
});
test('elusión: el contexto no se puede forzar con variables VITE_* (el navegador solo recibe señales del build)', () => {
  // Un VITE_VERCEL_ENV definido por el usuario no se considera: el cliente solo usa las señales incrustadas por vite.config
  assert.ok(has(client({ ...PROD, VITE_VERCEL_ENV: 'production' }, PREVIEW), /Preview solo admite qa/));
  assert.ok(has(client({ ...PROD, VITE_VERCEL_ENV: 'production' }, NONE), /production solo se admite/));
});
test('seguridad: las señales incrustadas en el bundle no revelan la rama; los mensajes no revelan valores', () => {
  const pub = publicDeploySignals(readDeploySignals(PREVIEW));
  assert.ok(!JSON.stringify(pub).includes('mission/'), 'la rama no se incrusta');
  assert.equal(pub.ref, '(otra rama)');
  assert.equal(publicDeploySignals(readDeploySignals(PRODUCTION)).ref, 'main');
  const msgs = deployContextProblems('APP_ENV', 'production', readDeploySignals({ VERCEL: '1', VERCEL_ENV: 'valor-secreto-inventado' }));
  assert.ok(msgs.length && !msgs.join('').includes('valor-secreto-inventado'));
  noLeak(server(PROD, PREVIEW), client(PROD, PREVIEW), build(PROD, PREVIEW));
});

// ------------------------------------------------ copias generadas de la lista de permitidos
test('lista de permitidos: las copias desplegadas coinciden con config/environments.json', () => {
  assert.deepEqual(staleTargets(), []);
  const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config/environments.json'), 'utf8'));
  for (const rel of TARGETS) {
    const copy = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.deepEqual(copy.qa, cfg.environments.qa.supabase.allowed_hosts, rel);
    assert.deepEqual(copy.local, cfg.environments.local.supabase.allowed_hosts, rel);
  }
});
test('lista de permitidos: añadir un host QA sin regenerar las copias se detecta (el PR quedaría en rojo)', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'jm-allow-'));
  try {
    mkdirSync(path.join(d, 'config'));
    for (const rel of TARGETS) { mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); writeFileSync(path.join(d, rel), readFileSync(path.join(ROOT, rel))); }
    // M28: el host QA real ya está en la lista versionada; se añade un host ficticio adicional para que la prueba no
    // dependa del contenido actual de la lista.
    const withQa = configWithQaHosts([QA_PROJECT_HOST, `${'z'.repeat(20)}${SB}`]);
    writeFileSync(path.join(d, 'config/environments.json'), JSON.stringify(withQa));
    assert.deepEqual(staleTargets(d).sort(), [...TARGETS].sort());
    for (const rel of TARGETS) writeFileSync(path.join(d, rel), allowlistText(withQa));
    assert.deepEqual(staleTargets(d), []);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

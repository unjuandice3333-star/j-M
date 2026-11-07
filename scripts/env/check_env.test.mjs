// M26-T2 — Pruebas de la guarda de build (node --test scripts/env/check_env.test.mjs).
// Fixtures con forma de llaves/JWT/hosts reales se construyen en tiempo de ejecución; ninguno es real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEnv, REQUIRED_VARS } from './check_env.mjs';
import { configWithQaHosts } from './test_fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CLI = path.join(HERE, 'check_env.mjs');
// M26-R1 (MAJ-3): QA vacía declarada explícitamente; no depende del archivo versionado.
const cfg = () => configWithQaHosts([]);
const SB = '.supa' + 'base.co';
const QA_HOST = 'q'.repeat(20) + SB;
const OTHER_HOST = 'p'.repeat(20) + SB;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role, exp: 1983812996 })}.${'s'.repeat(43)}`;
const PUB_TEST = 'pub_' + 'test_' + 'k'.repeat(20);
const PUB_PROD = 'pub_' + 'prod_' + 'z'.repeat(20);

const localVars = () => ({
  VITE_APP_ENV: 'local',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: jwt('anon'),
  VITE_WOMPI_PUBLIC_KEY: PUB_TEST,
  VITE_WOMPI_ENV: 'sandbox',
});
const qaCfg = () => { const c = cfg(); c.environments.qa.supabase.allowed_hosts = [QA_HOST]; return c; };
const has = (errs, re) => errs.some((e) => re.test(e));

// ------------------------------------------------------------------ positivos
test('positivo: entorno local completo', () => assert.deepEqual(checkEnv(localVars(), cfg()), []));
test('positivo: QA configurado por el propietario', () => {
  assert.deepEqual(checkEnv({ ...localVars(), VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://' + QA_HOST }, qaCfg()), []);
});
test('positivo: llave anon que no es JWT (marcador o llave publicable) se admite', () => {
  assert.deepEqual(checkEnv({ ...localVars(), VITE_SUPABASE_ANON_KEY: 'ci-placeholder-public-anon-key' }, cfg()), []);
});

// ------------------------------------------------------------------ negativos
test('negativo: cada variable obligatoria ausente o vacía bloquea (sin valores por defecto)', () => {
  for (const name of REQUIRED_VARS) {
    for (const v of [undefined, '', '   ']) {
      const vars = localVars(); if (v === undefined) delete vars[name]; else vars[name] = v;
      assert.ok(has(checkEnv(vars, cfg()), new RegExp(`^${name}: obligatoria y ausente`)), `${name}=${JSON.stringify(v)}`);
    }
  }
});
test('negativo: VITE_APP_ENV=production u otro valor', () => {
  for (const v of ['production', 'prod', 'staging', 'LOCAL']) {
    assert.ok(has(checkEnv({ ...localVars(), VITE_APP_ENV: v }, cfg()), /VITE_APP_ENV: valor no permitido/), v);
  }
});
test('negativo: URL de un proyecto no listado (p. ej. Production) en local y en qa', () => {
  assert.ok(has(checkEnv({ ...localVars(), VITE_SUPABASE_URL: 'https://' + OTHER_HOST }, cfg()), /VITE_SUPABASE_URL: /));
  assert.ok(has(checkEnv({ ...localVars(), VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://' + OTHER_HOST }, qaCfg()), /host de Supabase no permitido/));
});
test('negativo: QA sin configurar bloquea cualquier build de QA', () => {
  assert.ok(has(checkEnv({ ...localVars(), VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://' + QA_HOST }, cfg()), /aún no ha configurado/));
});
test('negativo: service_role o llave secreta como llave anon', () => {
  assert.ok(has(checkEnv({ ...localVars(), VITE_SUPABASE_ANON_KEY: jwt('service_role') }, cfg()), /rol distinto de anon/));
  assert.ok(has(checkEnv({ ...localVars(), VITE_SUPABASE_ANON_KEY: 'sb_' + 'secret_' + 'x'.repeat(30) }, cfg()), /llave secreta/));
});
test('negativo: llave pública de Wompi de producción y modo distinto de sandbox', () => {
  assert.ok(has(checkEnv({ ...localVars(), VITE_WOMPI_PUBLIC_KEY: PUB_PROD }, cfg()), /VITE_WOMPI_PUBLIC_KEY: .*sandbox/));
  assert.ok(has(checkEnv({ ...localVars(), VITE_WOMPI_ENV: 'production' }, cfg()), /VITE_WOMPI_ENV: debe ser "sandbox"/));
});
test('negativo: secretos de servidor expuestos como VITE_*', () => {
  for (const n of ['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_WOMPI_INTEGRITY_SECRET', 'VITE_WOMPI_EVENTS_SECRET', 'VITE_DB_PASSWORD']) {
    assert.ok(has(checkEnv({ ...localVars(), [n]: 'x' }, cfg()), new RegExp(`^${n}: un secreto de servidor`)), n);
  }
});
test('negativo: una configuración de entornos inválida bloquea la guarda', () => {
  const c = cfg(); c.environments.production = structuredClone(c.environments.qa);
  assert.ok(has(checkEnv(localVars(), c), /^config\/environments\.json: /));
});
// Valor ficticio compuesto en tiempo de ejecución (un literal con forma de secreto dispararía gitleaks).
const SECRET_VALUE = ['valor', 'ficticio', String(20 + 3)].join('-');
test('seguridad: ningún mensaje contiene los valores recibidos', () => {
  const secretish = { ...localVars(), VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://usr:clave@' + OTHER_HOST,
    VITE_SUPABASE_ANON_KEY: jwt('service_role'), VITE_WOMPI_PUBLIC_KEY: PUB_PROD, ['VITE_X_' + 'SEC' + 'RET']: SECRET_VALUE };
  const out = checkEnv(secretish, qaCfg()).join('\n');
  for (const v of ['p'.repeat(20), 'clave', 's'.repeat(43), 'z'.repeat(20), SECRET_VALUE]) assert.ok(!out.includes(v), `filtra ${v.slice(0, 4)}…`);
});

// ------------------------------------------------- CLI real (loadEnv de Vite)
// Entorno limpio: solo PATH/HOME; las variables VITE_ llegan como Vite las lee del proceso.
// Determinismo: la CLI lee los .env del envDir como Vite, y apps/web puede tener un .env.local propio de cada máquina
// (ignorado por git) que contaminaba estas pruebas. Por defecto se usa un envDir temporal SIN archivos .env (con vite
// resoluble vía enlace a node_modules); solo la prueba de lectura de archivos usa apps/web a propósito.
const HERMETIC = mkdtempSync(path.join(tmpdir(), 'jm-hermetic-env-'));
writeFileSync(path.join(HERMETIC, 'package.json'), '{}');
symlinkSync(path.join(ROOT, 'apps/web/node_modules'), path.join(HERMETIC, 'node_modules'), 'dir');
process.on('exit', () => rmSync(HERMETIC, { recursive: true, force: true }));
const run = (vars, ...args) => {
  const argv = args.includes('--env-dir') ? args : ['--env-dir', HERMETIC, ...args];
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...vars } });
};

test('CLI: entorno local válido → exit 0', () => {
  const r = run(localVars());
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Guarda de entorno: OK/);
});
test('CLI: el fixture de CI (config/env/local-ci.env) es válido', () => {
  const r = run(readCiFixture());
  assert.equal(r.status, 0, r.stderr);
});
test('CLI: sin variables → exit 1 y lista las 5 obligatorias', () => {
  const r = run({});
  assert.equal(r.status, 1);
  for (const n of REQUIRED_VARS) assert.match(r.stderr, new RegExp(n));
});
test('CLI: VITE_APP_ENV=production → exit 1', () => {
  assert.equal(run({ ...localVars(), VITE_APP_ENV: 'production' }).status, 1);
});
test('CLI: lee los archivos .env del envDir como Vite y el proceso tiene prioridad', () => {
  // envDir fuera del repositorio, sin vite resoluble → error controlado (exit 2), nunca un falso OK
  const dir = mkdtempSync(path.join(tmpdir(), 'jm-envtest-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), '{}');
    assert.equal(run(localVars(), '--env-dir', dir).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const web = path.join(ROOT, 'apps/web');
  const f = path.join(web, '.env.selftest');
  writeFileSync(f, Object.entries(localVars()).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  try {
    assert.equal(run({}, '--mode', 'selftest', '--env-dir', web).status, 0, 'el modo selftest debería leer apps/web/.env.selftest');
    assert.equal(run({ VITE_APP_ENV: 'production' }, '--mode', 'selftest', '--env-dir', web).status, 1, 'el entorno del proceso tiene prioridad, como en Vite');
  } finally { rmSync(f, { force: true }); }
});
test('CLI: el resultado no depende de archivos .env locales ignorados (envDir hermético)', () => {
  // Con un envDir sin archivos .env, sin variables en el proceso siempre falla igual en cualquier máquina.
  const r = run({});
  assert.equal(r.status, 1);
  for (const n of REQUIRED_VARS) assert.match(r.stderr, new RegExp(n));
});
test('CLI: opción desconocida → exit 2', () => assert.equal(run(localVars(), '--prod').status, 2));

function readCiFixture() {
  const txt = readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
}

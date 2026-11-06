// M26-T4 — Pruebas de las plantillas de entorno (node --test scripts/env/templates.test.mjs).
// Los valores con forma de llave/secreto/host se componen en tiempo de ejecución y son ficticios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, TEMPLATES, EXPECTED_VARS, parseEnv, findSecretShapedValues, checkTemplate, checkAllTemplates } from './templates.mjs';
import { checkEnv } from './check_env.mjs';
import { loadConfig } from './environments.mjs';
import { readServerConfig, SERVER_VARS } from '../../apps/web/api/_lib/serverConfig.js';

const read = (kind) => readFileSync(path.join(ROOT, TEMPLATES[kind]), 'utf8');
const asObj = (text) => Object.fromEntries(parseEnv(text).entries.map((e) => [e.name, e.value]));
const cfg = loadConfig(path.join(ROOT, 'config/environments.json'));
const j = (...p) => p.join('');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({ alg: 'HS256' })}.${b64({ role: 'anon' })}.${'s'.repeat(43)}`;
const FAKE = { anon: JWT, pub: j('pub_', 'test_', 'a'.repeat(24)), svc: `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.${'t'.repeat(43)}`,
  integ: j('test_', 'integrity_', 'c'.repeat(24)), events: j('test_', 'events_', 'e'.repeat(24)) };
const withLines = (kind, extra) => read(kind) + '\n' + extra + '\n';
const problems = (kind, text) => checkTemplate(kind, text).problems;
const has = (list, re) => list.some((p) => re.test(p));

// ------------------------------------------------------------------ positivos
test('positivo: las tres plantillas versionadas pasan la verificación', () => {
  for (const [kind, r] of Object.entries(checkAllTemplates())) assert.deepEqual(r.problems, [], `${kind}: ${r.problems.join('; ')}`);
});
test('positivo: el conjunto de variables se deriva del código (guarda de build T2 + servidor T3)', () => {
  assert.equal(EXPECTED_VARS.length, 10);
  for (const n of Object.keys(SERVER_VARS)) assert.ok(EXPECTED_VARS.includes(n));
  for (const kind of Object.keys(TEMPLATES)) assert.deepEqual(Object.keys(asObj(read(kind))).sort(), [...EXPECTED_VARS]);
});
test('positivo: la plantilla local + llaves de prueba pasa la guarda de build y la del servidor', () => {
  const env = { ...asObj(read('local')), VITE_SUPABASE_ANON_KEY: FAKE.anon, VITE_WOMPI_PUBLIC_KEY: FAKE.pub,
    SUPABASE_SERVICE_ROLE_KEY: FAKE.svc, WOMPI_PUBLIC_KEY: FAKE.pub, WOMPI_INTEGRITY_SECRET: FAKE.integ, WOMPI_EVENTS_SECRET: FAKE.events };
  assert.deepEqual(checkEnv(env, cfg), []);
  assert.equal(readServerConfig(Object.keys(SERVER_VARS), env).ok, true);
});
test('positivo: las plantillas son versionables y la compuerta de commits no las rechaza', () => {
  for (const rel of [TEMPLATES.local, TEMPLATES.qa]) {
    assert.equal(spawnSync('git', ['check-ignore', '-q', rel], { cwd: ROOT }).status, 1, `${rel} no debe estar ignorada`);
  }
  // Mismo patrón de archivos prohibidos que scripts/ci/check_commits.sh
  const gate = readFileSync(path.join(ROOT, 'scripts/ci/check_commits.sh'), 'utf8');
  const forbidden = new RegExp(/grep -E '([^']+)'/.exec(gate.split('\n').find((l) => l.startsWith('bad=')))[1]);
  for (const rel of [TEMPLATES.local, TEMPLATES.qa]) assert.equal(forbidden.test(rel), false, rel);
});

// ------------------------------------------- negativos: sin valores por defecto
test('negativo: la plantilla local sola NO basta (llaves vacías → la guarda de build bloquea)', () => {
  const errs = checkEnv(asObj(read('local')), cfg);
  assert.ok(has(errs, /^VITE_SUPABASE_ANON_KEY: obligatoria/));
  assert.ok(has(errs, /^VITE_WOMPI_PUBLIC_KEY: obligatoria/));
  assert.equal(readServerConfig(Object.keys(SERVER_VARS), asObj(read('local'))).ok, false);
});
test('negativo: la plantilla QA no tiene valores, así que QA no puede construirse sin el propietario', () => {
  assert.ok(Object.values(asObj(read('qa'))).every((v) => v === ''));
  const env = { ...asObj(read('qa')), VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: 'https://' + 'q'.repeat(20) + '.supa' + 'base.co',
    VITE_SUPABASE_ANON_KEY: FAKE.anon, VITE_WOMPI_PUBLIC_KEY: FAKE.pub, VITE_WOMPI_ENV: 'sandbox' };
  assert.ok(has(checkEnv(env, cfg), /aún no ha configurado/), 'sin host QA en la lista de permitidos, la guarda bloquea');
});

// ----------------------------------------- negativos: el verificador detecta
test('negativo: valores con forma de secreto bajo cualquier nombre', () => {
  const cases = [
    ['VITE_SUPABASE_URL=' + JWT, /forma de JWT/],
    ['VITE_SUPABASE_URL=' + j('sb_', 'secret_', 'x'.repeat(20)), /llave de Supabase/],
    ['VITE_SUPABASE_URL=' + j('pub_', 'prod_', 'x'.repeat(20)), /llave de Wompi/],
    ['VITE_SUPABASE_URL=' + j('prod_', 'events_', 'x'.repeat(10)), /secreto de Wompi/],
    ['VITE_SUPABASE_URL=https://' + 'p'.repeat(20) + '.supa' + 'base.co', /host de un proyecto Supabase/],
    ['VITE_SUPABASE_URL=' + 'Z9'.repeat(20), /cadena aleatoria larga/],
  ];
  for (const [line, re] of cases) assert.ok(has(findSecretShapedValues(parseEnv(line).entries), re), String(re));
});
test('negativo: cualquier valor bajo un nombre de llave o secreto, aunque sea corto', () => {
  for (const n of ['VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET']) {
    assert.ok(has(findSecretShapedValues(parseEnv(`${n}=x`).entries), new RegExp(`${n} debe estar vacía`)), n);
  }
});
test('negativo: plantilla desincronizada con el código (falta, sobra o se duplica una variable)', () => {
  assert.ok(has(problems('local', read('local').replace(/^WOMPI_EVENTS_SECRET=.*$/m, '')), /^WOMPI_EVENTS_SECRET: falta/));
  assert.ok(has(problems('qa', withLines('qa', 'VITE_GA4_TRACKING_ID=')), /^VITE_GA4_TRACKING_ID: el código no la usa/));
  assert.ok(has(problems('qa', withLines('qa', 'VITE_APP_ENV=')), /^VITE_APP_ENV: duplicada/));
});
test('negativo: QA y el índice heredado con algún valor; local con valores públicos alterados; línea mal formada', () => {
  assert.ok(has(problems('qa', read('qa').replace(/^VITE_WOMPI_ENV=$/m, 'VITE_WOMPI_ENV=sandbox')), /debe ir sin valor/));
  assert.ok(has(problems('legacy', read('legacy').replace(/^VITE_APP_ENV=$/m, 'VITE_APP_ENV=local')), /debe ir sin valor/));
  assert.ok(has(problems('local', read('local').replace('VITE_SUPABASE_URL=http://127.0.0.1:54321', 'VITE_SUPABASE_URL=https://example.com')), /^VITE_SUPABASE_URL: en la plantilla local/));
  assert.ok(has(problems('local', read('local').replace('VITE_APP_ENV=local', 'VITE_APP_ENV=production')), /^VITE_APP_ENV: en la plantilla local/));
  assert.ok(has(problems('qa', withLines('qa', 'esto no es una variable')), /formato no válido/));
});
test('seguridad: los mensajes del verificador nunca muestran el valor', () => {
  const secretValue = j('prod_', 'integrity_', 'v'.repeat(30));
  const out = problems('local', read('local').replace(/^WOMPI_INTEGRITY_SECRET=$/m, `WOMPI_INTEGRITY_SECRET=${secretValue}`)).join('\n');
  assert.ok(out.length > 0 && !out.includes('v'.repeat(30)));
});

// ------------------------------------------------------------------------ CLI
test('CLI: check → exit 0; comando desconocido → exit 2', () => {
  const ok = spawnSync(process.execPath, [path.join(ROOT, 'scripts/env/templates.mjs'), 'check'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /Plantillas de entorno: OK/);
  assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'scripts/env/templates.mjs')], { encoding: 'utf8' }).status, 2);
});

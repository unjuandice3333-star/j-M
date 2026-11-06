// M26-T6 — Pruebas de la verificación del entorno QA (node --test scripts/env/qa_config.test.mjs).
// Proyectos, llaves y secretos ficticios compuestos en tiempo de ejecución. La lista de permitidos de QA se pasa en la
// prueba (la versionada sigue vacía hasta que el propietario cree QA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, checkQaEnv, projectRefOf, checkEnvFileLocation } from './qa_config.mjs';
import { configWithQaHosts, configFileWithQaHosts } from './test_fixtures.mjs';

const SB = '.supa' + 'base.co';
const QA_REF = 'q'.repeat(20);
const OTHER_REF = 'p'.repeat(20);
const QA_URL = `https://${QA_REF}${SB}`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, ref, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(ref ? { iss: 'supabase', ref, role } : { iss: 'supabase', role })}.${fill.repeat(43)}`;
const j = (...p) => p.join('');
const PUB = j('pub_', 'test_', 'a'.repeat(24));
// M26-R1 (MAJ-3): QA vacía declarada explícitamente.
const baseCfg = configWithQaHosts([]);
const qaCfg = () => { const c = structuredClone(baseCfg); c.environments.qa.supabase.allowed_hosts = [`${QA_REF}${SB}`]; return c; };
const qaVars = (over = {}) => ({
  APP_ENV: 'qa', VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: QA_URL, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_REF, 'a'),
  VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox',
  SUPABASE_URL: QA_URL, SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', QA_REF, 'z'), WOMPI_PUBLIC_KEY: PUB,
  WOMPI_INTEGRITY_SECRET: j('test_', 'integrity_', 'c'.repeat(24)), WOMPI_EVENTS_SECRET: j('test_', 'events_', 'e'.repeat(24)), ...over,
});
const errs = (vars, cfg = qaCfg()) => checkQaEnv(vars, cfg).errors;
const has = (list, re) => list.some((e) => re.test(e));

// ------------------------------------------------------------------ positivos
test('positivo: configuración QA completa y coherente → sin errores ni comprobaciones manuales', () => {
  const r = checkQaEnv(qaVars(), qaCfg());
  assert.deepEqual(r.errors, []); assert.deepEqual(r.manualChecks, []);
});
test('positivo: llaves de formato nuevo (sin claim ref) → válidas, pero con comprobación manual explícita', () => {
  const r = checkQaEnv(qaVars({ VITE_SUPABASE_ANON_KEY: j('sb_', 'publishable_', 'k'.repeat(20)), SUPABASE_SERVICE_ROLE_KEY: j('sb_', 'secret_', 'k'.repeat(20)) }), qaCfg());
  assert.deepEqual(r.errors, []); assert.equal(r.manualChecks.length, 2);
});
test('positivo: projectRefOf extrae la referencia solo de hosts *.supabase.co', () => {
  assert.equal(projectRefOf(QA_URL), QA_REF);
  assert.equal(projectRefOf('http://127.0.0.1:54321'), undefined);
  assert.equal(projectRefOf('no-url'), undefined);
});

// ------------------------------------------- negativos: exclusivamente QA
test('negativo: QA sin configurar por el propietario (lista de permitidos vacía) → inválido', () => {
  assert.ok(has(errs(qaVars(), baseCfg), /aún no ha configurado/));
});
test('negativo: URL de otro proyecto (p. ej. Production) o del stack local → inválido', () => {
  assert.ok(has(errs(qaVars({ VITE_SUPABASE_URL: `https://${OTHER_REF}${SB}`, SUPABASE_URL: `https://${OTHER_REF}${SB}` })), /host de Supabase no permitido/));
  assert.ok(has(errs(qaVars({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_URL: 'http://127.0.0.1:54321' })), /no permitido para qa/));
});
test('negativo: cliente y servidor apuntando a proyectos distintos', () => {
  const c = qaCfg(); c.environments.qa.supabase.allowed_hosts.push(`${OTHER_REF}${SB}`);
  assert.ok(has(errs(qaVars({ SUPABASE_URL: `https://${OTHER_REF}${SB}` }), c), /proyectos distintos/));
});
test('negativo: llaves de OTRO proyecto con la URL de QA (mezcla con Production)', () => {
  assert.ok(has(errs(qaVars({ VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'a') })), /^VITE_SUPABASE_ANON_KEY: pertenece a otro proyecto/));
  assert.ok(has(errs(qaVars({ SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', OTHER_REF, 'z') })), /^SUPABASE_SERVICE_ROLE_KEY: pertenece a otro proyecto/));
});
test('negativo: roles cambiados o la misma llave en ambos lados', () => {
  assert.ok(has(errs(qaVars({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon', QA_REF, 'b') })), /el rol no es service_role/));
  const k = jwt('service_role', QA_REF, 'z');
  assert.ok(has(errs(qaVars({ VITE_SUPABASE_ANON_KEY: k, SUPABASE_SERVICE_ROLE_KEY: k })), /no pueden ser la misma llave|rol distinto de anon/));
});
test('negativo: VITE_APP_ENV distinto de qa y Wompi fuera de sandbox', () => {
  assert.ok(has(errs(qaVars({ VITE_APP_ENV: 'local' })), /^VITE_APP_ENV: debe ser "qa"/));
  const prodPub = j('pub_', 'prod_', 'b'.repeat(24));
  assert.ok(has(errs(qaVars({ WOMPI_PUBLIC_KEY: prodPub })), /QA solo usa Wompi sandbox|mismo modo|no coincide/));
  assert.ok(has(errs(qaVars({ WOMPI_EVENTS_SECRET: j('prod_', 'events_', 'f'.repeat(24)) })), /WOMPI_EVENTS_SECRET/));
  assert.ok(has(errs(qaVars({ WOMPI_PUBLIC_KEY: j('pub_', 'test_', 'd'.repeat(24)) })), /misma llave pública sandbox/));
});
test('negativo: variables ausentes (plantilla QA sin rellenar) → inválido, sin valores por defecto', () => {
  const tpl = Object.fromEntries(readFileSync(path.join(ROOT, 'config/env/qa.env.example'), 'utf8').split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split('=')[0], '']));
  const e = errs(tpl);
  for (const n of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WOMPI_EVENTS_SECRET']) assert.ok(has(e, new RegExp(n)), n);
});
test('seguridad: los errores nunca contienen valores', () => {
  const out = errs(qaVars({ VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'x'), SUPABASE_URL: `https://${OTHER_REF}${SB}`, WOMPI_EVENTS_SECRET: j('prod_', 'events_', 'v'.repeat(24)) })).join('\n');
  for (const v of [OTHER_REF, 'x'.repeat(43), 'v'.repeat(24)]) assert.ok(!out.includes(v), `filtra ${v.slice(0, 3)}…`);
});

// ------------------------------------------------- ubicación del archivo + CLI
const CLI = path.join(ROOT, 'scripts/env/qa_config.mjs');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
const envText = (vars) => Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
test('ubicación: el archivo QA no puede estar en una ruta versionable del repositorio', () => {
  assert.equal(checkEnvFileLocation('package.json').ok, false);
  assert.match(checkEnvFileLocation('package.json').error, /ruta versionable/);
  assert.equal(checkEnvFileLocation('no/existe.env').ok, false);
});
test('CLI: con la lista de permitidos versionada (QA sin crear) un entorno QA es INVÁLIDO; uso incorrecto → exit 2', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'jm-qacfg-'));
  try {
    const f = path.join(d, 'qa.env'); writeFileSync(f, envText(qaVars()));
    const r = run('check', '--file', f, '--config', configFileWithQaHosts([], d));
    assert.equal(r.status, 1); assert.match(r.stderr, /aún no ha configurado/);
    assert.ok(![QA_REF, 'z'.repeat(43)].some((v) => (r.stdout + r.stderr).includes(v)), 'la salida no muestra valores');
    assert.equal(run('check').status, 2);
    assert.equal(run('check', '--file', path.join(d, 'no.env')).status, 2);
    assert.equal(run('check', '--file', 'package.json').status, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

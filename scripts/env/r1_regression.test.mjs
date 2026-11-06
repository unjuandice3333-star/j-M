// M26-R1 — Pruebas de regresión de los hallazgos de la revisión independiente de M26.
// Cada prueba nombra el hallazgo que cubre. Fixtures ficticios compuestos en tiempo de ejecución (llaves y secretos
// inventados); el host del proyecto QA existente se usa solo como dato de configuración en fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from './templates.mjs';
import { checkQaEnv } from './qa_config.mjs';
import { validateConfig, isSupabaseUrlAllowed } from './environments.mjs';
import { checkEnv } from './check_env.mjs';
import { verifyQaBundle } from './qa_build.mjs';
import { configWithQaHosts, configFileWithQaHosts, QA_PROJECT_REF, QA_PROJECT_HOST } from './test_fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QA_CLI = path.join(ROOT, 'scripts/env/qa_config.mjs');
const OTHER_REF = 'k'.repeat(20);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, ref, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role })}.${fill.repeat(43)}`;
const j = (...p) => p.join('');
const PUB = j('pub_', 'test_', 'p'.repeat(24));
const QA_URL = `https://${QA_PROJECT_HOST}`;
const qaVars = (over = {}) => ({
  APP_ENV: 'qa',
  VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: QA_URL, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_PROJECT_REF, 'a'),
  VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox', SUPABASE_URL: QA_URL,
  SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', QA_PROJECT_REF, 'z'), WOMPI_PUBLIC_KEY: PUB,
  WOMPI_INTEGRITY_SECRET: j('test_', 'integrity_', 'i'.repeat(24)), WOMPI_EVENTS_SECRET: j('test_', 'events_', 'e'.repeat(24)), ...over,
});
const dir = mkdtempSync(path.join(tmpdir(), 'jm-r1-'));
const cfgQa = configFileWithQaHosts([QA_PROJECT_HOST], dir);
const envText = (vars, quote = '') => Object.entries(vars).map(([k, v]) => `${k}=${quote}${v}${quote}`).join('\n') + '\n';
const checkFile = (text) => { const f = path.join(dir, `qa-${Math.random().toString(36).slice(2)}.env`); writeFileSync(f, text);
  return spawnSync(process.execPath, [QA_CLI, 'check', '--file', f, '--config', cfgQa], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } }); };
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

// ===================================================================== MAJ-1
test('MAJ-1 parseEnv: comillas, export y comentarios se normalizan como en dotenv/Vite', () => {
  const r = parseEnv(['A="x y"', "export B='z'", 'C=plain # comentario', 'D=`t`', 'E="a" # ok', 'F=', 'G="l1\\nl2"'].join('\n'));
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.entries.map((e) => [e.name, e.value]), [['A', 'x y'], ['B', 'z'], ['C', 'plain'], ['D', 't'], ['E', 'a'], ['F', ''], ['G', 'l1\nl2']]);
});
test('MAJ-1 parseEnv: comillas sin cerrar o texto tras la comilla → problema (no se adivina el valor)', () => {
  const r = parseEnv(['A="sin cierre', "B='x'basura"].join('\n'));
  assert.equal(r.entries.length, 0);
  assert.ok(r.problems.some((p) => /A tiene comillas sin cerrar/.test(p)));
  assert.ok(r.problems.some((p) => /B tiene texto tras la comilla de cierre/.test(p)));
});
test('MAJ-1 check:qa: un archivo QA válido con TODOS los valores entre comillas sigue siendo válido (formato de los archivos exportados por Vercel)', () => {
  const r = checkFile(envText(qaVars(), '"'));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /VÁLIDO/);
});
test('MAJ-1 check:qa: entre comillas ya no se eluden las comprobaciones de proyecto, rol ni llaves sb_secret_', () => {
  for (const [desc, over, re] of [
    ['anon de otro proyecto', { VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'q') }, /pertenece a otro proyecto/],
    ['service_role como anon', { VITE_SUPABASE_ANON_KEY: jwt('service_role', QA_PROJECT_REF, 'r') }, /rol|anon/],
    ['llave sb_secret_ como anon', { VITE_SUPABASE_ANON_KEY: j('sb_', 'secret_', 's'.repeat(24)) }, /llave secreta/],
  ]) {
    for (const quote of ['"', "'"]) {
      const r = checkFile(envText(qaVars(over), quote));
      assert.equal(r.status, 1, `${desc} con ${quote}: debería ser INVÁLIDO`);
      assert.match(r.stderr, re, desc);
    }
  }
});
test('MAJ-1 check:qa: archivo con comillas sin cerrar → INVÁLIDO', () => {
  const text = envText(qaVars()).replace(/^VITE_SUPABASE_ANON_KEY=(.*)$/m, 'VITE_SUPABASE_ANON_KEY="$1');
  const r = checkFile(text);
  assert.equal(r.status, 1); assert.match(r.stderr, /comillas sin cerrar/);
});
test('MAJ-1 verifyQaBundle: detecta una llave sb_secret_ en el bundle', () => {
  const d = mkdtempSync(path.join(dir, 'b-')); mkdirSync(path.join(d, 'assets'));
  const env = `const e={BASE_URL:"/",MODE:"qa",VITE_APP_ENV:"qa",VITE_SUPABASE_URL:"${QA_URL}",VITE_SUPABASE_ANON_KEY:"${j('sb_', 'secret_', 'x'.repeat(24))}",VITE_WOMPI_ENV:"sandbox",VITE_WOMPI_PUBLIC_KEY:"${PUB}"};`;
  writeFileSync(path.join(d, 'assets', 'index.js'), env);
  assert.ok(verifyQaBundle(d, QA_PROJECT_REF).some((e) => /llave secreta de Supabase/.test(e)));
});

// ===================================================================== MAJ-3
test('MAJ-3 el host del proyecto QA existente es válido en la lista de permitidos de QA', () => {
  assert.deepEqual(validateConfig(configWithQaHosts([QA_PROJECT_HOST])), []);
  assert.equal(isSupabaseUrlAllowed(configWithQaHosts([QA_PROJECT_HOST]), 'qa', QA_URL).ok, true);
  assert.equal(isSupabaseUrlAllowed(configWithQaHosts([]), 'qa', QA_URL).ok, false);
});
test('MAJ-3 guardas T2 y T6 con el host QA real configurado (fixture): aceptan QA y rechazan otro proyecto', () => {
  const cfg = configWithQaHosts([QA_PROJECT_HOST]);
  assert.deepEqual(checkEnv(qaVars(), cfg), []);
  assert.deepEqual(checkQaEnv(qaVars(), cfg).errors, []);
  assert.ok(checkQaEnv(qaVars({ VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'q') }), cfg).errors.some((e) => /otro proyecto/.test(e)));
  assert.ok(checkEnv(qaVars({ VITE_SUPABASE_URL: `https://${OTHER_REF}.supa${'base.co'}` }), cfg).some((e) => /no permitido/.test(e)));
});

// ===================================================================== MAJ-2
const { readServerConfig, SERVER_VARS } = await import('../../apps/web/api/_lib/serverConfig.js');
const { readClientConfig, ConfigError } = await import('../../apps/web/src/config/clientConfig.js');
const ALL = Object.keys(SERVER_VARS);
const PUB_PROD = j('pub_', 'prod_', 'w'.repeat(24));
const INT_PROD = j('prod_', 'integrity_', 'x'.repeat(24));
const EVT_PROD = j('prod_', 'events_', 'y'.repeat(24));
const srv = (over = {}) => ({ APP_ENV: 'qa', SUPABASE_URL: QA_URL, SUPABASE_SERVICE_ROLE_KEY: jwt('service_role', QA_PROJECT_REF, 'z'),
  WOMPI_PUBLIC_KEY: PUB, WOMPI_INTEGRITY_SECRET: j('test_', 'integrity_', 'i'.repeat(24)), WOMPI_EVENTS_SECRET: j('test_', 'events_', 'e'.repeat(24)), ...over });
const srvErr = (over) => { const r = readServerConfig(ALL, srv(over)); return r.ok ? [] : r.errors; };
test('MAJ-2 servidor: APP_ENV es obligatoria y solo admite local, qa o production', () => {
  assert.ok(srvErr({ APP_ENV: undefined }).some((e) => /^APP_ENV: obligatoria/.test(e)));
  assert.ok(srvErr({ APP_ENV: 'staging' }).some((e) => /^APP_ENV: debe ser local, qa o production/.test(e)));
  assert.equal(readServerConfig(['SUPABASE_URL'], { SUPABASE_URL: QA_URL }).ok, false, 'APP_ENV se exige aunque el endpoint no la pida');
});
test('MAJ-2 servidor: en qa y local se rechazan credenciales de producción de Wompi (criterio 2 en ejecución)', () => {
  for (const env of ['qa', 'local']) {
    const url = env === 'local' ? 'http://127.0.0.1:54321' : QA_URL;
    assert.ok(srvErr({ APP_ENV: env, SUPABASE_URL: url, WOMPI_PUBLIC_KEY: PUB_PROD, WOMPI_INTEGRITY_SECRET: INT_PROD, WOMPI_EVENTS_SECRET: EVT_PROD })
      .some((e) => new RegExp(`con APP_ENV=${env} solo se admite`).test(e)), env);
    assert.ok(srvErr({ APP_ENV: env, SUPABASE_URL: url, WOMPI_EVENTS_SECRET: EVT_PROD }).some((e) => /^WOMPI_EVENTS_SECRET: con APP_ENV/.test(e)), `${env}: secreto suelto`);
  }
});
test('MAJ-2 servidor: production acepta sus propias credenciales en un despliegue Production identificado (R1.1)', () => {
  const prod = { APP_ENV: 'production', SUPABASE_URL: `https://${OTHER_REF}.supa${'base.co'}`, WOMPI_PUBLIC_KEY: PUB_PROD, WOMPI_INTEGRITY_SECRET: INT_PROD, WOMPI_EVENTS_SECRET: EVT_PROD };
  assert.deepEqual(srvErr({ ...prod, VERCEL: '1', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' }), []);
  assert.ok(srvErr(prod).some((e) => /^APP_ENV: production solo se admite/.test(e)), 'sin identificar el despliegue, falla cerrado');
});
test('MAJ-2 servidor: local exige loopback y qa exige https sin loopback; el origen no admite fragmento (MIN-4)', () => {
  assert.ok(srvErr({ APP_ENV: 'local' }).some((e) => /solo se admite el stack local/.test(e)));
  assert.ok(srvErr({ SUPABASE_URL: 'http://127.0.0.1:54321' }).some((e) => /con APP_ENV=qa debe ser https/.test(e)));
  assert.ok(srvErr({ SUPABASE_URL: QA_URL + '/#x' }).some((e) => /fragmento/.test(e)));
});
const ALLOWED = (qa) => ({ local: ['127.0.0.1', 'localhost'], qa });
const cli = (over = {}) => ({ VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: QA_URL, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_PROJECT_REF, 'a'),
  VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox', ...over });
const cliErr = (env, qa = [QA_PROJECT_HOST]) => { try { readClientConfig(env, { allowedHosts: ALLOWED(qa) }); return []; } catch (e) { assert.ok(e instanceof ConfigError); return e.problems; } };
test('MAJ-2 cliente: VITE_APP_ENV obligatoria en ejecución', () => {
  assert.ok(cliErr(cli({ VITE_APP_ENV: undefined })).some((p) => /^VITE_APP_ENV: obligatoria/.test(p)));
});
test('MAJ-2 cliente: un build QA apuntando a otro proyecto (p. ej. Production) no arranca', () => {
  assert.deepEqual(cliErr(cli()), []);
  assert.ok(cliErr(cli({ VITE_SUPABASE_URL: `https://${OTHER_REF}.supa${'base.co'}` })).some((p) => /host no permitido para qa/.test(p)));
  assert.ok(cliErr(cli(), []).some((p) => /qa no tiene hosts permitidos/.test(p)));
  assert.ok(cliErr(cli({ VITE_APP_ENV: 'local' })).some((p) => /host no permitido para local/.test(p)), 'local con host remoto');
});
test('MAJ-2 cliente: production no se restringe por la lista de la fábrica, pero exige un despliegue Production identificado (R1.1)', () => {
  const prod = cli({ VITE_APP_ENV: 'production', VITE_SUPABASE_URL: `https://${OTHER_REF}.supa${'base.co'}`, VITE_WOMPI_PUBLIC_KEY: PUB_PROD, VITE_WOMPI_ENV: 'production' });
  assert.doesNotThrow(() => readClientConfig(prod, { allowedHosts: ALLOWED([QA_PROJECT_HOST]), deploy: { vercel: '1', env: 'production', ref: 'main' } }));
  assert.ok(cliErr(prod).some((p) => /production solo se admite/.test(p)), 'sin identificar el despliegue, falla cerrado');
});

// ------------------------------------------------------------------ MAJ-4
const readRepo = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
test('MAJ-4 seeds: ningún usuario seed recibe una contraseña fija (solo hash de un valor aleatorio)', () => {
  for (const f of readdirSync(path.join(ROOT, 'supabase/seeds')).filter((n) => n.endsWith('.sql'))) {
    const sql = readRepo(`supabase/seeds/${f}`);
    assert.doesNotMatch(sql, /crypt\(\s*'/, `${f}: crypt() con literal`);
    assert.doesNotMatch(sql, /encrypted_password\s*=\s*'/, `${f}: hash literal`);
  }
  assert.match(readRepo('supabase/seeds/00_qa_users.sql'), /extensions\.crypt\(gen_random_uuid\(\)::text,/);
});
test('MAJ-4 CI: las pruebas HTTP usan una contraseña aleatoria por ejecución, sin literal', () => {
  const py = readRepo('scripts/ci/lib/http_checks.py');
  assert.match(py, /RUN_PWD = secrets\.token_urlsafe\(/);
  assert.doesNotMatch(py, /"password":\s*"/, 'contraseña literal en una petición');
  assert.doesNotMatch(py, /pwd\s*=\s*"/, 'contraseña literal por defecto');
});
test('MAJ-4 / INF-3: la Edge Function del webhook se declara sin verificación de JWT de Supabase', () => {
  assert.match(readRepo('supabase/config.toml'), /\[functions\.wompi-webhook\]\s*\n(?:#.*\n)*verify_jwt = false/);
});
const FORBIDDEN_QA_OPS = new RegExp([['reset', '--' + 'linked'].join(' '), ['supabase', 'li' + 'nk', '--project' + '-ref'].join(' '), '`--' + 'remote`\\s'].join('|'));
test('MAJ-4 guías: ninguna instrucción usa reset/link sobre QA sin las salvaguardas', () => {
  for (const rel of ['MISION_26/06_T6_QA.md', 'MISION_26/08_T8_GUIA_QA.md']) {
    const lines = readRepo(rel).split('\n');
    for (const l of lines) {
      if (/Corrección M26-R1|Nunca|nunca/.test(l)) continue; // notas que describen lo prohibido
      // Patrón compuesto en ejecución: la regla 6 de la CI prohíbe órdenes remotas literales en la automatización.
      assert.doesNotMatch(l, FORBIDDEN_QA_OPS, `${rel}: ${l.slice(0, 80)}`);
    }
    const doc = lines.join('\n');
    assert.match(readRepo('MISION_26/06_T6_QA.md'), /Fase A[\s\S]*Copia de seguridad[\s\S]*Historial de migraciones[\s\S]*Versión de PostgreSQL[\s\S]*Fase C/);
    assert.doesNotMatch(doc, /Crear el proyecto Supabase \*\*QA\*\*/, `${rel}: aún pide crear QA`);
  }
});

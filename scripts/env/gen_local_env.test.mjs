// M26-T5 — Pruebas del generador del entorno local (node --test scripts/env/gen_local_env.test.mjs).
// El "status" de Supabase es un fixture ficticio compuesto en tiempo de ejecución (ninguna llave real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, statSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, TEMPLATE, EXIT, buildClientEnv, renderEnvFile, checkOutputPath } from './gen_local_env.mjs';
import { loadConfig } from './environments.mjs';
import { checkEnv } from './check_env.mjs';
import { parseEnv } from './templates.mjs';
import { readClientConfig } from '../../apps/web/src/config/clientConfig.js';

const cfg = loadConfig(path.join(ROOT, 'config/environments.json'));
const templateText = readFileSync(path.join(ROOT, TEMPLATE), 'utf8');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role })}.${fill.repeat(43)}`;
const ANON = jwt('anon', 'a');
const SERVICE = jwt('service_role', 'z');
const USER_KEY = ['pub', 'test', 'u'.repeat(24)].join('_');
const statusFixture = (over = {}) => ({
  API_URL: 'http://127.0.0.1:54321', DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  ANON_KEY: ANON, SERVICE_ROLE_KEY: SERVICE, PUBLISHABLE_KEY: ['sb', 'publishable', 'p'.repeat(20)].join('_'),
  SECRET_KEY: ['sb', 'secret', 's'.repeat(20)].join('_'), ...over,
});
const tmp = () => mkdtempSync(path.join(tmpdir(), 'jm-genenv-'));
const CLI = path.join(ROOT, 'scripts/env/gen_local_env.mjs');
const run = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
const writeStatus = (dir, status) => { const f = path.join(dir, 'status.json'); writeFileSync(f, JSON.stringify(status)); return f; };
const fileVars = (f) => Object.fromEntries(parseEnv(readFileSync(f, 'utf8')).entries.map((e) => [e.name, e.value]));
const noValues = (text) => [ANON, SERVICE, USER_KEY, 'z'.repeat(43), 'p'.repeat(20), 's'.repeat(20)].every((v) => !text.includes(v));

// ======================================================== lógica (función pura)
test('positivo: status local + llave sandbox del usuario → completo y compatible con T1/T2/T3', () => {
  const { vars, rejected, pending } = buildClientEnv(templateText, statusFixture(), cfg, { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
  assert.deepEqual(rejected, []); assert.deepEqual(pending, []);
  assert.equal(vars.VITE_SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(vars.VITE_SUPABASE_ANON_KEY, ANON);
  assert.equal(vars.VITE_APP_ENV, 'local'); assert.equal(vars.VITE_WOMPI_ENV, 'sandbox');
  assert.deepEqual(checkEnv(vars, cfg), []);
  assert.doesNotThrow(() => readClientConfig(vars));
});
test('positivo: sin llave de Wompi → se genera pero queda un paso pendiente del usuario (sin inventar la llave)', () => {
  const { vars, rejected, pending } = buildClientEnv(templateText, statusFixture(), cfg, {});
  assert.deepEqual(rejected, []);
  assert.equal(pending.length, 1); assert.match(pending[0], /^VITE_WOMPI_PUBLIC_KEY: añada su llave pública SANDBOX/);
  assert.equal(vars.VITE_WOMPI_PUBLIC_KEY, '');
});
test('positivo: puerto distinto en loopback y llave publicable cuando la CLI no da ANON_KEY', () => {
  const r = buildClientEnv(templateText, statusFixture({ API_URL: 'http://localhost:64321', ANON_KEY: undefined }), cfg, { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
  assert.deepEqual(r.rejected, []);
  assert.equal(r.vars.VITE_SUPABASE_URL, 'http://localhost:64321');
  assert.match(r.vars.VITE_SUPABASE_ANON_KEY, /^sb_publishable_/);
});
test('negativo: host que no es de loopback (proyecto remoto o cualquier otro) → rechazado', () => {
  for (const url of ['https://' + 'p'.repeat(20) + '.supa' + 'base.co', 'http://192.168.1.10:54321', 'http://example.com:54321']) {
    const r = buildClientEnv(templateText, statusFixture({ API_URL: url }), cfg, { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.ok(r.rejected.some((e) => e.startsWith('status.API_URL:')), url.slice(0, 12));
  }
});
test('negativo: la llave de servicio nunca acaba en el navegador', () => {
  for (const over of [{ ANON_KEY: SERVICE }, { ANON_KEY: SERVICE, PUBLISHABLE_KEY: undefined }]) {
    assert.ok(buildClientEnv(templateText, statusFixture(over), cfg, {}).rejected.some((e) => /no es una llave pública\/anon/.test(e)));
  }
  const same = statusFixture({ ANON_KEY: ['sb', 'secret', 'k'.repeat(20)].join('_') }); same.SECRET_KEY = same.ANON_KEY;
  assert.ok(buildClientEnv(templateText, same, cfg, {}).rejected.some((e) => /no es una llave pública\/anon/.test(e)));
});
test('negativo: status incompleto o inválido, y llave de Wompi de producción aportada por el usuario', () => {
  assert.ok(buildClientEnv(templateText, statusFixture({ API_URL: undefined }), cfg, {}).rejected.some((e) => /^status\.API_URL: ausente/.test(e)));
  assert.ok(buildClientEnv(templateText, statusFixture({ ANON_KEY: undefined, PUBLISHABLE_KEY: undefined }), cfg, {}).rejected.some((e) => /ausentes/.test(e)));
  assert.ok(buildClientEnv(templateText, null, cfg, {}).rejected.length === 1);
  const prodKey = ['pub', 'prod', 'x'.repeat(24)].join('_');
  assert.ok(buildClientEnv(templateText, statusFixture(), cfg, { VITE_WOMPI_PUBLIC_KEY: prodKey }).rejected.some((e) => /solo se admite una llave sandbox/.test(e)));
});
test('render: solo variables de cliente, sin nombres ni valores de servidor', () => {
  const { vars } = buildClientEnv(templateText, statusFixture(), cfg, { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
  const text = renderEnvFile(templateText, vars, 'prueba');
  const names = parseEnv(text).entries.map((e) => e.name);
  assert.deepEqual(names, ['VITE_APP_ENV', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_WOMPI_PUBLIC_KEY', 'VITE_WOMPI_ENV']);
  assert.ok(!text.includes(SERVICE) && !/SUPABASE_SERVICE_ROLE_KEY|WOMPI_.*SECRET|^SUPABASE_URL=/m.test(text));
});
test('destino: dentro del repo solo rutas ignoradas por git; un destino existente nunca se acepta', () => {
  assert.equal(checkOutputPath('scripts/env/generado.txt').ok, false, 'ruta versionable');
  assert.match(checkOutputPath('scripts/env/generado.txt').error, /no está ignorado por git/);
  assert.equal(checkOutputPath('apps/web/.env.local').ok, !existsSync(path.join(ROOT, 'apps/web/.env.local')));
  assert.equal(checkOutputPath('package.json').code, EXIT.EXISTS);
});

// ===================================================================== CLI real
test('CLI: con llave sandbox del usuario → exit 0, archivo 0600, solo nombres en la salida', () => {
  const d = tmp();
  try {
    const out = path.join(d, '.env.local');
    const r = run(['--status-file', writeStatus(d, statusFixture()), '--output', out], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.equal(r.status, EXIT.COMPLETE, r.stderr);
    assert.match(r.stdout, /COMPLETO/);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.deepEqual(checkEnv(fileVars(out), cfg), []);
    assert.ok(noValues(r.stdout + r.stderr), 'la salida no muestra valores');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('CLI: sin llave de Wompi → exit 3, archivo generado y pasos pendientes explícitos', () => {
  const d = tmp();
  try {
    const out = path.join(d, '.env.local');
    const r = run(['--status-file', writeStatus(d, statusFixture()), '--output', out]);
    assert.equal(r.status, EXIT.PENDING, r.stderr);
    assert.match(r.stdout, /PASOS PENDIENTES DEL USUARIO/);
    assert.match(r.stdout, /VITE_WOMPI_PUBLIC_KEY/);
    assert.equal(fileVars(out).VITE_WOMPI_PUBLIC_KEY, '');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('CLI: nunca sobrescribe un archivo existente (exit 4, contenido intacto)', () => {
  const d = tmp();
  try {
    const out = path.join(d, '.env.local');
    writeFileSync(out, 'VITE_APP_ENV=local\n# contenido del usuario\n');
    const r = run(['--status-file', writeStatus(d, statusFixture()), '--output', out], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.equal(r.status, EXIT.EXISTS);
    assert.equal(readFileSync(out, 'utf8'), 'VITE_APP_ENV=local\n# contenido del usuario\n');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('CLI: host remoto → exit 1 y no se escribe nada; destino versionable → exit 1', () => {
  const d = tmp();
  try {
    const out = path.join(d, '.env.local');
    const r = run(['--status-file', writeStatus(d, statusFixture({ API_URL: 'https://' + 'p'.repeat(20) + '.supa' + 'base.co' })), '--output', out], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.equal(r.status, EXIT.REJECTED); assert.match(r.stderr, /RECHAZADO/);
    assert.equal(existsSync(out), false);
    const r2 = run(['--status-file', writeStatus(d, statusFixture()), '--output', 'scripts/env/generado.txt'], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.equal(r2.status, EXIT.REJECTED); assert.match(r2.stderr, /no está ignorado por git/);
    assert.equal(existsSync(path.join(ROOT, 'scripts/env/generado.txt')), false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
test('CLI: --dry-run valida sin escribir; opción desconocida y status ilegible → exit 2', () => {
  const d = tmp();
  try {
    const out = path.join(d, '.env.local');
    const r = run(['--status-file', writeStatus(d, statusFixture()), '--output', out, '--dry-run'], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
    assert.equal(r.status, EXIT.COMPLETE); assert.equal(existsSync(out), false);
    assert.equal(run(['--forzar']).status, EXIT.USAGE);
    writeFileSync(path.join(d, 'roto.json'), '{no json');
    assert.equal(run(['--status-file', path.join(d, 'roto.json'), '--output', out]).status, EXIT.USAGE);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// ============================================ M26-T6: separación local / QA
test('T6 negativo: el generador local nunca escribe un archivo de QA (ruta o nombre con "qa")', () => {
  for (const p of ['apps/web/.env.qa', 'apps/web/.env.qa.local', path.join(tmpdir(), 'qa', 'x.env'), path.join(tmpdir(), 'jm-qa.env'), path.join(tmpdir(), 'x.qa.env')]) {
    const r = checkOutputPath(p);
    assert.equal(r.ok, false, p); assert.equal(r.code, EXIT.REJECTED); assert.match(r.error, /archivo de QA/);
  }
});
test('T6 negativo: el generador nunca escribe en config/env/ (plantillas versionadas, local y QA)', () => {
  for (const p of [TEMPLATE, 'config/env/nuevo.env']) {
    const r = checkOutputPath(p);
    assert.equal(r.ok, false, p); assert.match(r.error, /config\/env\//);
  }
  // La plantilla QA queda rechazada por ambas reglas; la de QA se evalúa primero.
  assert.match(checkOutputPath('config/env/qa.env.example').error, /archivo de QA|config\/env\//);
});
test('T6 positivo: nombres que solo contienen la secuencia "qa" dentro de otra palabra no se confunden con QA', () => {
  for (const p of [path.join(tmpdir(), 'aqa.env'), path.join(tmpdir(), 'quality.env')]) assert.equal(checkOutputPath(p).ok, true, p);
});
test('T6 CLI: --output hacia un archivo de QA → exit 1, sin escribir, y la plantilla QA queda intacta', () => {
  const d = tmp();
  const qaTemplate = path.join(ROOT, 'config/env/qa.env.example');
  const before = readFileSync(qaTemplate, 'utf8');
  try {
    for (const out of [path.join(d, '.env.qa'), 'config/env/qa.env.example']) {
      const r = run(['--status-file', writeStatus(d, statusFixture()), '--output', out], { VITE_WOMPI_PUBLIC_KEY: USER_KEY });
      assert.equal(r.status, EXIT.REJECTED, out);
    }
    assert.equal(existsSync(path.join(d, '.env.qa')), false);
    assert.equal(readFileSync(qaTemplate, 'utf8'), before);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

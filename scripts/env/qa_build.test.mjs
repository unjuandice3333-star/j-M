// M26-T8 — Pruebas de los comandos del perfil QA (node --test scripts/env/qa_build.test.mjs).
// Proyecto, llaves y secretos QA ficticios compuestos en tiempo de ejecución; host QA permitido solo en una
// configuración fixture (--config). Se ejecuta Vite de verdad (build, preview y dev) sin red ni servicios remotos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ROOT, WEB, QA_OUT_DIR, QA_PORTS, verifyQaBundle, selectViteVars, loadQaFile } from './qa_build.mjs';
import { loadConfig } from './environments.mjs';
import { configFileWithQaHosts } from './test_fixtures.mjs';

const SB = '.supa' + 'base.co';
const QA_REF = 'w'.repeat(20);
const OTHER_REF = 'x'.repeat(20);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role, ref, fill) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role })}.${fill.repeat(43)}`;
const j = (...p) => p.join('');
const PUB = j('pub_', 'test_', 'y'.repeat(24));
const SECRET_VALUES = [jwt('service_role', QA_REF, 'z'), j('test_', 'integrity_', 'u'.repeat(24)), j('test_', 'events_', 'v'.repeat(24))];
const qaVars = (over = {}) => ({
  APP_ENV: 'qa', VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: `https://${QA_REF}${SB}`, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_REF, 'a'),
  VITE_WOMPI_PUBLIC_KEY: PUB, VITE_WOMPI_ENV: 'sandbox', SUPABASE_URL: `https://${QA_REF}${SB}`,
  SUPABASE_SERVICE_ROLE_KEY: SECRET_VALUES[0], WOMPI_PUBLIC_KEY: PUB, WOMPI_INTEGRITY_SECRET: SECRET_VALUES[1],
  WOMPI_EVENTS_SECRET: SECRET_VALUES[2], ...over,
});
const dir = mkdtempSync(path.join(tmpdir(), 'jm-qa-build-test-'));
const envFile = (name, vars) => { const f = path.join(dir, name); writeFileSync(f, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'); return f; };
const cfg = loadConfig(path.join(ROOT, 'config/environments.json'));
cfg.environments.qa.supabase.allowed_hosts = [`${QA_REF}${SB}`];
const CFG = path.join(dir, 'environments.fixture.json'); writeFileSync(CFG, JSON.stringify(cfg));
// M26-R1 (MAJ-3): configuración con QA vacía explícita (no depende del archivo versionado).
const CFG_EMPTY = configFileWithQaHosts([], dir);
const CLI = path.join(ROOT, 'scripts/env/qa_build.mjs');
// Entorno del proceso deliberadamente contaminado con configuración LOCAL: no debe llegar al bundle QA.
const POLLUTED = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_APP_ENV: 'local', VITE_SENTINELA_PROCESO: 'valor-sentinela-proceso' };
// M35: límite de tiempo + un reintento solo si el proceso se agota (cuelgues intermitentes del build de Vite bajo carga).
const run = (...args) => {
  const go = () => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: POLLUTED, cwd: ROOT, timeout: 150_000, killSignal: 'SIGKILL' });
  const r = go();
  return r.error?.code === 'ETIMEDOUT' ? go() : r;
};
const noLeak = (text) => [...SECRET_VALUES, 'valor-sentinela'].every((v) => !text.includes(v));

// Estado local que no debe alterarse
const LOCAL_ENV = path.join(WEB, '.env.local');
const hadLocalEnv = existsSync(LOCAL_ENV);
const treeHash = (d) => (existsSync(d) ? createHash('sha256').update(walkList(d).join('\n')).digest('hex') : 'ausente');
function walkList(d) { const out = []; (function w(x) { for (const n of readdirSync(x)) { const p = path.join(x, n); const st = statSync(p); if (st.isDirectory()) w(p); else out.push(`${path.relative(d, p)}:${st.size}:${st.mtimeMs}`); } })(d); return out.sort(); }
const distBefore = treeHash(path.join(WEB, 'dist'));
if (!hadLocalEnv) writeFileSync(LOCAL_ENV, 'VITE_SENTINELA_LOCAL=valor-sentinela-local\nVITE_SUPABASE_URL=http://127.0.0.1:54321\n');
const localEnvBefore = readFileSync(LOCAL_ENV, 'utf8');
const hadQaOut = existsSync(QA_OUT_DIR);
after(() => {
  if (!hadLocalEnv) rmSync(LOCAL_ENV, { force: true });
  if (!hadQaOut) rmSync(QA_OUT_DIR, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

// ================================================== verificación del bundle (pura)
const fakeBundle = (content) => { const d = mkdtempSync(path.join(dir, 'b-')); mkdirSync(path.join(d, 'assets')); writeFileSync(path.join(d, 'assets', 'index.js'), content); return d; };
const envObj = (over = {}) => {
  const v = { VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: `https://${QA_REF}${SB}`, VITE_SUPABASE_ANON_KEY: jwt('anon', QA_REF, 'a'), VITE_WOMPI_ENV: 'sandbox', VITE_WOMPI_PUBLIC_KEY: PUB, ...over };
  return `const e={BASE_URL:"/",MODE:"${over.MODE ?? 'qa'}",DEV:!1,PROD:!0,SSR:!1,${Object.entries(v).filter(([k]) => k !== 'MODE').map(([k, x]) => `${k}:"${x}"`).join(',')}};`;
};
const LIB = 'const y1="http://localhost:9999";'; // constante interna de supabase-js
test('bundle positivo: configuración QA exacta (la constante de loopback de la librería no cuenta)', () => {
  assert.deepEqual(verifyQaBundle(fakeBundle(envObj() + LIB), QA_REF), []);
});
test('bundle negativo: host de otro proyecto (p. ej. Production)', () => {
  assert.ok(verifyQaBundle(fakeBundle(envObj() + `fetch("https://${OTHER_REF}${SB}")`), QA_REF).some((e) => /distinto del proyecto QA/.test(e)));
});
test('bundle negativo: variable local filtrada, variable QA ausente, valor de loopback y modo distinto de qa', () => {
  assert.ok(verifyQaBundle(fakeBundle(envObj({ VITE_SENTINELA_LOCAL: 'x' })), QA_REF).some((e) => /VITE_SENTINELA_LOCAL incrustada/.test(e)));
  const sinWompi = envObj().replace(/,VITE_WOMPI_ENV:"sandbox"/, '');
  assert.ok(verifyQaBundle(fakeBundle(sinWompi), QA_REF).some((e) => /falta VITE_WOMPI_ENV/.test(e)));
  const loop = envObj({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }) + `"https://${QA_REF}${SB}"`;
  assert.ok(verifyQaBundle(fakeBundle(loop), QA_REF).some((e) => /VITE_SUPABASE_URL apunta a loopback/.test(e)));
  assert.ok(verifyQaBundle(fakeBundle(envObj({ MODE: 'production' })), QA_REF).some((e) => /modo del build no es "qa"/.test(e)));
});
test('bundle negativo: JWT de servicio, nombre de secreto de servidor, sin host QA o sin configuración incrustada', () => {
  assert.ok(verifyQaBundle(fakeBundle(envObj() + `"${jwt('service_role', QA_REF, 's')}"`), QA_REF).some((e) => /rol distinto de anon/.test(e)));
  assert.ok(verifyQaBundle(fakeBundle(envObj() + '"SUPABASE_SERVICE_ROLE_KEY"'), QA_REF).some((e) => /secreto de servidor/.test(e)));
  assert.ok(verifyQaBundle(fakeBundle(envObj({ VITE_SUPABASE_URL: 'https://example.com' })), QA_REF).some((e) => /no contiene el host del proyecto QA/.test(e)));
  assert.ok(verifyQaBundle(fakeBundle(`"https://${QA_REF}${SB}"`), QA_REF).some((e) => /configuración incrustada/.test(e)));
});
test('selectViteVars: solo las 5 variables de cliente, nunca secretos de servidor', () => {
  assert.deepEqual(Object.keys(selectViteVars(qaVars())).sort(), ['VITE_APP_ENV', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_WOMPI_ENV', 'VITE_WOMPI_PUBLIC_KEY']);
});
test('loadQaFile negativo: Production, otro proyecto o QA sin configurar; los mensajes no muestran valores', () => {
  for (const [vars, c, re] of [
    [qaVars({ VITE_APP_ENV: 'production' }), CFG, /VITE_APP_ENV/],
    [qaVars({ VITE_SUPABASE_ANON_KEY: jwt('anon', OTHER_REF, 'b') }), CFG, /otro proyecto/],
    [qaVars({ WOMPI_PUBLIC_KEY: j('pub_', 'prod_', 'q'.repeat(24)) }), CFG, /sandbox|WOMPI/],
    [qaVars(), CFG_EMPTY, /aún no ha configurado/],
  ]) {
    const r = loadQaFile(envFile('neg.env', vars), c);
    assert.equal(r.code, 1); assert.match(r.error, re); assert.ok(noLeak(r.error) && !r.error.includes(OTHER_REF));
  }
});

// ======================================================== CLI real (Vite)
test('build:qa negativo: configuración inválida → exit 1 ANTES de Vite (no se genera dist-qa)', () => {
  rmSync(QA_OUT_DIR, { recursive: true, force: true });
  const r = run('build', '--file', envFile('prod.env', qaVars({ VITE_APP_ENV: 'production' })), '--config', CFG);
  assert.equal(r.status, 1); assert.match(r.stderr, /QA: BLOQUEADO/);
  assert.equal(existsSync(QA_OUT_DIR), false);
  assert.ok(noLeak(r.stdout + r.stderr));
  assert.equal(run('build', '--file', envFile('ok0.env', qaVars()), '--config', CFG_EMPTY).status, 1, 'QA sin configurar');
  assert.equal(run('build').status, 2); assert.equal(run('otro', '--file', 'x').status, 2);
});
test('preview:qa negativo: sin un build QA verificado → exit 1', () => {
  rmSync(QA_OUT_DIR, { recursive: true, force: true });
  assert.equal(run('preview', '--file', envFile('ok1.env', qaVars()), '--config', CFG).status, 1);
});
test('build:qa positivo con entorno local contaminado: bundle solo QA, sin filtración local, local intacto', () => {
  const r = run('build', '--file', envFile('ok.env', qaVars()), '--config', CFG);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /QA: build OK/);
  assert.ok(noLeak(r.stdout + r.stderr));
  assert.deepEqual(verifyQaBundle(QA_OUT_DIR, QA_REF), []);
  const bundle = readdirSync(path.join(QA_OUT_DIR, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(QA_OUT_DIR, 'assets', f), 'utf8')).join('\n');
  assert.ok(bundle.includes(`${QA_REF}${SB}`), 'host QA en el bundle');
  for (const v of ['valor-sentinela-local', 'valor-sentinela-proceso', 'VITE_SENTINELA', 'http://127.0.0.1:54321']) assert.ok(!bundle.includes(v), `no debe contener ${v.slice(0, 14)}…`);
  for (const v of SECRET_VALUES) assert.ok(!bundle.includes(v), 'sin secretos de servidor en el bundle');
  assert.equal(readFileSync(LOCAL_ENV, 'utf8'), localEnvBefore, '.env.local intacto');
  assert.equal(treeHash(path.join(WEB, 'dist')), distBefore, 'build local (dist/) intacto');
});

const waitFor = async (url, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); return r; } catch { await new Promise((s) => setTimeout(s, 300)); } } throw new Error('no respondió'); };
// El puerto debe estar libre antes de arrancar: una respuesta de otro proceso no puede pasar por la del servidor QA.
const portFree = (port) => new Promise((resolve) => { import('node:net').then(({ createServer }) => {
  const s = createServer(); s.once('error', () => resolve(false)); s.once('listening', () => s.close(() => resolve(true))); s.listen(port, '127.0.0.1'); }); });
async function serve(cmd, port, check) {
  assert.equal(await portFree(port), true, `el puerto ${port} está ocupado antes de la prueba`);
  // M35: el servidor (Vite) cuelga de un proceso intermedio que puede dejar las tuberías abiertas tras un SIGTERM; el evento
  // 'close' no llegaba nunca y la prueba (y el job de CI) se quedaba colgada. Se lanza en su propio grupo de procesos
  // (POSIX), se mata el grupo entero (SIGTERM y, si no sale en 8 s, SIGKILL) y la espera del cierre tiene tope.
  const group = process.platform !== 'win32';
  const p = spawn(process.execPath, [CLI, cmd, '--file', envFile(`${cmd}.env`, qaVars()), '--config', CFG], { env: POLLUTED, cwd: ROOT, detached: group });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  // 'close' (no 'exit'): garantiza que la salida del proceso se ha leído completa.
  const closed = new Promise((s) => p.on('close', s));
  const killGroup = (sig) => { try { group ? process.kill(-p.pid, sig) : p.kill(sig); } catch { /* ya terminó */ } };
  try { await check(await waitFor(`http://127.0.0.1:${port}/`)); } finally {
    killGroup('SIGTERM');
    const done = await Promise.race([closed.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]);
    if (!done) { killGroup('SIGKILL'); p.stdout.destroy(); p.stderr.destroy(); await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]); }
  }
  assert.ok(noLeak(out), 'la salida del servidor no muestra valores');
  return out;
}
test('preview:qa positivo: sirve el build QA en su propio puerto (127.0.0.1)', async () => {
  const out = await serve('preview', QA_PORTS.preview, async (res) => {
    assert.equal(res.status, 200); assert.match(await res.text(), /<div id="root">/);
  });
  assert.match(out, new RegExp(`127\\.0\\.0\\.1:${QA_PORTS.preview}`));
});
test('dev:qa positivo: servidor de desarrollo QA con la configuración QA y sin variables locales', async () => {
  await serve('dev', QA_PORTS.dev, async (res) => {
    assert.equal(res.status, 200);
    const mod = await (await fetch(`http://127.0.0.1:${QA_PORTS.dev}/src/config/runtimeConfig.js`)).text();
    assert.ok(mod.includes(`${QA_REF}${SB}`), 'import.meta.env con el host QA');
    assert.ok(!mod.includes('valor-sentinela') && !mod.includes('127.0.0.1:54321'), 'sin configuración local');
  });
  assert.equal(readFileSync(LOCAL_ENV, 'utf8'), localEnvBefore, '.env.local intacto');
});

// ============================================================ M26-R1
test('MAJ-2 verifyQaBundle: VITE_SUPABASE_URL incrustada distinta de la del proyecto QA → rechazado', () => {
  const env = envObj({ VITE_SUPABASE_URL: `https://${OTHER_REF}${SB}` }) + `"${QA_REF}${SB}"`;
  assert.ok(verifyQaBundle(fakeBundle(env), QA_REF).some((e) => /VITE_SUPABASE_URL incrustada no es la del proyecto QA/.test(e)));
});
test('MAJ-2 build:qa incrusta la MISMA lista de permitidos que validó check:qa (--config)', () => {
  const r = run('build', '--file', envFile('cfg.env', qaVars()), '--config', CFG);
  assert.equal(r.status, 0, r.stderr);
  const js = readdirSync(path.join(QA_OUT_DIR, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(QA_OUT_DIR, 'assets', f), 'utf8')).join('\n');
  // M26-R1.1: el cliente incrusta la copia generada de la lista; Vite la reduce a constantes por clave
  // (p. ej. `…=["127.0.0.1","localhost"],XY=["<host QA>"]`). Se exige el host QA validado como elemento de un array
  // literal propio (no solo dentro de la cadena VITE_SUPABASE_URL "https://…").
  assert.ok(js.includes(`=["${QA_REF}${SB}"]`), 'la lista de QA incrustada contiene el host QA validado');
});
test('MIN-2 un build QA rechazado por la verificación no deja artefactos en disco', async () => {
  const { buildQa } = await import('./qa_build.mjs');
  const out = path.join(dir, 'dist-rechazado');
  // ref distinto del de la URL → la verificación falla tras un build real
  const errors = await buildQa(qaVars(), OTHER_REF, out, CFG);
  assert.ok(errors.length > 0);
  assert.equal(existsSync(out), false);
});

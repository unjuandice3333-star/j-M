// M26-R1.1 (MAJ-2) — El build REAL de Vite (el mismo comando que ejecuta Vercel: vite build en apps/web) aplica la
// guarda de despliegue. Procesos con entorno limpio y señales de Vercel simuladas; fixtures ficticios.
// Secuencial (pnpm test:qa-build): cada caso es un build completo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB = path.join(ROOT, 'apps/web');
const SB = '.supa' + 'base.co';
const j = (...p) => p.join('');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const anon = (ref) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref, role: 'anon' })}.${'a'.repeat(43)}`;
const PROD_REF = 'v'.repeat(20); const QA_REF = 'c'.repeat(20);
const BRANCH = 'mission/m26-dev-qa-environments';
const PROD_VITE = { VITE_APP_ENV: 'production', VITE_SUPABASE_URL: `https://${PROD_REF}${SB}`, VITE_SUPABASE_ANON_KEY: anon(PROD_REF), VITE_WOMPI_PUBLIC_KEY: j('pub_', 'prod_', 'b'.repeat(24)), VITE_WOMPI_ENV: 'production' };
const QA_VITE = { VITE_APP_ENV: 'qa', VITE_SUPABASE_URL: `https://${QA_REF}${SB}`, VITE_SUPABASE_ANON_KEY: anon(QA_REF), VITE_WOMPI_PUBLIC_KEY: j('pub_', 'test_', 'a'.repeat(24)), VITE_WOMPI_ENV: 'sandbox' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', VERCEL_GIT_COMMIT_REF: BRANCH };
const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };

// Build REAL de Vite con la configuración de apps/web, pero con un envDir vacío: el resultado no depende de archivos
// .env* locales del desarrollador (Vite siempre lee apps/web/.env.local); las variables llegan solo por el proceso.
const BUILD_SCRIPT = `
  const [vitePath, root, outDir, envDir] = process.argv.slice(1);
  const { build } = await import(vitePath);
  await build({ root, configFile: root + '/vite.config.js', envDir, logLevel: 'error', build: { outDir, emptyOutDir: true } });
`;
function viteBuild(env) {
  const out = mkdtempSync(path.join(tmpdir(), 'jm-deploy-build-'));
  const envDir = mkdtempSync(path.join(tmpdir(), 'jm-deploy-envdir-'));
  const vitePath = pathToFileURL(path.join(WEB, 'node_modules/vite/dist/node/index.js')).href;
  // M35: el build de Vite se cuelga de forma intermitente bajo carga (visto en GitHub Actions y en local: el job `quality`
  // quedaba >12 min). Límite de tiempo + UN reintento solo si el proceso se agota (no si el build falla con un estado):
  // así un cuelgue no bloquea la CI y un fallo real de la guarda sigue fallando.
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', BUILD_SCRIPT, vitePath, WEB, out, envDir],
    { cwd: WEB, encoding: 'utf8', timeout: 90_000, killSignal: 'SIGKILL', env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8', ...env } });
  let r = run();
  if (r.error?.code === 'ETIMEDOUT') r = run();
  const files = existsSync(path.join(out, 'assets')) ? readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.js')) : [];
  const bundle = files.map((f) => readFileSync(path.join(out, 'assets', f), 'utf8')).join('\n');
  rmSync(out, { recursive: true, force: true }); rmSync(envDir, { recursive: true, force: true });
  return { status: r.status, text: `${r.stdout}${r.stderr}`, built: files.length > 0, bundle };
}
const rejected = (r, re) => {
  assert.notEqual(r.status, 0, 'el build debía fallar');
  assert.equal(r.built, false, 'no debe quedar bundle');
  assert.match(r.text, /\[Guarda de despliegue\] Configuración rechazada/);
  if (re) assert.match(r.text, re);
  for (const v of [PROD_VITE.VITE_WOMPI_PUBLIC_KEY, PROD_REF]) assert.ok(!r.text.includes(v), 'el error revela un valor');
};

test('build Preview con configuración de Production → el build FALLA', () => {
  rejected(viteBuild({ ...PREVIEW, ...PROD_VITE, APP_ENV: 'production' }), /Preview solo admite qa/);
});
test('build Preview con VITE_APP_ENV=production y el resto de QA → FALLA', () => {
  rejected(viteBuild({ ...PREVIEW, ...QA_VITE, VITE_APP_ENV: 'production' }), /Preview solo admite qa/);
});
test('build Preview con APP_ENV=production y cliente qa (contradictorio) → FALLA', () => {
  rejected(viteBuild({ ...PREVIEW, ...QA_VITE, APP_ENV: 'production' }), /contradictorias/);
});
test('build Preview sin VITE_APP_ENV → FALLA (falla cerrado)', () => {
  const { VITE_APP_ENV: _omit, ...rest } = QA_VITE;
  rejected(viteBuild({ ...PREVIEW, ...rest }), /obligatoria en un despliegue de Vercel/);
});
test('build con configuración de Production sin señales de Vercel (local/CI) → FALLA', () => {
  rejected(viteBuild({ ...PROD_VITE }), /production solo se admite/);
});
test('build Production desde una rama distinta de main → FALLA', () => {
  rejected(viteBuild({ ...PRODUCTION, VERCEL_GIT_COMMIT_REF: BRANCH, ...PROD_VITE, APP_ENV: 'production' }), /rama main/);
});
test('build Preview con configuración QA → se construye; el bundle lleva las señales sin el nombre de la rama', () => {
  const r = viteBuild({ ...PREVIEW, ...QA_VITE, APP_ENV: 'qa' });
  assert.equal(r.status, 0, r.text); assert.ok(r.built);
  assert.match(r.bundle, /env:"preview"/); assert.ok(!r.bundle.includes(BRANCH), 'la rama no debe incrustarse');
});
test('build Production legítimo (VERCEL_ENV=production, rama main) → se construye con las señales de Production', () => {
  const r = viteBuild({ ...PRODUCTION, ...PROD_VITE, APP_ENV: 'production' });
  assert.equal(r.status, 0, r.text); assert.ok(r.built);
  assert.match(r.bundle, /env:"production"/);
});
test('build local sin variables de Vercel → se construye (local no depende de Vercel)', () => {
  const r = viteBuild({ ...QA_VITE, VITE_APP_ENV: 'local', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: anon(undefined) });
  assert.equal(r.status, 0, r.text); assert.ok(r.built);
});

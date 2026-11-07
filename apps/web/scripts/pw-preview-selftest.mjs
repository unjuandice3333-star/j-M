// Autoprueba del modo `preview` de Playwright (M36.2.1) SIN Vercel real ni Windows: levanta el backend sintético, la tienda
// (Vite) y un deployment protegido simulado, y ejecuta Playwright en modo preview con un secreto aleatorio contra él.
// Comprueba: global-setup obtiene y PERSISTE el storage state, Playwright lo lee, las pruebas pasan a través de la protección,
// la cabecera de bypass se envía UNA sola vez (la de Node) y el archivo no contiene el secreto. Multiplataforma.
//   node scripts/pw-preview-selftest.mjs [--project=chromium|edge]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB, '../..');
const project = (process.argv.find((a) => a.startsWith('--project=')) ?? '--project=chromium').split('=')[1];
const WEB_PORT = 3110; const API_PORT = 54321; const FAKE_PORT = 3120;
const secret = process.env.SELFTEST_SECRET || `selftest-${randomBytes(12).toString('hex')}`; // fijable solo para buscarlo en artefactos

const ci = {};
for (const l of readFileSync(path.join(ROOT, 'config/env/local-ci.env'), 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m) ci[m[1]] = m[2]; }

const backend = await require('../e2e/synthetic/backend.cjs').start(API_PORT);
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(WEB_PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: WEB, env: { ...process.env, ...ci }, stdio: 'ignore' });
let fake; let code = 1;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${WEB_PORT}/`)).ok) break; } catch { /* arrancando */ } await new Promise((r) => setTimeout(r, 500)); }
  fake = await require('../e2e/synthetic/fake-vercel.cjs').start({ port: FAKE_PORT, secret, upstream: `http://127.0.0.1:${WEB_PORT}` });
  const authFile = path.join(WEB, '.auth', 'vercel.json');
  rmSync(authFile, { force: true });
  const spec = (process.argv.find((a) => a.startsWith('--spec=')) ?? '--spec=e2e/playwright/00-health.spec.js').split('=')[1];
  const args = [path.join(WEB, 'scripts', 'pw.mjs'), 'preview', `--project=${project}`, spec]; // el envoltorio real (incluye el saneado de trazas)
  code = await new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: WEB, stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${FAKE_PORT}`, VERCEL_AUTOMATION_BYPASS_SECRET: secret, CI: '' } });
    p.on('exit', (c) => resolve(c ?? 1));
  });
  const stats = fake.stats;
  const problems = [];
  if (code !== 0) problems.push(`Playwright terminó con código ${code}`);
  if (!existsSync(authFile)) problems.push('no existe apps/web/.auth/vercel.json');
  else {
    const raw = readFileSync(authFile, 'utf8');
    if (raw.includes(secret)) problems.push('el storage state contiene el secreto de bypass');
    const st = JSON.parse(raw);
    if (!Array.isArray(st.cookies) || !st.cookies.some((c) => c.name === '_vercel_jwt' && c.domain === '127.0.0.1')) problems.push('el storage state no tiene la cookie _vercel_jwt del dominio exacto');
    if (process.platform !== 'win32' && (statSync(authFile).mode & 0o077) !== 0) problems.push('permisos del storage state demasiado abiertos');
  }
  if (stats.withBypassHeader !== 1) problems.push(`la cabecera de bypass se envió ${stats.withBypassHeader} veces (debe ser 1: solo la de Node)`);
  if (stats.withCookie === 0) problems.push('el navegador no usó la cookie de bypass');
  console.log(`\n[selftest] cabecera de bypass: ${stats.withBypassHeader} · peticiones con cookie: ${stats.withCookie} · rechazadas: ${stats.rejected}`);
  if (problems.length) { console.error(`[selftest] FALLÓ:\n - ${problems.join('\n - ')}`); code = 1; } else console.log('[selftest] OK');
} finally {
  vite.kill(); await backend.close(); if (fake) await fake.close();
}
process.exit(code);

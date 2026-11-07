// Envoltorio multiplataforma (Windows/macOS/Linux) para Playwright (M36): fija E2E_TARGET sin sintaxis de shell.
//   node scripts/pw.mjs local   [args de playwright…]
//   node scripts/pw.mjs preview [args de playwright…]     (exige PLAYWRIGHT_BASE_URL=https://…)
// M36.2.1: con el bypass de Vercel activo, las trazas (.zip) registran la cookie de sesión. Este envoltorio habilita las trazas
// (PW_TRACE_SCRUBBED=1) y, al terminar, las SANEA (test-results y playwright-report): sustituye la cookie y el secreto por
// «<redactado>» y falla si queda algún rastro. Sin este envoltorio (playwright test directo) las trazas quedan desactivadas.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrubDirs } from '../e2e/playwright/scrubZip.js';
import { AUTH_STATE_FILE } from '../e2e/playwright/authState.js';

const [target, ...rest] = process.argv.slice(2);
if (!['local', 'preview'].includes(target)) { console.error('uso: node scripts/pw.mjs <local|preview> [args de playwright]'); process.exit(2); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const child = spawn(process.execPath, [cli, 'test', ...rest], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_TARGET: target, PW_TRACE_SCRUBBED: '1' } });
child.on('exit', (code, signal) => {
  let exit = code ?? (signal ? 1 : 0);
  if (target === 'preview') {
    const needles = [process.env.VERCEL_AUTOMATION_BYPASS_SECRET];
    try { if (existsSync(AUTH_STATE_FILE)) for (const c of JSON.parse(readFileSync(AUTH_STATE_FILE, 'utf8')).cookies ?? []) needles.push(c.value); } catch { /* sin estado */ }
    const r = scrubDirs([path.join(root, 'test-results'), path.join(root, 'playwright-report')], needles.filter(Boolean));
    console.log(`[scrub] ${r.zips} traza(s) revisadas · ${r.entries} entrada(s) saneadas`);
    if (r.leaks.length) { console.error(`[scrub] RASTROS DE COOKIE/SECRETO en:\n - ${r.leaks.join('\n - ')}`); exit = 1; }
  }
  process.exit(exit);
});

// Envoltorio multiplataforma (Windows/macOS/Linux) para Playwright (M36): fija E2E_TARGET sin sintaxis de shell.
//   node scripts/pw.mjs local   [args de playwright…]
//   node scripts/pw.mjs preview [args de playwright…]     (exige BASE_URL=https://…)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [target, ...rest] = process.argv.slice(2);
if (!['local', 'preview'].includes(target)) { console.error('uso: node scripts/pw.mjs <local|preview> [args de playwright]'); process.exit(2); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const child = spawn(process.execPath, [cli, 'test', ...rest], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_TARGET: target } });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

// =============================================================================
// M26-T5 — Generación del entorno LOCAL del navegador a partir del stack local de Supabase.
//
// Fuente:     `supabase status -o json` del stack local (o --status-file para pruebas)
// Plantilla:  config/env/local.env.example (T4)
// Destino:    apps/web/.env.local (ignorado por git) — solo variables VITE_* (cliente). Los secretos de servidor no se
//             escriben aquí: el archivo lo lee Vite para el navegador.
//
// Reglas:
//   · Solo hosts de loopback (127.0.0.1 / localhost) y permitidos por config/environments.json para "local" (T1).
//   · Nunca sobrescribe: creación exclusiva; si el destino existe → exit 4.
//   · Dentro del repositorio solo escribe en rutas ignoradas por git. Permisos 0600.
//   · No inventa credenciales: la llave pública de Wompi solo se incluye si el usuario la aporta en el entorno
//     (VITE_WOMPI_PUBLIC_KEY, debe ser pub_test_…); si no, queda vacía y se informa como paso pendiente.
//   · Valida el resultado con las guardas T1 (lista de permitidos), T2 (guarda de build) y T3 (configuración de cliente).
//   · Nunca imprime valores: solo nombres de variables.
//
// Uso: node scripts/env/gen_local_env.mjs [--status-file f.json] [--output ruta] [--dry-run]
// Salida: 0 completo · 3 generado con pasos pendientes del usuario · 1 rechazado · 2 uso/lectura · 4 destino existente
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, isSupabaseUrlAllowed } from './environments.mjs';
import { checkEnv, REQUIRED_VARS } from './check_env.mjs';
import { parseEnv } from './templates.mjs';
import { readClientConfig, jwtRole } from '../../apps/web/src/config/clientConfig.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEFAULT_OUTPUT = 'apps/web/.env.local';
export const TEMPLATE = 'config/env/local.env.example';
export const EXIT = Object.freeze({ COMPLETE: 0, REJECTED: 1, USAGE: 2, PENDING: 3, EXISTS: 4 });

/**
 * Construye las variables del cliente a partir de la plantilla y del status del stack local. Función pura.
 * @returns {{ vars: Record<string,string>, rejected: string[], pending: string[] }}
 */
export function buildClientEnv(templateText, status, cfg, userEnv = {}) {
  const rejected = [];
  const pending = [];
  const template = Object.fromEntries(parseEnv(templateText).entries.filter((e) => e.name.startsWith('VITE_')).map((e) => [e.name, e.value]));
  const vars = { ...template };

  if (!status || typeof status !== 'object') return { vars, rejected: ['status: no es un objeto JSON de `supabase status -o json`'], pending };

  // URL: la del stack local, solo loopback y permitida para "local"
  const apiUrl = typeof status.API_URL === 'string' ? status.API_URL.trim() : '';
  if (!apiUrl) rejected.push('status.API_URL: ausente (¿está arrancado el stack local? `supabase start`)');
  else {
    const allowed = isSupabaseUrlAllowed(cfg, 'local', apiUrl);
    if (!allowed.ok) rejected.push(`status.API_URL: ${allowed.error} (solo se admite el stack local en loopback)`);
    else vars.VITE_SUPABASE_URL = apiUrl;
  }

  // Llave pública: ANON_KEY (JWT con rol anon) o, si la CLI no la ofrece, PUBLISHABLE_KEY. Nunca la de servicio.
  const anon = typeof status.ANON_KEY === 'string' && status.ANON_KEY.trim() ? status.ANON_KEY.trim()
    : typeof status.PUBLISHABLE_KEY === 'string' && status.PUBLISHABLE_KEY.trim() ? status.PUBLISHABLE_KEY.trim() : '';
  if (!anon) rejected.push('status.ANON_KEY / status.PUBLISHABLE_KEY: ausentes');
  else if (anon === status.SERVICE_ROLE_KEY || anon === status.SECRET_KEY || (jwtRole(anon) !== undefined && jwtRole(anon) !== 'anon')) {
    rejected.push('status.ANON_KEY: no es una llave pública/anon (no se escribe una llave de servicio en el navegador)');
  } else vars.VITE_SUPABASE_ANON_KEY = anon;

  // Wompi: nunca se inventa. Solo la llave sandbox que aporte el usuario.
  const userKey = typeof userEnv.VITE_WOMPI_PUBLIC_KEY === 'string' ? userEnv.VITE_WOMPI_PUBLIC_KEY.trim() : '';
  if (userKey) {
    if (!userKey.startsWith('pub_test_')) rejected.push('VITE_WOMPI_PUBLIC_KEY (aportada por el usuario): en local solo se admite una llave sandbox (pub_test_)');
    else vars.VITE_WOMPI_PUBLIC_KEY = userKey;
  } else {
    vars.VITE_WOMPI_PUBLIC_KEY = '';
    pending.push('VITE_WOMPI_PUBLIC_KEY: añada su llave pública SANDBOX de Wompi (pub_test_…) desde el panel sandbox de Wompi; la fábrica no la genera');
  }

  // Validación cruzada con las guardas T2 y T3 (solo si no hay rechazos estructurales)
  if (!rejected.length) {
    const guard = checkEnv(vars, cfg).filter((e) => !(pending.length && e.startsWith('VITE_WOMPI_PUBLIC_KEY: obligatoria')));
    rejected.push(...guard.map((e) => `guarda de build (T2): ${e}`));
    if (!pending.length && !guard.length) {
      try { readClientConfig(vars); } catch (e) { rejected.push(...(e.problems ?? [String(e.message)]).map((p) => `configuración de cliente (T3): ${p}`)); }
    }
  }
  return { vars, rejected, pending };
}

/** Texto del archivo generado: solo las variables VITE_* de la plantilla, en su orden, con cabecera. */
export function renderEnvFile(templateText, vars, source) {
  const names = parseEnv(templateText).entries.map((e) => e.name).filter((n) => n.startsWith('VITE_'));
  const header = [
    '# Generado por scripts/env/gen_local_env.mjs (M26-T5). NO versionar: contiene la llave anon del stack local.',
    `# Fuente: ${source} · plantilla: ${TEMPLATE}`,
    '# Solo variables de CLIENTE (navegador). Los secretos de servidor no se escriben en este archivo.',
    '',
  ];
  return header.concat(names.map((n) => `${n}=${vars[n] ?? ''}`)).join('\n') + '\n';
}

/** Comprueba si el destino es seguro: inexistente y, dentro del repositorio, ignorado por git. */
export function checkOutputPath(output, root = ROOT) {
  const abs = path.resolve(root, output);
  if (existsSync(abs)) return { ok: false, code: EXIT.EXISTS, error: `el destino ya existe (${path.relative(root, abs) || abs}); no se sobrescribe. Bórrelo o use --output` };
  const rel = path.relative(root, abs);
  const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  if (inside) {
    const r = spawnSync('git', ['check-ignore', '-q', rel], { cwd: root });
    if (r.status !== 0) return { ok: false, code: EXIT.REJECTED, error: `el destino ${rel} no está ignorado por git; no se escriben llaves en una ruta versionable` };
  }
  return { ok: true, abs };
}

function readStatus(statusFile) {
  if (statusFile) return { status: JSON.parse(readFileSync(path.resolve(ROOT, statusFile), 'utf8')), source: 'archivo de status' };
  const sb = process.env.SUPABASE_BIN || 'supabase';
  const r = spawnSync(sb, ['status', '-o', 'json'], { cwd: ROOT, encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('no se pudo ejecutar `supabase status -o json` (¿Supabase CLI instalada y stack local arrancado?)');
  const m = /\{[\s\S]*\}/.exec(r.stdout);
  if (!m) throw new Error('`supabase status -o json` no devolvió JSON');
  return { status: JSON.parse(m[0]), source: '`supabase status -o json` (stack local)' };
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const known = ['--status-file', '--output', '--dry-run'];
  const bad = args.filter((a, i) => a.startsWith('--') && !known.includes(a) && !(['--status-file', '--output'].includes(args[i - 1])));
  if (bad.length) { console.error('uso: node scripts/env/gen_local_env.mjs [--status-file f.json] [--output ruta] [--dry-run]'); process.exit(EXIT.USAGE); }
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const output = opt('--output') ?? DEFAULT_OUTPUT;
  const dryRun = args.includes('--dry-run');

  let templateText, cfg, status, source;
  try { templateText = readFileSync(path.join(ROOT, TEMPLATE), 'utf8'); cfg = loadConfig(path.join(ROOT, 'config/environments.json')); }
  catch { console.error('ERROR: no se pudo leer la plantilla o config/environments.json'); process.exit(EXIT.USAGE); }
  try { ({ status, source } = readStatus(opt('--status-file'))); }
  catch (e) { console.error(`ERROR: ${e.message.replace(/\{[\s\S]*/, '')}`); process.exit(EXIT.USAGE); }

  const { vars, rejected, pending } = buildClientEnv(templateText, status, cfg, process.env);
  if (rejected.length) { console.error('Entorno local: RECHAZADO (no se escribió nada)'); rejected.forEach((e) => console.error(`  ERROR ${e}`)); process.exit(EXIT.REJECTED); }

  if (!dryRun) {
    const out = checkOutputPath(output);
    if (!out.ok) { console.error(`ERROR: ${out.error}`); process.exit(out.code); }
    writeFileSync(out.abs, renderEnvFile(templateText, vars, source), { flag: 'wx', mode: 0o600 });
  }
  const filled = REQUIRED_VARS.filter((n) => vars[n]);
  console.log(`Entorno local: ${dryRun ? 'comprobado (--dry-run, no se escribió)' : `generado en ${output}`} · ${filled.length}/${REQUIRED_VARS.length} variables de cliente con valor (${filled.join(', ')})`);
  if (pending.length) {
    console.log('PASOS PENDIENTES DEL USUARIO:');
    pending.forEach((p) => console.log(`  - ${p}`));
    console.log('  Después: compruebe con `pnpm check:env` y arranque con `pnpm --filter @jm/web dev`.');
    process.exit(EXIT.PENDING);
  }
  console.log('Entorno local: COMPLETO · compatible con las guardas T1, T2 y T3. Arranque con `pnpm --filter @jm/web dev`.');
}

// =============================================================================
// M26-T2 — Guarda de build de la fábrica: se ejecuta ANTES de `vite build` en las builds de la fábrica
// (scripts/ci/build.sh y `pnpm build:factory`). No forma parte del script `build` de apps/web, que es el que
// ejecuta Vercel: la fábrica no cambia el comportamiento de los despliegues de Vercel sin autorización.
//
// Evalúa exactamente las variables que verá Vite: las mismas reglas de carga (loadEnv de Vite, archivos
// apps/web/.env, .env.local, .env.[modo], .env.[modo].local y el entorno del proceso).
//
// Reglas (sin valores por defecto; los mensajes nunca muestran valores, solo nombres):
//   VITE_APP_ENV           obligatoria: local | qa (production u otro → error)
//   VITE_SUPABASE_URL      obligatoria y en la lista de permitidos del entorno (config/environments.json)
//   VITE_SUPABASE_ANON_KEY obligatoria; nunca una llave secreta (sb_secret_…) ni un JWT con rol distinto de anon
//   VITE_WOMPI_PUBLIC_KEY  obligatoria y con el prefijo de sandbox del entorno
//   VITE_WOMPI_ENV         obligatoria e igual al modo del entorno (sandbox)
//   Ninguna variable VITE_* con nombre de secreto de servidor (SERVICE_ROLE, SECRET, INTEGRITY, EVENTS, PRIVATE, PASSWORD)
//
// CLI: node scripts/env/check_env.mjs [--mode production] [--env-dir apps/web] [--config config/environments.json]
//      exit 0 OK · 1 configuración no permitida · 2 error de uso o de lectura
// =============================================================================
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, validateConfig, isSupabaseUrlAllowed, isWompiPublicKeyAllowed, ALLOWED_ENVIRONMENTS } from './environments.mjs';

export const REQUIRED_VARS = Object.freeze(['VITE_APP_ENV', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_WOMPI_PUBLIC_KEY', 'VITE_WOMPI_ENV']);
const SERVER_SECRET_NAME_RE = /SERVICE_ROLE|SECRET|INTEGRITY|EVENTS|PRIVATE|PASSWORD/;

function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return undefined;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role; } catch { return undefined; }
}

/** Comprueba un conjunto de variables (objeto nombre → valor). Devuelve la lista de errores (vacía = OK). */
export function checkEnv(vars, cfg) {
  const errors = [];
  const cfgErrors = validateConfig(cfg);
  if (cfgErrors.length) return cfgErrors.map((e) => `config/environments.json: ${e}`);

  for (const name of Object.keys(vars)) {
    if (name.startsWith('VITE_') && SERVER_SECRET_NAME_RE.test(name)) {
      errors.push(`${name}: un secreto de servidor nunca debe exponerse como variable VITE_ (llega al navegador)`);
    }
  }
  const missing = REQUIRED_VARS.filter((n) => typeof vars[n] !== 'string' || vars[n].trim() === '');
  missing.forEach((n) => errors.push(`${n}: obligatoria y ausente (no hay valores por defecto)`));

  const appEnv = vars.VITE_APP_ENV;
  if (!missing.includes('VITE_APP_ENV') && !ALLOWED_ENVIRONMENTS.includes(appEnv)) {
    errors.push(`VITE_APP_ENV: valor no permitido (solo ${ALLOWED_ENVIRONMENTS.join(' | ')}; Production está fuera del alcance de la fábrica)`);
    return errors;
  }
  if (missing.includes('VITE_APP_ENV')) return errors;

  if (!missing.includes('VITE_SUPABASE_URL')) {
    const r = isSupabaseUrlAllowed(cfg, appEnv, vars.VITE_SUPABASE_URL);
    if (!r.ok) errors.push(`VITE_SUPABASE_URL: ${r.error}`);
  }
  if (!missing.includes('VITE_SUPABASE_ANON_KEY')) {
    const key = vars.VITE_SUPABASE_ANON_KEY;
    if (key.startsWith('sb_secret_')) errors.push('VITE_SUPABASE_ANON_KEY: es una llave secreta; en el navegador solo se admite la llave pública/anon');
    const role = jwtRole(key);
    if (role !== undefined && role !== 'anon') errors.push('VITE_SUPABASE_ANON_KEY: es un JWT con un rol distinto de anon (p. ej. service_role)');
  }
  if (!missing.includes('VITE_WOMPI_PUBLIC_KEY')) {
    const r = isWompiPublicKeyAllowed(cfg, appEnv, vars.VITE_WOMPI_PUBLIC_KEY);
    if (!r.ok) errors.push(`VITE_WOMPI_PUBLIC_KEY: ${r.error}`);
  }
  if (!missing.includes('VITE_WOMPI_ENV') && vars.VITE_WOMPI_ENV !== cfg.environments[appEnv].wompi.mode) {
    errors.push(`VITE_WOMPI_ENV: debe ser "${cfg.environments[appEnv].wompi.mode}" en ${appEnv}`);
  }
  return errors;
}

/** Carga las variables VITE_ con las mismas reglas que Vite (archivos .env del envDir + entorno del proceso). */
export function loadViteEnv(mode, envDir) {
  // Se resuelve la entrada ESM declarada por el propio paquete (exports["."].import), no la CJS (obsoleta en Vite 5).
  const requireFromWeb = createRequire(path.join(envDir, 'package.json'));
  const pkgFile = requireFromWeb.resolve('vite/package.json');
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const imp = pkg.exports?.['.']?.import;
  const entry = typeof imp === 'string' ? imp : imp?.default;
  if (!entry) throw new Error('vite sin entrada ESM');
  return import(pathToFileURL(path.join(path.dirname(pkgFile), entry)).href).then(({ loadEnv }) => loadEnv(mode, envDir, 'VITE_'));
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  if (args.some((a) => a.startsWith('--') && !['--mode', '--env-dir', '--config'].includes(a))) {
    console.error('uso: node scripts/env/check_env.mjs [--mode production] [--env-dir apps/web] [--config config/environments.json]');
    process.exit(2);
  }
  const mode = opt('--mode', 'production');
  const envDir = path.resolve(ROOT, opt('--env-dir', 'apps/web'));
  const cfgFile = path.resolve(ROOT, opt('--config', 'config/environments.json'));
  let cfg, vars;
  try { cfg = loadConfig(cfgFile); } catch { console.error('ERROR: no se pudo leer config/environments.json'); process.exit(2); }
  try { vars = await loadViteEnv(mode, envDir); } catch { console.error(`ERROR: no se pudo cargar el entorno de Vite desde ${path.relative(ROOT, envDir) || '.'}`); process.exit(2); }
  const errors = checkEnv(vars, cfg);
  if (errors.length) {
    console.error(`Guarda de entorno: BLOQUEADO (modo ${mode})`);
    errors.forEach((e) => console.error(`  ERROR ${e}`));
    process.exit(1);
  }
  console.log(`Guarda de entorno: OK · VITE_APP_ENV=${vars.VITE_APP_ENV} · modo ${mode} · ${REQUIRED_VARS.length} variables obligatorias presentes y permitidas`);
}

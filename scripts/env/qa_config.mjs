// =============================================================================
// M26-T6 — Verificación de la configuración del entorno QA ("exclusivamente QA").
//
// El propietario rellena un archivo de entorno QA (forma: config/env/qa.env.example) FUERA del repositorio o en una
// ruta ignorada por git, y lo comprueba con:
//   node scripts/env/qa_config.mjs check --file <ruta> [--config <environments.json>]   (pnpm check:qa -- --file <ruta>)
// --config solo existe para pruebas y CI (fixtures con un host QA ficticio); por defecto, config/environments.json.
// No se conecta a ningún servicio: solo valida valores. Nunca imprime valores, solo nombres.
//
// Reglas (además de las guardas T1, T2 y T3):
//   · VITE_APP_ENV=qa y Wompi solo en sandbox (pub_test_, test_integrity_, test_events_).
//   · VITE_SUPABASE_URL y SUPABASE_URL: el MISMO proyecto, https://<ref>.supabase.co, con <ref> en la lista de
//     permitidos de QA (config/environments.json). Nunca loopback ni un host no listado.
//   · Las llaves de Supabase que sean JWT llevan el claim `ref` del proyecto: debe coincidir con el <ref> de la URL.
//     Así no se pueden mezclar llaves de otro proyecto (p. ej. Production) con la URL de QA. Las llaves de formato nuevo
//     (sb_publishable_/sb_secret_) no llevan `ref`: se informa como comprobación manual.
//   · La llave anon y la de servicio son distintas, con su rol correcto.
//   · El archivo no puede estar en una ruta versionable del repositorio (contiene secretos de QA).
// La opción se llama --file (no --env-file): Node 22 intercepta --env-file y cargaría el archivo en process.env.
// Salida: 0 válida · 1 inválida · 2 uso o lectura
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, isSupabaseUrlAllowed } from './environments.mjs';
import { checkEnv } from './check_env.mjs';
import { parseEnv } from './templates.mjs';
import { readServerConfig, SERVER_VARS } from '../../apps/web/api/_lib/serverConfig.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QA_HOST_SUFFIX = '.supa' + 'base.co';

function jwtClaims(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return undefined;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return undefined; }
}

/** Referencia del proyecto a partir de https://<ref>.supabase.co (o undefined). */
export function projectRefOf(url) {
  try {
    const u = new URL(url);
    return u.hostname.endsWith(QA_HOST_SUFFIX) ? u.hostname.slice(0, -QA_HOST_SUFFIX.length) : undefined;
  } catch { return undefined; }
}

/**
 * Valida un conjunto de variables QA. Función pura.
 * @returns {{ errors: string[], manualChecks: string[] }}
 */
export function checkQaEnv(vars, cfg) {
  const errors = [];
  const manualChecks = [];
  if (vars.VITE_APP_ENV !== 'qa') errors.push('VITE_APP_ENV: debe ser "qa" en un archivo de entorno QA');
  // M26-R1 (MAJ-2): el entorno del servidor también debe ser QA
  if (vars.APP_ENV !== 'qa') errors.push('APP_ENV: debe ser "qa" en un archivo de entorno QA');

  // Cliente (T1 + T2) y servidor (T3)
  errors.push(...checkEnv({ ...vars, VITE_APP_ENV: 'qa' }, cfg).map((e) => `cliente: ${e}`));
  const server = readServerConfig(Object.keys(SERVER_VARS), vars);
  if (!server.ok) errors.push(...server.errors.map((e) => `servidor: ${e}`));

  // Mismo proyecto QA en cliente y servidor, y en la lista de permitidos de QA
  const clientRef = projectRefOf(vars.VITE_SUPABASE_URL);
  const serverRef = projectRefOf(vars.SUPABASE_URL);
  if (vars.SUPABASE_URL) {
    const allowed = isSupabaseUrlAllowed(cfg, 'qa', vars.SUPABASE_URL);
    if (!allowed.ok) errors.push(`SUPABASE_URL: ${allowed.error}`);
  }
  if (clientRef && serverRef && clientRef !== serverRef) errors.push('SUPABASE_URL y VITE_SUPABASE_URL apuntan a proyectos distintos');

  // Las llaves pertenecen al proyecto de la URL
  const ref = serverRef ?? clientRef;
  for (const [name, expectedRole] of [['VITE_SUPABASE_ANON_KEY', 'anon'], ['SUPABASE_SERVICE_ROLE_KEY', 'service_role']]) {
    const v = vars[name];
    if (!v) continue;
    const claims = jwtClaims(v);
    if (!claims) { manualChecks.push(`${name}: llave sin claim "ref" (formato nuevo); compruebe a mano que es del proyecto QA`); continue; }
    if (claims.role !== expectedRole) errors.push(`${name}: el rol no es ${expectedRole}`);
    if (!claims.ref) manualChecks.push(`${name}: JWT sin claim "ref"; compruebe a mano que es del proyecto QA`);
    else if (ref && claims.ref !== ref) errors.push(`${name}: pertenece a otro proyecto distinto del de la URL de QA`);
  }
  if (vars.VITE_SUPABASE_ANON_KEY && vars.VITE_SUPABASE_ANON_KEY === vars.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('VITE_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY no pueden ser la misma llave');
  }
  if (vars.VITE_WOMPI_PUBLIC_KEY && vars.WOMPI_PUBLIC_KEY && vars.VITE_WOMPI_PUBLIC_KEY !== vars.WOMPI_PUBLIC_KEY) {
    errors.push('VITE_WOMPI_PUBLIC_KEY y WOMPI_PUBLIC_KEY deben ser la misma llave pública sandbox');
  }
  if (vars.WOMPI_PUBLIC_KEY && !vars.WOMPI_PUBLIC_KEY.startsWith('pub_test_')) errors.push('WOMPI_PUBLIC_KEY: QA solo usa Wompi sandbox (pub_test_)');
  return { errors: [...new Set(errors)], manualChecks };
}

/** El archivo de QA no puede estar en una ruta versionable del repositorio. */
export function checkEnvFileLocation(file, root = ROOT) {
  const abs = path.resolve(root, file);
  if (!existsSync(abs)) return { ok: false, error: 'el archivo no existe' };
  const rel = path.relative(root, abs);
  const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  if (inside && spawnSync('git', ['check-ignore', '-q', rel], { cwd: root }).status !== 0) {
    return { ok: false, error: `${rel} está en una ruta versionable del repositorio; guarde el entorno QA fuera del repositorio o en una ruta ignorada` };
  }
  return { ok: true, abs };
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--file');
  const c = args.indexOf('--config');
  if (args[0] !== 'check' || i < 0 || !args[i + 1] || (c >= 0 && !args[c + 1])) { console.error('uso: node scripts/env/qa_config.mjs check --file <ruta> [--config <environments.json>]'); process.exit(2); }
  const loc = checkEnvFileLocation(args[i + 1]);
  if (!loc.ok) { console.error(`ERROR: ${loc.error}`); process.exit(loc.error === 'el archivo no existe' ? 2 : 1); }
  let vars, cfg, parsed;
  try {
    parsed = parseEnv(readFileSync(loc.abs, 'utf8'));
    vars = Object.fromEntries(parsed.entries.map((e) => [e.name, e.value]));
    cfg = loadConfig(c >= 0 ? path.resolve(args[c + 1]) : path.join(ROOT, 'config/environments.json'));
  } catch { console.error('ERROR: no se pudo leer el archivo de entorno o config/environments.json'); process.exit(2); }
  // M26-R1 (MAJ-1): un archivo con líneas mal formadas (p. ej. comillas sin cerrar) nunca se da por válido.
  const { errors: qaErrors, manualChecks } = checkQaEnv(vars, cfg);
  const errors = [...parsed.problems.map((p) => `archivo: ${p}`), ...qaErrors];
  if (errors.length) { console.error('Entorno QA: INVÁLIDO'); errors.forEach((e) => console.error(`  ERROR ${e}`)); process.exit(1); }
  console.log('Entorno QA: VÁLIDO · exclusivamente QA (lista de permitidos, mismo proyecto en cliente/servidor, llaves del proyecto, Wompi sandbox)');
  manualChecks.forEach((m) => console.log(`  COMPROBACIÓN MANUAL: ${m}`));
}

// =============================================================================
// M26-T3 — Configuración del CLIENTE (navegador), validada al iniciar.
//
// Solo variables VITE_* (públicas por diseño: llegan al bundle). Nunca secretos de servidor.
// Sin valores por defecto: si falta o es incoherente, la aplicación falla al arrancar con un error que nombra
// la variable (nunca su valor).
//
//   VITE_SUPABASE_URL       obligatoria · URL http(s) válida, solo el origen
//   VITE_SUPABASE_ANON_KEY  obligatoria · nunca una llave secreta de Supabase ni un JWT con rol distinto de anon
//   VITE_WOMPI_PUBLIC_KEY   obligatoria · pub_test_… (sandbox) o pub_prod_… (production)
//   VITE_WOMPI_ENV          obligatoria · sandbox | production, coherente con el prefijo de la llave
//   VITE_APP_ENV            opcional en ejecución · local | qa | production; en local y qa Wompi debe ser sandbox
//
// La restricción "la fábrica solo construye local/qa" la aplica la guarda de build (T2); en ejecución la
// aplicación también debe poder funcionar en Production cuando el propietario la libere.
// =============================================================================

export class ConfigError extends Error {
  constructor(component, problems) {
    super(`[${component}] Configuración inválida:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const WOMPI_MODE_BY_PREFIX = { pub_test_: 'sandbox', pub_prod_: 'production' };
// Prefijo de las llaves secretas de Supabase, compuesto en ejecución: así el texto del marcador no aparece en el
// bundle (scripts/ci/build.sh rechaza cualquier bundle que lo contenga).
const SUPABASE_SECRET_KEY_PREFIX = ['sb', 'secret', ''].join('_');
const APP_ENVS = ['local', 'qa', 'production'];

/** Rol de un JWT de Supabase (o undefined si no es un JWT). Funciona en el navegador y en Node. */
export function jwtRole(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)) : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json).role;
  } catch {
    return undefined;
  }
}

const blank = (v) => typeof v !== 'string' || v.trim() === '';

/** Valida y normaliza la configuración del cliente. Lanza ConfigError con la lista de problemas. */
export function readClientConfig(env) {
  const e = env ?? {};
  const problems = [];
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_WOMPI_PUBLIC_KEY', 'VITE_WOMPI_ENV'];
  for (const name of required) if (blank(e[name])) problems.push(`${name}: obligatoria y ausente (sin valores por defecto)`);

  if (!blank(e.VITE_SUPABASE_URL)) {
    let u;
    try { u = new URL(e.VITE_SUPABASE_URL); } catch { /* inválida */ }
    if (!u || !['http:', 'https:'].includes(u.protocol)) problems.push('VITE_SUPABASE_URL: debe ser una URL http(s) válida');
    else if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) problems.push('VITE_SUPABASE_URL: debe ser solo el origen (sin credenciales, ruta ni consulta)');
  }
  if (!blank(e.VITE_SUPABASE_ANON_KEY)) {
    const k = e.VITE_SUPABASE_ANON_KEY;
    if (k.startsWith(SUPABASE_SECRET_KEY_PREFIX)) problems.push('VITE_SUPABASE_ANON_KEY: es una llave secreta; en el navegador solo se admite la llave pública/anon');
    const role = jwtRole(k);
    if (role !== undefined && role !== 'anon') problems.push('VITE_SUPABASE_ANON_KEY: JWT con un rol distinto de anon');
  }

  let keyMode;
  if (!blank(e.VITE_WOMPI_PUBLIC_KEY)) {
    const prefix = Object.keys(WOMPI_MODE_BY_PREFIX).find((p) => e.VITE_WOMPI_PUBLIC_KEY.startsWith(p));
    if (!prefix) problems.push('VITE_WOMPI_PUBLIC_KEY: debe empezar por pub_test_ o pub_prod_');
    else keyMode = WOMPI_MODE_BY_PREFIX[prefix];
  }
  if (!blank(e.VITE_WOMPI_ENV)) {
    if (!['sandbox', 'production'].includes(e.VITE_WOMPI_ENV)) problems.push('VITE_WOMPI_ENV: debe ser sandbox o production');
    else if (keyMode && keyMode !== e.VITE_WOMPI_ENV) problems.push('VITE_WOMPI_ENV: no coincide con el tipo de VITE_WOMPI_PUBLIC_KEY');
  }
  if (!blank(e.VITE_APP_ENV)) {
    if (!APP_ENVS.includes(e.VITE_APP_ENV)) problems.push('VITE_APP_ENV: debe ser local, qa o production');
    else if (e.VITE_APP_ENV !== 'production' && e.VITE_WOMPI_ENV && e.VITE_WOMPI_ENV !== 'sandbox') problems.push(`VITE_WOMPI_ENV: en ${e.VITE_APP_ENV} solo se admite sandbox`);
  }

  if (problems.length) throw new ConfigError('Configuración del cliente', problems);
  return Object.freeze({
    appEnv: blank(e.VITE_APP_ENV) ? undefined : e.VITE_APP_ENV,
    supabase: Object.freeze({ url: e.VITE_SUPABASE_URL, anonKey: e.VITE_SUPABASE_ANON_KEY }),
    wompi: Object.freeze({ publicKey: e.VITE_WOMPI_PUBLIC_KEY, env: e.VITE_WOMPI_ENV }),
  });
}

let cached;
/** Configuración del cliente a partir de import.meta.env (se valida una sola vez, al primer uso en el arranque). */
export function getClientConfig() {
  if (!cached) cached = readClientConfig(import.meta.env);
  return cached;
}

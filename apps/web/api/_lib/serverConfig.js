// =============================================================================
// M26-T3 — Configuración del SERVIDOR (funciones de Vercel en apps/web/api), validada en cada ejecución.
// (Vercel no publica como endpoint los archivos de carpetas que empiezan por "_".)
//
// Separación cliente/servidor: el servidor lee SOLO nombres de servidor. Nunca recurre a variables VITE_*
// (son de cliente) ni sustituye una llave por otra (antes, sin SUPABASE_SERVICE_ROLE_KEY se usaba la anon).
//
//   SUPABASE_URL               URL http(s) válida, solo el origen
//   SUPABASE_SERVICE_ROLE_KEY  no vacía; si es un JWT, con rol service_role; nunca una llave publicable (sb_publishable_)
//   WOMPI_PUBLIC_KEY           pub_test_… o pub_prod_…
//   WOMPI_INTEGRITY_SECRET     test_integrity_… o prod_integrity_… (coherente con la llave pública si se exige)
//   WOMPI_EVENTS_SECRET        test_events_… o prod_events_…       (ídem)
//
// Cada endpoint declara lo que necesita. Los errores nombran variables, nunca valores.
//
// M26-R1.1 (MAJ-2): APP_ENV se contrasta con las señales de despliegue de Vercel en EJECUCIÓN (VERCEL_ENV, …; ver
// src/config/deployContext.js): un Preview solo funciona con qa y production solo en un despliegue identificado como
// Production (sin señales → production rechazado). Con qa, SUPABASE_URL debe estar en la lista de QA (copia generada
// de config/environments.json); con production, debe ser https y no un host de local o qa. Si existe VITE_APP_ENV
// y contradice a APP_ENV, se rechaza (solo se compara; el servidor nunca usa variables de cliente como valor).
// =============================================================================
import { createRequire } from 'node:module';
import { deployContextProblems, readDeploySignals } from '../../src/config/deployContext.js';

const requireJson = createRequire(import.meta.url);
/** Lista de permitidos (solo hosts públicos), copia generada dentro de apps/web: ver scripts/env/sync_allowlist.mjs. */
export const ALLOWLIST = Object.freeze(requireJson('../../src/config/allowlist.generated.json'));

export const SERVER_VARS = Object.freeze({
  // M26-R1 (MAJ-2): entorno del servidor (local | qa | production). Siempre obligatorio: sin él no se sabe si deben
  // rechazarse credenciales de producción.
  APP_ENV: 'APP_ENV',
  SUPABASE_URL: 'SUPABASE_URL',
  SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY',
  WOMPI_PUBLIC_KEY: 'WOMPI_PUBLIC_KEY',
  WOMPI_INTEGRITY_SECRET: 'WOMPI_INTEGRITY_SECRET',
  WOMPI_EVENTS_SECRET: 'WOMPI_EVENTS_SECRET',
});

// Variable de cliente que alguien podría esperar como respaldo: se informa para orientar, nunca se usa.
const CLIENT_COUNTERPART = { SUPABASE_URL: 'VITE_SUPABASE_URL', WOMPI_PUBLIC_KEY: 'VITE_WOMPI_PUBLIC_KEY' };
const SECRET_PREFIX = {
  WOMPI_INTEGRITY_SECRET: { sandbox: 'test_integrity_', production: 'prod_integrity_' },
  WOMPI_EVENTS_SECRET: { sandbox: 'test_events_', production: 'prod_events_' },
};

/** Normaliza un valor de entorno: recorta espacios y comillas envolventes accidentales. */
export function clean(value) {
  if (typeof value !== 'string') return '';
  // M26-R1 (MIN-4): solo se retiran comillas envolventes EMPAREJADAS (antes se quitaba también una comilla suelta).
  const v = value.trim();
  return (/^(["'])(.*)\1$/s.exec(v)?.[2] ?? v).trim();
}

function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return undefined;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role; } catch { return undefined; }
}

/**
 * Lee y valida las variables de servidor exigidas.
 * @param {string[]} required nombres de SERVER_VARS que este endpoint necesita
 * @param {Record<string,string|undefined>} env por defecto process.env
 * @returns {{ ok: true, config: Record<string,string> } | { ok: false, errors: string[] }}
 */
const APP_ENVS = ['local', 'qa', 'production'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Validación común del origen de Supabase (M26-R1, MIN-4): http(s), sin credenciales, ruta, consulta ni fragmento. */
export function originProblem(raw) {
  let u;
  try { u = new URL(raw); } catch { return 'debe ser una URL http(s) válida'; }
  if (!['http:', 'https:'].includes(u.protocol)) return 'debe ser una URL http(s) válida';
  if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) return 'debe ser solo el origen (sin credenciales, ruta, consulta ni fragmento)';
  return null;
}

export function readServerConfig(required, env = process.env, { allowedHosts = ALLOWLIST } = {}) {
  const errors = [];
  const config = {};
  // APP_ENV se exige siempre, además de lo que pida cada endpoint.
  for (const name of [...new Set(['APP_ENV', ...required])]) {
    if (!SERVER_VARS[name]) { errors.push(`${name}: no es una variable de servidor conocida`); continue; }
    const v = clean(env[name]);
    if (!v) {
      const hint = CLIENT_COUNTERPART[name] && clean(env[CLIENT_COUNTERPART[name]])
        ? ` (existe ${CLIENT_COUNTERPART[name]}, pero es de cliente y el servidor no la usa)` : '';
      errors.push(`${name}: obligatoria y ausente${hint}`);
      continue;
    }
    config[name] = v;
  }

  const appEnv = config.APP_ENV;
  if (appEnv && !APP_ENVS.includes(appEnv)) errors.push('APP_ENV: debe ser local, qa o production');
  const sandboxOnly = appEnv === 'local' || appEnv === 'qa';
  // Contexto de despliegue (señales de la plataforma en ejecución). Sin señales: local/CI → production rechazado.
  errors.push(...deployContextProblems('APP_ENV', APP_ENVS.includes(appEnv) ? appEnv : '', readDeploySignals(env)));
  const viteAppEnv = clean(env.VITE_APP_ENV);
  if (appEnv && viteAppEnv && viteAppEnv !== appEnv) errors.push('APP_ENV y VITE_APP_ENV: contradictorias (servidor y cliente deben declarar el mismo entorno)');

  if (config.SUPABASE_URL) {
    const p = originProblem(config.SUPABASE_URL);
    if (p) errors.push(`SUPABASE_URL: ${p}`);
    else {
      const u = new URL(config.SUPABASE_URL);
      if (appEnv === 'local' && !LOOPBACK.has(u.hostname)) errors.push('SUPABASE_URL: con APP_ENV=local solo se admite el stack local (loopback)');
      if (appEnv === 'qa' && (u.protocol !== 'https:' || LOOPBACK.has(u.hostname))) errors.push('SUPABASE_URL: con APP_ENV=qa debe ser https y no de loopback');
      else if (appEnv === 'qa' && !(allowedHosts.qa ?? []).includes(u.hostname)) errors.push((allowedHosts.qa ?? []).length === 0
        ? 'SUPABASE_URL: qa no tiene hosts permitidos (config/environments.json)'
        : 'SUPABASE_URL: host no permitido para qa (config/environments.json)');
      if (appEnv === 'production') {
        const factoryHosts = new Set([...(allowedHosts.local ?? []), ...(allowedHosts.qa ?? []), ...LOOPBACK]);
        if (u.protocol !== 'https:') errors.push('SUPABASE_URL: con APP_ENV=production debe ser https');
        else if (factoryHosts.has(u.hostname)) errors.push('SUPABASE_URL: con APP_ENV=production no se admite un host de local o qa (configuración contradictoria)');
      }
    }
  }
  if (config.SUPABASE_SERVICE_ROLE_KEY) {
    const k = config.SUPABASE_SERVICE_ROLE_KEY;
    if (k.startsWith('sb_publishable_')) errors.push('SUPABASE_SERVICE_ROLE_KEY: es una llave publicable, no la de servicio');
    const role = jwtRole(k);
    if (role !== undefined && role !== 'service_role') errors.push('SUPABASE_SERVICE_ROLE_KEY: JWT con un rol distinto de service_role (¿llave anon?)');
  }

  let mode;
  if (config.WOMPI_PUBLIC_KEY) {
    if (config.WOMPI_PUBLIC_KEY.startsWith('pub_test_')) mode = 'sandbox';
    else if (config.WOMPI_PUBLIC_KEY.startsWith('pub_prod_')) mode = 'production';
    else errors.push('WOMPI_PUBLIC_KEY: debe empezar por pub_test_ o pub_prod_');
    if (sandboxOnly && mode === 'production') errors.push(`WOMPI_PUBLIC_KEY: con APP_ENV=${appEnv} solo se admite Wompi sandbox (pub_test_)`);
  }
  for (const name of ['WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET']) {
    const v = config[name];
    if (!v) continue;
    const { sandbox, production } = SECRET_PREFIX[name];
    const secretMode = v.startsWith(sandbox) ? 'sandbox' : v.startsWith(production) ? 'production' : undefined;
    if (!secretMode) errors.push(`${name}: debe empezar por ${sandbox} o ${production}`);
    else if (sandboxOnly && secretMode === 'production') errors.push(`${name}: con APP_ENV=${appEnv} solo se admiten secretos sandbox (${sandbox})`);
    else if (mode && secretMode !== mode) errors.push(`${name}: no coincide con el modo de WOMPI_PUBLIC_KEY (sandbox/production mezclados)`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, config: Object.freeze(config) };
}

/**
 * Atajo para handlers: devuelve la configuración o responde 500 genérico y registra solo nombres de variables.
 * @returns {Record<string,string> | null} null si ya se respondió con error
 */
export function requireServerConfig(res, component, required, env = process.env) {
  const r = readServerConfig(required, env);
  if (r.ok) return r.config;
  console.error(`[${component}] Configuración de servidor inválida:\n - ${r.errors.join('\n - ')}`);
  res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  return null;
}

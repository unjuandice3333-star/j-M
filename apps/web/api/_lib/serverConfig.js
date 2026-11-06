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
// =============================================================================

export const SERVER_VARS = Object.freeze({
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
  return value.trim().replace(/^["']|["']$/g, '').trim();
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
export function readServerConfig(required, env = process.env) {
  const errors = [];
  const config = {};
  for (const name of required) {
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

  if (config.SUPABASE_URL) {
    let u;
    try { u = new URL(config.SUPABASE_URL); } catch { /* inválida */ }
    if (!u || !['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search) {
      errors.push('SUPABASE_URL: debe ser una URL http(s) válida y solo el origen');
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
  }
  for (const name of ['WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET']) {
    const v = config[name];
    if (!v) continue;
    const { sandbox, production } = SECRET_PREFIX[name];
    const secretMode = v.startsWith(sandbox) ? 'sandbox' : v.startsWith(production) ? 'production' : undefined;
    if (!secretMode) errors.push(`${name}: debe empezar por ${sandbox} o ${production}`);
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

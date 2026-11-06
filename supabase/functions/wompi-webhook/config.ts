// =============================================================================
// M26-T3 — Configuración de la Edge Function wompi-webhook, validada en cada ejecución.
// Solo variables de servidor (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase; WOMPI_EVENTS_SECRET
// la define el propietario). Nunca recurre a VITE_SUPABASE_URL (variable de cliente). Sin valores por defecto.
// Los errores nombran variables, nunca valores.
// =============================================================================

export type EdgeConfig = { appEnv: string; supabaseUrl: string; serviceRoleKey: string; eventsSecret: string };
export type EdgeConfigResult = { ok: true; config: EdgeConfig } | { ok: false; errors: string[] };

export function clean(value: string | undefined | null): string {
  if (typeof value !== 'string') return '';
  // M26-R1 (MIN-4): solo comillas envolventes emparejadas, igual que el servidor de Vercel.
  const v = value.trim();
  return (/^(["'])(.*)\1$/s.exec(v)?.[2] ?? v).trim();
}

function jwtRole(token: string): string | undefined {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))).role;
  } catch {
    return undefined;
  }
}

/** @param get lector de variables (en producción, (n) => Deno.env.get(n)) */
export function readEdgeConfig(get: (name: string) => string | undefined): EdgeConfigResult {
  const errors: string[] = [];
  // M26-R1 (MAJ-2): APP_ENV (local | qa | production) obligatorio; en local y qa solo secretos de Wompi sandbox.
  const appEnv = clean(get('APP_ENV'));
  if (!appEnv) errors.push('APP_ENV: obligatoria y ausente (local, qa o production)');
  else if (!['local', 'qa', 'production'].includes(appEnv)) errors.push('APP_ENV: debe ser local, qa o production');
  const supabaseUrl = clean(get('SUPABASE_URL'));
  const serviceRoleKey = clean(get('SUPABASE_SERVICE_ROLE_KEY'));
  const eventsSecret = clean(get('WOMPI_EVENTS_SECRET'));

  if (!supabaseUrl) {
    errors.push('SUPABASE_URL: obligatoria y ausente' + (clean(get('VITE_SUPABASE_URL')) ? ' (existe VITE_SUPABASE_URL, pero es de cliente y no se usa)' : ''));
  } else {
    let u: URL | undefined;
    try { u = new URL(supabaseUrl); } catch { /* inválida */ }
    if (!u || !['http:', 'https:'].includes(u.protocol)) errors.push('SUPABASE_URL: debe ser una URL http(s) válida');
    // M26-R1 (MIN-4): mismo criterio de origen que el cliente y el servidor de Vercel
    else if (u.username || u.password || u.pathname !== '/' || u.search || u.hash) errors.push('SUPABASE_URL: debe ser solo el origen (sin credenciales, ruta, consulta ni fragmento)');
    else if (appEnv === 'qa' && (u.protocol !== 'https:' || ['127.0.0.1', 'localhost'].includes(u.hostname))) errors.push('SUPABASE_URL: con APP_ENV=qa debe ser https y no de loopback');
  }
  if (!serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY: obligatoria y ausente');
  else {
    if (serviceRoleKey.startsWith('sb_publishable_')) errors.push('SUPABASE_SERVICE_ROLE_KEY: es una llave publicable, no la de servicio');
    const role = jwtRole(serviceRoleKey);
    if (role !== undefined && role !== 'service_role') errors.push('SUPABASE_SERVICE_ROLE_KEY: JWT con un rol distinto de service_role (¿llave anon?)');
  }
  if (!eventsSecret) errors.push('WOMPI_EVENTS_SECRET: obligatoria y ausente');
  else if (!eventsSecret.startsWith('test_events_') && !eventsSecret.startsWith('prod_events_')) errors.push('WOMPI_EVENTS_SECRET: debe empezar por test_events_ o prod_events_');
  else if ((appEnv === 'local' || appEnv === 'qa') && eventsSecret.startsWith('prod_events_')) errors.push(`WOMPI_EVENTS_SECRET: con APP_ENV=${appEnv} solo se admite el secreto sandbox (test_events_)`);

  return errors.length ? { ok: false, errors } : { ok: true, config: { appEnv, supabaseUrl, serviceRoleKey, eventsSecret } };
}

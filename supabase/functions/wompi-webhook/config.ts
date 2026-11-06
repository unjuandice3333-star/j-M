// =============================================================================
// M26-T3 — Configuración de la Edge Function wompi-webhook, validada en cada ejecución.
// Solo variables de servidor (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase; WOMPI_EVENTS_SECRET
// la define el propietario). Nunca recurre a VITE_SUPABASE_URL (variable de cliente). Sin valores por defecto.
// Los errores nombran variables, nunca valores.
// =============================================================================

export type EdgeConfig = { supabaseUrl: string; serviceRoleKey: string; eventsSecret: string };
export type EdgeConfigResult = { ok: true; config: EdgeConfig } | { ok: false; errors: string[] };

export function clean(value: string | undefined | null): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
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
  const supabaseUrl = clean(get('SUPABASE_URL'));
  const serviceRoleKey = clean(get('SUPABASE_SERVICE_ROLE_KEY'));
  const eventsSecret = clean(get('WOMPI_EVENTS_SECRET'));

  if (!supabaseUrl) {
    errors.push('SUPABASE_URL: obligatoria y ausente' + (clean(get('VITE_SUPABASE_URL')) ? ' (existe VITE_SUPABASE_URL, pero es de cliente y no se usa)' : ''));
  } else {
    let u: URL | undefined;
    try { u = new URL(supabaseUrl); } catch { /* inválida */ }
    if (!u || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) errors.push('SUPABASE_URL: debe ser una URL http(s) válida');
  }
  if (!serviceRoleKey) errors.push('SUPABASE_SERVICE_ROLE_KEY: obligatoria y ausente');
  else {
    if (serviceRoleKey.startsWith('sb_publishable_')) errors.push('SUPABASE_SERVICE_ROLE_KEY: es una llave publicable, no la de servicio');
    const role = jwtRole(serviceRoleKey);
    if (role !== undefined && role !== 'service_role') errors.push('SUPABASE_SERVICE_ROLE_KEY: JWT con un rol distinto de service_role (¿llave anon?)');
  }
  if (!eventsSecret) errors.push('WOMPI_EVENTS_SECRET: obligatoria y ausente');
  else if (!eventsSecret.startsWith('test_events_') && !eventsSecret.startsWith('prod_events_')) errors.push('WOMPI_EVENTS_SECRET: debe empezar por test_events_ o prod_events_');

  return errors.length ? { ok: false, errors } : { ok: true, config: { supabaseUrl, serviceRoleKey, eventsSecret } };
}

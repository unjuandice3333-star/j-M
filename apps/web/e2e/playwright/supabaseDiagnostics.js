// Diagnóstico de las respuestas de Supabase observadas por el navegador (M36.1). Funciones puras, sin red.
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Texto seguro para adjuntar: sin JWT, sin llaves y sin correos. */
export function sanitize(text) {
  return String(text ?? '').replace(JWT, '<jwt>').replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '<llave>').replace(EMAIL, '<correo>');
}

/** ¿Es una URL de la API de Supabase (REST, Auth o Storage)? */
export function isSupabaseApi(url) {
  try { return /\/(rest|auth|storage)\/v1\//.test(new URL(url).pathname); } catch { return false; }
}

/** Describe la petición: tipo (rest/rpc/auth/storage), nombre de tabla o función y consulta sin la llave. */
export function describeRequest(url) {
  const u = new URL(url);
  const m = /\/(rest|auth|storage)\/v1\/(.*)$/.exec(u.pathname);
  const [, api, rest] = m ?? [];
  let kind = api; let name = (rest ?? '').split('/')[0];
  if (api === 'rest' && name === 'rpc') { kind = 'rpc'; name = (rest ?? '').split('/')[1] ?? ''; }
  const q = new URLSearchParams(u.search); q.delete('apikey');
  return { kind, name, query: sanitize(decodeURIComponent(q.toString())).slice(0, 400) };
}

/** Interpretación de los códigos de PostgREST/PostgreSQL más habituales (para el informe). */
export function explainCode(code) {
  const map = {
    PGRST205: 'la tabla/vista no existe en el esquema público (caché de esquema de PostgREST)',
    PGRST200: 'no existe la relación (clave foránea) pedida en el select embebido',
    PGRST204: 'una columna enviada no existe en la tabla',
    PGRST202: 'la función RPC no existe o sus argumentos no coinciden',
    PGRST116: 'se esperaba una fila y llegaron 0 o varias',
    '42703': 'una columna del select/filtro no existe (undefined_column)',
    '42P01': 'la tabla no existe (undefined_table)',
    '42883': 'función u operador inexistente',
    '42501': 'permiso denegado (RLS/GRANT)',
  };
  return map[code] ?? '';
}

/** Entrada de diagnóstico a partir de una respuesta; `bodyText` es el cuerpo ya leído (o vacío). */
export function entryFromResponse({ url, method, status, bodyText }) {
  const d = describeRequest(url);
  const entry = { method, status, kind: d.kind, name: d.name, query: d.query };
  if (status >= 400) {
    let j = null;
    try { j = JSON.parse(bodyText); } catch { /* cuerpo no JSON */ }
    if (j && typeof j === 'object') {
      entry.code = j.code ?? j.error_code ?? j.error ?? undefined;
      entry.message = sanitize(j.message ?? j.msg ?? j.error_description ?? '');
      entry.details = j.details == null ? undefined : sanitize(typeof j.details === 'string' ? j.details : JSON.stringify(j.details));
      entry.hint = j.hint == null ? undefined : sanitize(j.hint);
    } else entry.message = sanitize(bodyText).slice(0, 300);
    entry.meaning = explainCode(String(entry.code ?? ''));
  }
  return entry;
}

export const formatEntry = (e) => `${e.status} ${e.method} ${e.kind}/${e.name}${e.code ? ` [${e.code}]` : ''}${e.message ? `: ${e.message}` : ''}${e.details ? ` · detalle: ${e.details}` : ''}${e.hint ? ` · pista: ${e.hint}` : ''}${e.meaning ? ` → ${e.meaning}` : ''}`;

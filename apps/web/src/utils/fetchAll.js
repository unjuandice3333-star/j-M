// Lectura completa de consultas de PostgREST sin cortes silenciosos.
// PostgREST corta cada respuesta en `max_rows` (1000, supabase/config.toml) sin avisar: una consulta única
// pierde filas a partir de ese número. Aquí se pagina con `.range()` y se trocean listas `in` largas
// (cientos de UUID en la URL superan el límite de longitud de algunos proxys).

/** Filas por solicitud al leer tablas completas; igual a `max_rows` de PostgREST. */
export const FETCH_ALL_PAGE_SIZE = 1000;
/** Tope de seguridad de filas al leer una tabla completa (evita bucles infinitos y pestañas colgadas). */
export const FETCH_ALL_MAX_ROWS = 50000;
/** Ids por solicitud en filtros `in` (≈ 100 UUID ≈ 3,8 KB de URL). */
export const IN_CHUNK_SIZE = 100;

/**
 * Lee TODAS las filas de una consulta paginando con `.range()`.
 * `buildQuery` debe devolver una consulta NUEVA con orden total y estable (p. ej. `.order('created_at').order('id')`).
 * @param {() => any} buildQuery
 * @returns {Promise<{data: Array|null, error: any, capped: boolean}>} capped = se alcanzó `maxRows`.
 */
export async function fetchAllRows(buildQuery, { pageSize = FETCH_ALL_PAGE_SIZE, maxRows = FETCH_ALL_MAX_ROWS } = {}) {
  const out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await buildQuery().range(from, Math.min(from + pageSize, maxRows) - 1);
    if (error) return { data: null, error, capped: false };
    const page = data ?? [];
    out.push(...page);
    if (page.length < pageSize) return { data: out, error: null, capped: false };
  }
  return { data: out, error: null, capped: true };
}

/** Divide una lista en trozos de `size` elementos. */
export function chunk(list, size = IN_CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Lee todas las filas de una consulta filtrada por una lista de ids: trocea la lista y pagina cada trozo.
 * `buildQuery(ids)` debe devolver una consulta NUEVA con el filtro `.in(…, ids)` y orden estable.
 * @returns {Promise<{data: Array|null, error: any, capped: boolean}>}
 */
export async function fetchAllIn(buildQuery, ids, { chunkSize = IN_CHUNK_SIZE, ...opts } = {}) {
  const unique = [...new Set(ids)];
  const results = await Promise.all(chunk(unique, chunkSize).map((part) => fetchAllRows(() => buildQuery(part), opts)));
  const failed = results.find((r) => r.error);
  if (failed) return { data: null, error: failed.error, capped: false };
  return { data: results.flatMap((r) => r.data), error: null, capped: results.some((r) => r.capped) };
}

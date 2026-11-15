// D139: rutas de retorno tras iniciar sesión. Solo rutas internas de la tienda.
// React Router 6 tiene un aviso abierto (GHSA, solo corregido en v7) por barras invertidas en <Link>/navigate:
// los navegadores tratan `/\evil.com` como `//evil.com` (URL relativa al protocolo → otro dominio).
// Por eso se rechazan: no empezar por una sola `/`, `//` o `/\` al inicio, cualquier `\`, y los caracteres de
// control (el parser de URL elimina tabuladores/saltos de línea, así que `/\t/evil.com` también acabaría en `//`).
const MAX_LENGTH = 2048;

export const isSafeInternalPath = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return false;
  if (value[0] !== '/') return false;
  if (value.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;
  return value[1] !== '/';
};

// Acepta la ruta como texto o como `location` de React Router ({ pathname, search, hash }).
export const safeInternalPath = (value, fallback) => {
  const path = value && typeof value === 'object'
    ? `${value.pathname ?? ''}${value.search ?? ''}${value.hash ?? ''}`
    : value;
  return isSafeInternalPath(path) ? path : fallback;
};

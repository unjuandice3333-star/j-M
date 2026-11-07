// Bypass de Deployment Protection de Vercel, limitado al deployment (M36.1).
// Principios:
//   · El secreto solo lo lee Node (global-setup) y SOLO se envía al hostname EXACTO de PLAYWRIGHT_BASE_URL, por https.
//   · El navegador NUNCA recibe cabeceras de bypass: usa la cookie de sesión de Vercel (`_vercel_jwt`) que el deployment
//     emite a cambio del secreto, y que el navegador solo adjunta a ese mismo host. Así no hay CORS roto en terceros
//     (Google Fonts, Supabase…) ni el secreto aparece en trazas, capturas, vídeos ni reportes.
//   · Deployment Protection no se desactiva.

const BYPASS_HEADERS = ['x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie'];
export const BYPASS_HEADER_NAMES = BYPASS_HEADERS;

/** Hostname exacto del deployment; null si la URL no es https (o loopback http, solo para pruebas locales del mecanismo). */
export function deploymentHost(baseURL) {
  let u;
  try { u = new URL(baseURL); } catch { return null; }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !(loopback && u.protocol === 'http:')) return null;
  return u.host; // host incluye el puerto, si lo hay
}

/** ¿La URL pertenece EXACTAMENTE al deployment? (mismo esquema y host; no basta con terminar igual ni contenerlo). */
export function isDeploymentUrl(url, baseURL) {
  try {
    const a = new URL(url); const b = new URL(baseURL);
    return a.protocol === b.protocol && a.host === b.host;
  } catch { return false; }
}

/** Cabeceras de bypass que corresponde enviar a `url`: solo al deployment; vacío para cualquier otro destino. */
export function bypassHeadersFor(url, baseURL, secret) {
  if (!secret || !isDeploymentUrl(url, baseURL)) return {};
  return { 'x-vercel-protection-bypass': secret, 'x-vercel-set-bypass-cookie': 'true' };
}

/** Quita el secreto (y cualquier JWT) de un texto antes de mostrarlo o adjuntarlo. */
export function redactSecrets(text, secret) {
  let out = String(text ?? '');
  if (secret) out = out.split(secret).join('<bypass-redactado>');
  return out.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '<jwt-redactado>');
}

/** Convierte cabeceras Set-Cookie en cookies de Playwright para el host exacto del deployment. */
export function cookiesFromSetCookie(setCookies, baseURL) {
  const u = new URL(baseURL);
  const out = [];
  for (const raw of setCookies ?? []) {
    const [pair, ...attrs] = raw.split(';').map((s) => s.trim());
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    // expires = -1 (cookie de sesión) por omisión: el formato de storage state de Playwright exige el campo
    const cookie = { name: pair.slice(0, i), value: pair.slice(i + 1), domain: u.hostname, path: '/', expires: -1, httpOnly: false, secure: u.protocol === 'https:', sameSite: 'Lax' };
    for (const a of attrs) {
      const [k, v = ''] = a.split('=');
      const key = k.toLowerCase();
      if (key === 'path' && v) cookie.path = v;
      else if (key === 'httponly') cookie.httpOnly = true;
      else if (key === 'samesite') cookie.sameSite = /^none$/i.test(v) ? 'None' : /^strict$/i.test(v) ? 'Strict' : 'Lax';
      else if (key === 'max-age' && /^\d+$/.test(v)) cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
      else if (key === 'expires' && cookie.expires === -1 && Number.isFinite(Date.parse(v))) cookie.expires = Math.floor(Date.parse(v) / 1000);
    }
    if (cookie.sameSite === 'None') cookie.secure = true;
    out.push(cookie);
  }
  return out;
}

/**
 * Pide al deployment la cookie de bypass (una petición desde Node, no desde el navegador). Sigue como máximo 3
 * redirecciones, solo dentro del mismo host. Devuelve { ok, status, cookies, reason } sin incluir nunca el secreto.
 */
export async function fetchBypassCookies({ baseURL, secret, fetchImpl = fetch }) {
  if (!deploymentHost(baseURL)) return { ok: false, status: 0, cookies: [], reason: 'BASE_URL no es https (ni loopback)' };
  if (!secret) return { ok: false, status: 0, cookies: [], reason: 'sin secreto de bypass' };
  let url = baseURL; let status = 0; const jar = [];
  for (let hop = 0; hop < 4; hop++) {
    let res;
    try {
      res = await fetchImpl(url, { redirect: 'manual', headers: { ...bypassHeadersFor(url, baseURL, secret), ...(jar.length ? { cookie: jar.map((c) => `${c.name}=${c.value}`).join('; ') } : {}) } });
    } catch (e) { return { ok: false, status: 0, cookies: [], reason: `sin conexión con el deployment (${redactSecrets(e.message, secret)})` }; }
    status = res.status;
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of cookiesFromSetCookie(sc, baseURL)) { const k = jar.findIndex((x) => x.name === c.name); if (k >= 0) jar[k] = c; else jar.push(c); }
    const loc = res.headers.get('location');
    if (status >= 300 && status < 400 && loc) {
      const next = new URL(loc, url).toString();
      if (!isDeploymentUrl(next, baseURL)) break; // nunca seguir hacia otro host con el secreto
      url = next; continue;
    }
    break;
  }
  const hasVercelCookie = jar.some((c) => c.name === '_vercel_jwt');
  if (status === 401 || status === 403) return { ok: false, status, cookies: jar, reason: 'el deployment rechazó el secreto de bypass (revise «Protection Bypass for Automation»)' };
  return { ok: status > 0 && status < 400, status, cookies: jar, hasVercelCookie, reason: hasVercelCookie ? undefined : 'el deployment no emitió la cookie _vercel_jwt (¿la protección está desactivada o el secreto no corresponde?)' };
}

/**
 * Comprueba que las cookies persistidas autorizan el acceso SIN el secreto: una petición desde Node al deployment, solo con
 * la cabecera Cookie. Devuelve { ok, status, reason? }; nunca incluye valores de cookies ni el secreto.
 */
export async function verifyCookieAccess({ baseURL, cookies, fetchImpl = fetch }) {
  const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  let res;
  try { res = await fetchImpl(baseURL, { redirect: 'manual', headers: { cookie: header } }); } catch (e) { return { ok: false, status: 0, reason: `sin conexión al verificar la cookie (${e.message})` }; }
  if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, reason: 'la cookie guardada no autoriza el acceso al deployment (HTTP ' + res.status + ')' };
  return { ok: res.status < 400, status: res.status, reason: res.status < 400 ? undefined : `el deployment respondió HTTP ${res.status} con la cookie guardada` };
}

// Global setup (M36.2.1): en el destino preview con secreto de bypass, obtiene la cookie de Vercel desde Node, la PERSISTE como
// storage state en la ruta única AUTH_STATE_FILE (carpeta creada de forma recursiva, escritura atómica) y la VERIFICA antes de
// que arranque ningún worker: archivo existente, legible, con permisos 0600, estructura de Playwright válida, cookie del dominio
// exacto del Preview y acceso comprobado SOLO con la cookie (sin el secreto). Playwright espera a que esta función termine.
// Solo imprime estados y rutas; nunca el secreto ni valores de cookies. Si algo falla, lanza un error claro (no se crea un
// estado vacío ni se inventan cookies).
import path from 'node:path';
import { fetchBypassCookies, redactSecrets, verifyCookieAccess } from './vercelBypass.js';
import { AUTH_STATE_FILE, WEB_DIR, persistStorageState, readStorageState } from './authState.js';

export default async function globalSetup(config) {
  const { target, baseURL } = config.metadata ?? {};
  if (target !== 'preview') return;
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) { console.log('[bypass] sin VERCEL_AUTOMATION_BYPASS_SECRET: se prueba sin bypass (válido solo si el deployment no está protegido)'); return; }
  const fail = (msg) => { throw new Error(redactSecrets(msg, secret)); };

  const r = await fetchBypassCookies({ baseURL, secret });
  console.log(`[bypass] HTTP ${r.status} · cookie de Vercel: ${r.hasVercelCookie ? 'obtenida' : 'NO obtenida'}${r.reason ? ` · ${redactSecrets(r.reason, secret)}` : ''}`);
  if (!r.ok || !r.hasVercelCookie) fail(`Bypass de Vercel no disponible: ${r.reason ?? `HTTP ${r.status}`}`);

  let saved;
  try { saved = persistStorageState({ file: AUTH_STATE_FILE, cookies: r.cookies, baseURL }); } catch (e) { fail(`[bypass] ${e.message}`); }
  const check = readStorageState(AUTH_STATE_FILE, baseURL);
  if (!check.ok) fail(`[bypass] el storage state no pasó la comprobación previa a las pruebas: ${check.errors.join('; ')}`);

  const access = await verifyCookieAccess({ baseURL, cookies: check.state.cookies });
  if (!access.ok) fail(`[bypass] ${access.reason}`);
  console.log(`[bypass] storage state guardado y verificado: ${path.relative(WEB_DIR, saved.file)} · ${saved.cookies} cookie(s) · dominio ${new URL(baseURL).hostname} · acceso con cookie: HTTP ${access.status}`);
}

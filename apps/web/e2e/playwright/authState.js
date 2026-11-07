// Estado de autenticación de Vercel para Playwright (M36.2.1): ruta ÚNICA, escritura robusta y validación estricta.
// La ruta se calcula UNA vez a partir de la ubicación de este archivo (no de `config.rootDir`, que en Playwright vale el
// `testDir` cuando está definido, ni de process.cwd()), con path.resolve + fileURLToPath: correcta en Windows y Linux.
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync, accessSync, constants, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // apps/web
export const AUTH_DIR = path.join(WEB_DIR, '.auth');
export const AUTH_STATE_FILE = path.join(AUTH_DIR, 'vercel.json');
export const VERCEL_COOKIE = '_vercel_jwt';

const SAME_SITE = ['Strict', 'Lax', 'None'];

/** Errores de estructura/dominio del storage state respecto al formato de Playwright y al deployment. [] = válido. */
export function validateStorageState(state, baseURL) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['el estado no es un objeto JSON'];
  if (!Array.isArray(state.cookies)) errors.push('falta el arreglo "cookies"');
  if (!Array.isArray(state.origins)) errors.push('falta el arreglo "origins"');
  const cookies = Array.isArray(state.cookies) ? state.cookies : [];
  if (cookies.length === 0) errors.push('"cookies" está vacío (no se guarda un estado sin cookie)');
  let host = null; let secure = false;
  try { const u = new URL(baseURL); host = u.hostname; secure = u.protocol === 'https:'; } catch { errors.push('BASE_URL inválida'); }
  cookies.forEach((c, i) => {
    const at = `cookies[${i}]`;
    if (typeof c?.name !== 'string' || !c.name) errors.push(`${at}.name vacío`);
    if (typeof c?.value !== 'string' || !c.value) errors.push(`${at}.value vacío`);
    if (typeof c?.path !== 'string' || !c.path.startsWith('/')) errors.push(`${at}.path inválido`);
    if (typeof c?.expires !== 'number' || !Number.isFinite(c.expires)) errors.push(`${at}.expires debe ser un número (-1 = de sesión)`);
    if (typeof c?.httpOnly !== 'boolean') errors.push(`${at}.httpOnly debe ser booleano`);
    if (typeof c?.secure !== 'boolean') errors.push(`${at}.secure debe ser booleano`);
    if (!SAME_SITE.includes(c?.sameSite)) errors.push(`${at}.sameSite inválido`);
    if (host && c?.domain !== host) errors.push(`${at}.domain "${c?.domain}" no es el dominio exacto del deployment "${host}"`);
    if (secure && c?.secure !== true) errors.push(`${at}.secure debe ser true en https`);
  });
  if (cookies.length && !cookies.some((c) => c?.name === VERCEL_COOKIE)) errors.push(`no contiene la cookie ${VERCEL_COOKIE}`);
  return errors;
}

/**
 * Escribe el estado de forma atómica (archivo temporal + renombrado), creando la carpeta de forma recursiva, y lo
 * RELEE y valida. Lanza un Error claro si no se pudo persistir. No incluye nunca el secreto: solo las cookies recibidas.
 */
export function persistStorageState({ file = AUTH_STATE_FILE, cookies, baseURL }) {
  const state = { cookies, origins: [] };
  const pre = validateStorageState(state, baseURL);
  if (pre.length) throw new Error(`No se guardó el storage state de Vercel: ${pre.join('; ')}`);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, file);
    if (process.platform !== 'win32') chmodSync(file, 0o600);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* sin temporal */ }
    throw new Error(`No se pudo persistir el storage state de Vercel en ${file}: ${e.code ?? ''} ${e.message}`);
  }
  const back = readStorageState(file, baseURL);
  if (!back.ok) throw new Error(`El storage state de Vercel se escribió pero no es válido al releerlo (${file}): ${back.errors.join('; ')}`);
  return { file, cookies: back.state.cookies.length };
}

/** Lee y valida el archivo: existencia, lectura, tamaño, permisos (POSIX) y estructura. */
export function readStorageState(file = AUTH_STATE_FILE, baseURL) {
  if (!existsSync(file)) return { ok: false, errors: [`no existe ${file}`] };
  try { accessSync(file, constants.R_OK); } catch { return { ok: false, errors: [`${file} no es legible`] }; }
  const st = statSync(file);
  if (!st.isFile() || st.size === 0) return { ok: false, errors: [`${file} está vacío o no es un archivo`] };
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) return { ok: false, errors: [`permisos demasiado abiertos en ${file} (se esperaba 0600)`] };
  let state;
  try { state = JSON.parse(readFileSync(file, 'utf8')); } catch { return { ok: false, errors: [`${file} no es JSON válido`] }; }
  const errors = validateStorageState(state, baseURL);
  return errors.length ? { ok: false, errors, state } : { ok: true, errors: [], state };
}

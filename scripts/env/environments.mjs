// =============================================================================
// M26-T1 — Validador de config/environments.json (lista de permitidos por entorno).
//
// Funciones puras (sin dependencias, sin red, sin leer secretos):
//   validateConfig(cfg)                      → string[] de errores de la configuración
//   isSupabaseUrlAllowed(cfg, envName, url)  → { ok, error? } (la usará la guarda de build, T2)
//   isWompiPublicKeyAllowed(cfg, envName, k) → { ok, error? }
//
// Reglas:
//   · Solo existen los entornos "local" y "qa". Cualquier otro (en especial "production") es un error:
//     Production está fuera del alcance de la fábrica.
//   · local: solo hosts de loopback, protocolo http o https.
//   · qa: solo https y hosts con la forma exacta <ref de 20 caracteres>.supabase.co; nada de comodines.
//     Una lista vacía es válida (QA aún no creado) pero hace que cualquier URL de QA se rechace.
//   · Wompi: solo modo sandbox y prefijo de llave pública pub_test_.
//   · Sin valores por defecto: lo que falta es un error.
//   · Los mensajes nunca incluyen valores recibidos (URLs, llaves): solo nombres de campos y entornos.
//
// CLI: node scripts/env/environments.mjs validate-config [ruta]   (exit 0 OK · 1 inválida · 2 no legible)
// =============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ALLOWED_ENVIRONMENTS = Object.freeze(['local', 'qa']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const QA_HOST_RE = /^[a-z0-9]{20}\.supabase\.co$/;
const WOMPI_TEST_PREFIX = 'pub_test_';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateConfig(cfg) {
  const errors = [];
  if (!isPlainObject(cfg)) return ['la configuración debe ser un objeto JSON'];
  if (cfg.version !== 1) errors.push('version debe ser 1');
  if (!isPlainObject(cfg.environments)) return [...errors, 'falta el objeto "environments"'];

  for (const name of Object.keys(cfg.environments)) {
    if (!ALLOWED_ENVIRONMENTS.includes(name)) {
      errors.push(`entorno "${name}" no permitido: solo ${ALLOWED_ENVIRONMENTS.join(', ')} (Production está fuera del alcance de la fábrica)`);
    }
  }
  for (const name of ALLOWED_ENVIRONMENTS) {
    const env = cfg.environments[name];
    if (!isPlainObject(env)) { errors.push(`falta el entorno "${name}"`); continue; }
    errors.push(...validateSupabase(name, env.supabase), ...validateWompi(name, env.wompi));
  }
  return errors;
}

function validateSupabase(name, sb) {
  const e = [];
  const p = `${name}.supabase`;
  if (!isPlainObject(sb)) return [`falta ${p}`];
  if (!isStringArray(sb.allowed_protocols) || sb.allowed_protocols.length === 0) e.push(`${p}.allowed_protocols debe ser una lista no vacía`);
  if (!isStringArray(sb.allowed_hosts)) { e.push(`${p}.allowed_hosts debe ser una lista de cadenas`); return e; }

  const protocols = isStringArray(sb.allowed_protocols) ? sb.allowed_protocols : [];
  const okProtocols = name === 'local' ? ['http', 'https'] : ['https'];
  for (const pr of protocols) if (!okProtocols.includes(pr)) e.push(`${p}.allowed_protocols: protocolo no permitido en ${name}`);

  const seen = new Set();
  sb.allowed_hosts.forEach((h, i) => {
    const at = `${p}.allowed_hosts[${i}]`;
    if (seen.has(h)) e.push(`${at}: duplicado`);
    seen.add(h);
    if (h !== h.trim() || h !== h.toLowerCase()) { e.push(`${at}: debe estar en minúsculas y sin espacios`); return; }
    if (/[*?/:@\s]/.test(h.replace(/^\[::1\]$/, ''))) { e.push(`${at}: solo un nombre de host (sin comodines, rutas, puertos ni credenciales)`); return; }
    if (name === 'local' && !LOOPBACK_HOSTS.has(h)) e.push(`${at}: en local solo se admiten hosts de loopback`);
    if (name === 'qa' && !QA_HOST_RE.test(h)) e.push(`${at}: en qa solo se admite <ref de 20 caracteres>.supabase.co`);
  });
  if (name === 'local' && sb.allowed_hosts.length === 0) e.push(`${p}.allowed_hosts no puede estar vacío en local`);
  return e;
}

function validateWompi(name, w) {
  const p = `${name}.wompi`;
  if (!isPlainObject(w)) return [`falta ${p}`];
  const e = [];
  if (w.mode !== 'sandbox') e.push(`${p}.mode debe ser "sandbox"`);
  if (w.public_key_prefix !== WOMPI_TEST_PREFIX) e.push(`${p}.public_key_prefix debe ser "${WOMPI_TEST_PREFIX}"`);
  return e;
}

function envOf(cfg, envName) {
  if (!ALLOWED_ENVIRONMENTS.includes(envName)) return { error: `entorno "${String(envName)}" no permitido (solo ${ALLOWED_ENVIRONMENTS.join(', ')})` };
  const env = cfg?.environments?.[envName];
  return env ? { env } : { error: `el entorno "${envName}" no está configurado` };
}

export function isSupabaseUrlAllowed(cfg, envName, rawUrl) {
  const { env, error } = envOf(cfg, envName);
  if (error) return { ok: false, error };
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return { ok: false, error: 'falta la URL de Supabase' };
  let u;
  try { u = new URL(rawUrl); } catch { return { ok: false, error: 'la URL de Supabase no es válida' }; }
  if (u.username || u.password) return { ok: false, error: 'la URL de Supabase no puede contener credenciales' };
  if (u.pathname !== '/' || u.search || u.hash) return { ok: false, error: 'la URL de Supabase debe ser solo el origen (sin ruta, consulta ni fragmento)' };
  const protocol = u.protocol.replace(/:$/, '');
  if (!env.supabase.allowed_protocols.includes(protocol)) return { ok: false, error: `protocolo no permitido para ${envName}` };
  if (!env.supabase.allowed_hosts.includes(u.hostname)) {
    return { ok: false, error: env.supabase.allowed_hosts.length === 0
      ? `${envName} no tiene hosts permitidos (el propietario aún no ha configurado el proyecto)`
      : `host de Supabase no permitido para ${envName}` };
  }
  return { ok: true };
}

export function isWompiPublicKeyAllowed(cfg, envName, key) {
  const { env, error } = envOf(cfg, envName);
  if (error) return { ok: false, error };
  if (typeof key !== 'string' || key === '') return { ok: false, error: 'falta la llave pública de Wompi' };
  if (!key.startsWith(env.wompi.public_key_prefix)) return { ok: false, error: `la llave pública de Wompi no es de sandbox (${envName} exige el prefijo ${env.wompi.public_key_prefix})` };
  return { ok: true };
}

export function loadConfig(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, fileArg] = process.argv.slice(2);
  const file = fileArg ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../config/environments.json');
  if (cmd !== 'validate-config') { console.error('uso: node scripts/env/environments.mjs validate-config [ruta]'); process.exit(2); }
  let cfg;
  try { cfg = loadConfig(file); } catch { console.error(`ERROR: no se pudo leer o interpretar ${path.basename(file)}`); process.exit(2); }
  const errors = validateConfig(cfg);
  if (errors.length) { errors.forEach((e) => console.error(`ERROR: ${e}`)); process.exit(1); }
  const qa = cfg.environments.qa.supabase.allowed_hosts.length;
  console.log(`config/environments.json: OK (local y qa; qa con ${qa} host(s) permitido(s)${qa ? '' : ' — QA aún no configurado'})`);
}

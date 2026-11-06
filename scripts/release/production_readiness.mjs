// =============================================================================
// M26-R1 (MAJ-5) — Condición previa de preparación de Production antes de integrar en main.
//
// Desde M26 la aplicación EXIGE variables nuevas (APP_ENV, VITE_APP_ENV, SUPABASE_URL y WOMPI_PUBLIC_KEY de servidor,
// VITE_WOMPI_ENV): si Production no las tiene, el siguiente despliegue de main no arranca. La fábrica NO accede a
// Vercel ni a Supabase Production; por eso el propietario confirma, en una declaración versionada
// (config/production_readiness.json), que las ha configurado. Esta comprobación:
//   · deriva del CÓDIGO la lista de variables que exigen el cliente (guarda de build), el servidor de Vercel y la Edge
//     Function, y exige que la declaración nombre exactamente esas (ni una más ni una menos);
//   · exige APP_ENV=production y VITE_APP_ENV=production como valores esperados (no son secretos);
//   · no admite valores de variables en la declaración (solo nombres);
//   · en modo `main`, exige además la confirmación del propietario (quién, fecha) ligada a la huella de la lista: si el
//     código cambia las variables exigidas, la confirmación anterior deja de valer.
// Uso: node scripts/release/production_readiness.mjs <validate|main|fingerprint> [--file <declaración>]
// Salida: 0 correcto · 1 no preparado / desincronizado · 2 uso o archivo ilegible.
// =============================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_VARS as CLIENT_VARS } from '../env/check_env.mjs';
import { SERVER_VARS } from '../../apps/web/api/_lib/serverConfig.js';
// M26-R1.1: Production solo arranca si la plataforma expone VERCEL_ENV en ejecución (variables de sistema de Vercel).
export const PLATFORM_REQUIRED = Object.freeze(['VERCEL_ENV']);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DECLARATION = path.join(ROOT, 'config/production_readiness.json');
const EDGE_CONFIG = path.join(ROOT, 'supabase/functions/wompi-webhook/config.ts');
const EDGE_INJECTED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; // las inyecta Supabase en cada función
export const EXPECTED_VALUES = Object.freeze({ APP_ENV: 'production', VITE_APP_ENV: 'production' });

/** Variables que el código exige hoy, por destino. */
export function requiredFromCode(edgeSource = readFileSync(EDGE_CONFIG, 'utf8')) {
  const edgeAll = [...new Set([...edgeSource.matchAll(/\bget\('([A-Z][A-Z0-9_]*)'\)/g)].map((m) => m[1]))]
    .filter((n) => !n.startsWith('VITE_')); // las VITE_* solo se citan para orientar el mensaje de error
  return {
    vercel: [...new Set([...CLIENT_VARS, ...Object.keys(SERVER_VARS)])].sort(),
    supabase_edge: edgeAll.filter((n) => !EDGE_INJECTED.includes(n)).sort(),
    vercel_platform: [...PLATFORM_REQUIRED],
  };
}

export function fingerprint(req) {
  return createHash('sha256').update(JSON.stringify({ req, values: EXPECTED_VALUES })).digest('hex').slice(0, 16);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * @param {any} decl declaración parseada
 * @param {'validate'|'main'} mode
 * @returns {string[]} problemas (vacío = correcto); nunca incluyen valores de variables
 */
export function checkDeclaration(decl, mode, { req = requiredFromCode(), today = new Date().toISOString().slice(0, 10) } = {}) {
  const errs = [];
  if (!decl || typeof decl !== 'object' || Array.isArray(decl)) return ['la declaración debe ser un objeto JSON'];
  if (decl.version !== 1) errs.push('version debe ser 1');
  for (const target of Object.keys(req)) {
    const t = decl.targets?.[target];
    if (!t || !Array.isArray(t.variables)) { errs.push(`targets.${target}.variables: falta`); continue; }
    const names = [];
    for (const v of t.variables) {
      if (!v || typeof v.name !== 'string') { errs.push(`targets.${target}: entrada sin nombre`); continue; }
      const extra = Object.keys(v).filter((k) => !['name', 'expected', 'note'].includes(k));
      if (extra.length) errs.push(`targets.${target}.${v.name}: campos no permitidos (${extra.join(', ')}); la declaración solo lleva nombres`);
      if ('expected' in v && EXPECTED_VALUES[v.name] === undefined) errs.push(`targets.${target}.${v.name}: "expected" solo se admite para ${Object.keys(EXPECTED_VALUES).join(', ')}`);
      if (EXPECTED_VALUES[v.name] !== undefined && v.expected !== EXPECTED_VALUES[v.name]) errs.push(`targets.${target}.${v.name}: expected debe ser "${EXPECTED_VALUES[v.name]}"`);
      names.push(v.name);
    }
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) errs.push(`targets.${target}: duplicadas ${[...new Set(dup)].join(', ')}`);
    const missing = req[target].filter((n) => !names.includes(n));
    const unknown = names.filter((n) => !req[target].includes(n));
    if (missing.length) errs.push(`targets.${target}: el código exige y la declaración no nombra: ${missing.join(', ')}`);
    if (unknown.length) errs.push(`targets.${target}: la declaración nombra variables que el código no exige: ${unknown.join(', ')}`);
  }
  const extraTargets = Object.keys(decl.targets ?? {}).filter((k) => !(k in req));
  if (extraTargets.length) errs.push(`targets: destinos desconocidos ${extraTargets.join(', ')}`);
  if (mode === 'main') {
    const c = decl.owner_confirmation ?? {};
    if (c.confirmed !== true) errs.push('owner_confirmation.confirmed: el propietario no ha confirmado que Production tiene estas variables');
    if (typeof c.confirmed_by !== 'string' || !c.confirmed_by.trim()) errs.push('owner_confirmation.confirmed_by: falta');
    if (typeof c.confirmed_on !== 'string' || !ISO_DATE.test(c.confirmed_on) || Number.isNaN(Date.parse(c.confirmed_on))) errs.push('owner_confirmation.confirmed_on: fecha AAAA-MM-DD obligatoria');
    else if (c.confirmed_on > today) errs.push('owner_confirmation.confirmed_on: fecha futura');
    if (c.fingerprint !== fingerprint(req)) errs.push('owner_confirmation.fingerprint: la confirmación no corresponde a las variables que exige el código actual (reconfirmar)');
  }
  return errs;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const fi = rest.indexOf('--file');
  const file = fi >= 0 ? rest[fi + 1] : DECLARATION;
  if (cmd === 'fingerprint') { console.log(fingerprint(requiredFromCode())); return 0; }
  if (!['validate', 'main'].includes(cmd) || (fi >= 0 && !file)) {
    console.error('Uso: production_readiness.mjs <validate|main|fingerprint> [--file <declaración>]'); return 2;
  }
  let decl;
  try { decl = JSON.parse(readFileSync(file, 'utf8')); } catch { console.error(`ERROR: no se puede leer la declaración (${path.relative(ROOT, file) || file})`); return 2; }
  const errs = checkDeclaration(decl, cmd);
  if (errs.length) {
    console.error(`Preparación de Production (${cmd}): NO PREPARADO`);
    errs.forEach((e) => console.error(`  - ${e}`));
    if (cmd === 'main') console.error('Integrar en main requiere que el propietario configure Production y confirme en config/production_readiness.json (MISION_26/09_R1_CORRECCIONES.md §MAJ-5).');
    return 1;
  }
  console.log(`Preparación de Production (${cmd}): OK · ${Object.entries(requiredFromCode()).map(([k, v]) => `${k}=${v.length}`).join(' · ')}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

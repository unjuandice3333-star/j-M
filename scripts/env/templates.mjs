// =============================================================================
// M26-T4 — Verificación de las plantillas de entorno.
//
// Plantillas (sin secretos; ubicadas en config/env/ porque .gitignore, la compuerta de commits y las reglas de
// denegación de los agentes tratan cualquier archivo .env* como secreto):
//   config/env/local.env.example  → valores PÚBLICOS del stack local; llaves y secretos vacíos
//   config/env/qa.env.example     → solo nombres, sin ningún valor
//   .env.example (raíz, heredado) → solo nombres; remite a las plantillas anteriores
//
// Fuente de verdad: el código. El conjunto de variables se deriva de REQUIRED_VARS (guarda de build, T2) y SERVER_VARS
// (configuración de servidor, T3): si el código exige una variable nueva, la verificación falla hasta documentarla.
//
// CLI: node scripts/env/templates.mjs check   (exit 0 OK · 1 problemas · 2 no legible)
// =============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_VARS } from './check_env.mjs';
import { SERVER_VARS } from '../../apps/web/api/_lib/serverConfig.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TEMPLATES = Object.freeze({
  local: 'config/env/local.env.example',
  qa: 'config/env/qa.env.example',
  legacy: '.env.example',
});
export const EXPECTED_VARS = Object.freeze([...new Set([...REQUIRED_VARS, ...Object.keys(SERVER_VARS)])].sort());

// Variables cuyo valor nunca puede aparecer en una plantilla (llaves y secretos, aunque sean "de prueba").
const SECRET_NAME_RE = /SERVICE_ROLE|SECRET|INTEGRITY|EVENTS|ANON_KEY|PUBLIC_KEY|PASSWORD|TOKEN|PRIVATE/;
// Formas de valores sensibles (aunque estén bajo un nombre inocente).
const SECRET_VALUE_PATTERNS = [
  ['JWT', /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/],
  ['llave de Supabase', /\bsb_(secret|publishable)_/],
  ['llave de Wompi', /\bpub_(test|prod)_/],
  ['secreto de Wompi', /\b(test|prod)_(integrity|events)_/],
  ['host de un proyecto Supabase', /\b[a-z0-9]{20}\.supabase\.co\b/],
  ['cadena aleatoria larga', /[A-Za-z0-9+/_-]{32,}/],
];

/**
 * Analiza un archivo de entorno: { entries: [{name, value, line, quoted}], problems: string[] }
 * M26-R1 (MAJ-1): normaliza los valores igual que dotenv/Vite, para que TODAS las comprobaciones vean el valor real:
 *   · prefijo opcional `export `;
 *   · valor entre comillas dobles, simples o invertidas (las comillas se retiran; en dobles, \n → salto de línea);
 *   · comentario en línea ` # …` en valores sin comillas.
 * Unas comillas sin cerrar o texto tras la comilla de cierre son un problema (no se adivina el valor).
 */
export function parseEnv(text) {
  const entries = [];
  const problems = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) { problems.push(`línea ${i + 1}: formato no válido (se espera NOMBRE=valor)`); return; }
    let rest = m[2];
    let value;
    let quoted = false;
    const q = rest[0];
    if (q === '"' || q === "'" || q === '`') {
      const end = rest.indexOf(q, 1);
      if (end < 0) { problems.push(`línea ${i + 1}: ${m[1]} tiene comillas sin cerrar`); return; }
      const after = rest.slice(end + 1).trim();
      if (after !== '' && !after.startsWith('#')) { problems.push(`línea ${i + 1}: ${m[1]} tiene texto tras la comilla de cierre`); return; }
      value = rest.slice(1, end);
      if (q === '"') value = value.replace(/\\n/g, '\n');
      quoted = true;
    } else {
      const hash = rest.search(/\s#/);
      value = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
    }
    entries.push({ name: m[1], value, line: i + 1, quoted });
  });
  return { entries, problems };
}

/** Valores con forma de secreto o no vacíos bajo nombres de secreto. Los mensajes nunca muestran el valor. */
export function findSecretShapedValues(entries) {
  const out = [];
  for (const { name, value, line } of entries) {
    if (!value) continue;
    if (SECRET_NAME_RE.test(name)) out.push(`línea ${line}: ${name} debe estar vacía en una plantilla (es una llave o un secreto)`);
    for (const [label, re] of SECRET_VALUE_PATTERNS) {
      if (re.test(value)) out.push(`línea ${line}: ${name} tiene un valor con forma de ${label}`);
    }
  }
  return out;
}

/** Comprueba una plantilla concreta. kind: 'local' | 'qa' | 'legacy' */
export function checkTemplate(kind, text) {
  const { entries, problems } = parseEnv(text);
  const names = entries.map((e) => e.name);
  const seen = new Set();
  for (const n of names) { if (seen.has(n)) problems.push(`${n}: duplicada`); seen.add(n); }
  for (const n of EXPECTED_VARS) if (!seen.has(n)) problems.push(`${n}: falta en la plantilla (el código la exige)`);
  for (const n of seen) if (!EXPECTED_VARS.includes(n)) problems.push(`${n}: el código no la usa; no debe documentarse en la plantilla`);
  problems.push(...findSecretShapedValues(entries));

  const value = (n) => entries.find((e) => e.name === n)?.value ?? '';
  if (kind === 'qa' || kind === 'legacy') {
    for (const e of entries) if (e.value) problems.push(`línea ${e.line}: ${e.name} debe ir sin valor en esta plantilla (solo nombres)`);
  }
  if (kind === 'local') {
    const expected = { VITE_APP_ENV: 'local', VITE_WOMPI_ENV: 'sandbox', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_URL: 'http://127.0.0.1:54321', APP_ENV: 'local' };
    for (const [n, v] of Object.entries(expected)) if (value(n) !== v) problems.push(`${n}: en la plantilla local debe ser el valor público del stack local`);
  }
  return { entries, problems };
}

export function checkAllTemplates(root = ROOT) {
  const result = {};
  for (const [kind, rel] of Object.entries(TEMPLATES)) {
    result[kind] = checkTemplate(kind, readFileSync(path.join(root, rel), 'utf8'));
  }
  return result;
}

// --- CLI ----------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv[2] !== 'check') { console.error('uso: node scripts/env/templates.mjs check'); process.exit(2); }
  let all;
  try { all = checkAllTemplates(); } catch { console.error('ERROR: no se pudo leer alguna plantilla'); process.exit(2); }
  let bad = 0;
  for (const [kind, { problems }] of Object.entries(all)) {
    if (problems.length) { bad += problems.length; problems.forEach((p) => console.error(`ERROR ${TEMPLATES[kind]}: ${p}`)); }
  }
  if (bad) process.exit(1);
  console.log(`Plantillas de entorno: OK (${Object.values(TEMPLATES).join(', ')}; ${EXPECTED_VARS.length} variables, sin valores secretos)`);
}

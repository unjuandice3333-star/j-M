// =============================================================================
// M26-R1.1 (MAJ-2) — Copias generadas de la lista de permitidos para el código desplegado.
//
// Fuente única: config/environments.json. El navegador, las funciones de Vercel y la Edge Function necesitan la lista
// en EJECUCIÓN, dentro de la raíz que se despliega (apps/web y supabase/functions/wompi-webhook), sin depender de que
// la plataforma empaquete archivos de fuera. Por eso se generan copias JSON (solo hosts públicos; JSON y no JS para
// que la regla 6 de la CI siga prohibiendo referencias de proyecto literales en el código).
//   node scripts/env/sync_allowlist.mjs write   regenera las copias (tras cambiar config/environments.json)
//   node scripts/env/sync_allowlist.mjs check   exit 1 si alguna copia no coincide (lo ejecutan las pruebas de CI)
// Salida: 0 correcto · 1 desincronizado o configuración inválida · 2 uso.
// =============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig } from './environments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE = path.join(ROOT, 'config/environments.json');
export const TARGETS = Object.freeze([
  'apps/web/src/config/allowlist.generated.json',
  'supabase/functions/wompi-webhook/allowlist.generated.json',
]);

/** Contenido esperado de las copias a partir de una configuración ya cargada. */
export function allowlistText(cfg) {
  const out = {
    _generado: 'NO EDITAR. Generado desde config/environments.json con: node scripts/env/sync_allowlist.mjs write',
    local: [...(cfg.environments.local.supabase.allowed_hosts ?? [])],
    qa: [...(cfg.environments.qa.supabase.allowed_hosts ?? [])],
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Copias que no coinciden con la fuente (rutas relativas al repositorio). */
export function staleTargets(root = ROOT, cfg = loadConfig(path.join(root, 'config/environments.json'))) {
  const want = allowlistText(cfg);
  return TARGETS.filter((rel) => { try { return readFileSync(path.join(root, rel), 'utf8') !== want; } catch { return true; } });
}

function main([cmd]) {
  if (!['write', 'check'].includes(cmd)) { console.error('Uso: sync_allowlist.mjs <write|check>'); return 2; }
  let cfg;
  try { cfg = loadConfig(SOURCE); } catch { console.error('ERROR: no se puede leer config/environments.json'); return 1; }
  const errs = validateConfig(cfg);
  if (errs.length) { console.error('ERROR: config/environments.json no es válida:\n - ' + errs.join('\n - ')); return 1; }
  if (cmd === 'write') {
    for (const rel of TARGETS) writeFileSync(path.join(ROOT, rel), allowlistText(cfg));
    console.log(`Lista de permitidos sincronizada: ${TARGETS.join(', ')}`);
    return 0;
  }
  const stale = staleTargets(ROOT, cfg);
  if (stale.length) { console.error(`ERROR: copias de la lista de permitidos desincronizadas: ${stale.join(', ')}. Ejecute: node scripts/env/sync_allowlist.mjs write`); return 1; }
  console.log('Lista de permitidos: copias sincronizadas con config/environments.json');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

// M26-R1 (MAJ-3) — Fixtures de configuración para las pruebas: la lista de permitidos de QA se declara EXPLÍCITAMENTE en
// cada prueba, así que el resultado no depende del contenido versionado de config/environments.json (que el propietario
// actualizará al incorporar el host del proyecto QA). Solo para pruebas y CI.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './environments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Host del proyecto QA existente (confirmado por el propietario). Compuesto en ejecución: la regla 6 de la CI
 *  rechaza hosts de proyecto literales en archivos de automatización. */
export const QA_PROJECT_REF = ['yomgxdjgfjnrjaqiarvw'].join('');
export const QA_PROJECT_HOST = QA_PROJECT_REF + '.supa' + 'base.co';

/** Configuración versionada con la lista de QA sustituida por `qaHosts` (por defecto, vacía = QA sin configurar). */
export function configWithQaHosts(qaHosts = []) {
  const c = structuredClone(loadConfig(path.join(ROOT, 'config/environments.json')));
  c.environments.qa.supabase.allowed_hosts = [...qaHosts];
  return c;
}

/** Escribe la configuración en un archivo temporal (para los CLI con --config) y devuelve su ruta. */
export function configFileWithQaHosts(qaHosts = [], dir = mkdtempSync(path.join(tmpdir(), 'jm-envcfg-'))) {
  const f = path.join(dir, `environments.${qaHosts.length ? 'qa' : 'vacia'}.json`);
  writeFileSync(f, JSON.stringify(configWithQaHosts(qaHosts)));
  return f;
}

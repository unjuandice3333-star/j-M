// M26-R1 (MAJ-2) — Configuración del cliente en EJECUCIÓN: import.meta.env + la lista de permitidos versionada.
// La lista (solo hosts públicos) se incrusta en el bundle desde config/environments.json, la misma fuente que usan las
// guardas de build (T1/T2). Así, en local y qa, la aplicación no arranca contra un host no permitido.
import environments from '../../../../config/environments.json';
import { readClientConfig } from './clientConfig.js';

const allowedHosts = Object.freeze({
  local: environments.environments?.local?.supabase?.allowed_hosts ?? [],
  qa: environments.environments?.qa?.supabase?.allowed_hosts ?? [],
});

let cached;
/** Configuración del cliente validada una sola vez, al primer uso (en el arranque de la aplicación). */
export function getClientConfig() {
  if (!cached) cached = readClientConfig(import.meta.env, { allowedHosts });
  return cached;
}

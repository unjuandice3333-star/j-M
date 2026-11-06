// M26-R1 (MAJ-2) — Configuración del cliente en EJECUCIÓN: import.meta.env + la lista de permitidos versionada.
// La lista (solo hosts públicos) se incrusta en el bundle desde config/environments.json, la misma fuente que usan las
// guardas de build (T1/T2). Así, en local y qa, la aplicación no arranca contra un host no permitido.
//
// M26-R1.1 (MAJ-2): la lista viene de la copia generada dentro de apps/web (scripts/env/sync_allowlist.mjs; una prueba
// de CI exige que coincida con config/environments.json), y las señales de despliegue de Vercel las incrusta el build
// (vite.config.js → __JM_DEPLOY_SIGNALS__). Sin señales incrustadas el contexto es local/CI y production se rechaza.
/* global __JM_DEPLOY_SIGNALS__ */
import allowlist from './allowlist.generated.json';
import { readClientConfig } from './clientConfig.js';

const allowedHosts = Object.freeze({ local: allowlist.local ?? [], qa: allowlist.qa ?? [] });
const deploy = typeof __JM_DEPLOY_SIGNALS__ !== 'undefined' ? __JM_DEPLOY_SIGNALS__ : {};

let cached;
/** Configuración del cliente validada una sola vez, al primer uso (en el arranque de la aplicación). */
export function getClientConfig() {
  if (!cached) cached = readClientConfig(import.meta.env, { allowedHosts, deploy });
  return cached;
}

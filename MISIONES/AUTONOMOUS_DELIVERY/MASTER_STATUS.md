# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-07 (ejecución 3, M32)
Rama autorizada: `mission/m26-dev-qa-environments`

## Continuidad
- Las ejecuciones 1–2 (M31.x) quedaron publicadas en GitHub (rama `mission/m26-dev-qa-environments`, `1cb1b4e`) y la ejecución 3 las recuperó desde un contenedor nuevo (arranque 05:36, distinto del 05:08): rama y HEAD idénticos al remoto, árbol limpio.
- Permisos: `.claude/settings.json` v2.1 permite solo `git push origin mission/m26-dev-qa-environments`. `main` protegida por el ruleset `PROTECT-MAIN-JM` (confirmado visualmente por el propietario).

## Estado verificado (ejecutado, no supuesto)
| Comprobación | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm build` | OK |
| `pnpm test:unit` (vitest) | 6/6 |
| `pnpm test:env` (node:test) | 140/141. El fallo `check_env.test.mjs` "sin variables → lista las 5 obligatorias" es del entorno: existe un `.env.local` ignorado en apps/web que aporta VITE_SUPABASE_URL; falla también sin los cambios de esta ejecución |
| ESLint (`apps packages scripts`, excluyendo dist*) | 0 errores, 0 avisos (antes 9) |
| `apps/web/scripts/test-checkout-invariants.mjs` | 10/10 |
| BD local PostgreSQL 16 efímero (`supabase/tests/run_local.sh`, sin Docker) | pgTAP 278/278, concurrencia 12/12, determinismo OK |

## NO verificado
- Supabase local (`supabase start`): Docker sin demonio en este entorno (no hay `/var/run/docker.sock`).
- E2E Playwright (`apps/web/e2e/*`): requieren la API de Supabase local (GoTrue/PostgREST), no disponible sin Docker.
- Wompi Sandbox real y Vercel Preview: faltan credenciales (ver abajo).

## Credenciales necesarias del propietario (no pegar en el chat; cargarlas en el entorno de Vercel/GitHub)
- Wompi Sandbox: `WOMPI_PUBLIC_KEY` (pub_test_…), `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET`, `WOMPI_ENV=sandbox` (firma de integridad y validación de webhooks) y la URL de eventos del panel sandbox apuntando al Preview por HTTPS.
- Backend del Preview: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` del proyecto QA/Preview (nunca Production).
- Vercel Preview: autenticación de Vercel; el agente tiene `vercel` denegado por política M25.

## Pendiente (prioridad)
1. Encontrar una forma de ejecutar los E2E sin Docker (p. ej. GoTrue+PostgREST locales sobre el PostgreSQL 16 efímero) o ejecutarlos en CI.
2. Cobertura de pruebas unitarias para carrito, checkout y autenticación (hoy solo hay 6 pruebas en packages/utils).
3. Revisar `apps/web/dist-qa` y el aviso `MODULE_TYPELESS_PACKAGE_JSON` de eslint.config.js (añadir `"type": "module"` o renombrar a .mjs).
4. Wompi Sandbox / Vercel Preview cuando existan credenciales.

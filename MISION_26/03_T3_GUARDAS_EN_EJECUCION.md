# M26 — T3: guardas de configuración en ejecución

**Estado:** T3 ejecutada en local, pendiente de revisión. M26 sigue EN CURSO (faltan T4–T8). No se publicó, no se tocó
Vercel, no hubo migraciones ni operaciones remotas.

## Qué cambia
| Componente | Antes | Ahora |
|---|---|---|
| Frontend `apps/web/src/config/supabase.js` | Fallaba si faltaban URL o llave, sin validarlas | `getClientConfig()` valida al arrancar: URL (solo el origen), llave anon (nunca secreta ni `service_role`) |
| Frontend `apps/web/src/services/wompi.js` | **Llave pública fija** y `sandbox` por defecto | Sin valores por defecto: `VITE_WOMPI_PUBLIC_KEY` y `VITE_WOMPI_ENV` obligatorias y coherentes (`pub_test_`↔`sandbox`, `pub_prod_`↔`production`); en `local`/`qa` solo sandbox |
| Vercel `api/wompi/signature.js` | Leía `VITE_SUPABASE_URL` y `VITE_WOMPI_PUBLIC_KEY`; **sin `SUPABASE_SERVICE_ROLE_KEY` usaba la llave anon**; no validaba la URL | `requireServerConfig`: solo `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_PUBLIC_KEY`, validadas y con el mismo modo Wompi |
| Vercel `api/wompi/webhook.js` | `VITE_SUPABASE_URL` tenía prioridad sobre `SUPABASE_URL` | Solo `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `WOMPI_EVENTS_SECRET`, validadas |
| Edge `wompi-webhook/index.ts` | Respaldo a `VITE_SUPABASE_URL` | `readEdgeConfig` (`config.ts`): solo variables de servidor, validadas |

Reglas comunes:
- El cliente solo usa `VITE_*`; el servidor solo nombres de servidor, sin respaldo a `VITE_*` ni sustitución de llaves.
- Con configuración inválida, el endpoint responde 500 genérico **antes** de crear el cliente de Supabase. El log del
  servidor nombra las variables con problemas (y avisa si existe la variable de cliente equivalente), nunca valores.
- En el navegador, la aplicación no arranca y lanza `ConfigError` con la lista de variables.
- La regla "la fábrica solo construye local/qa" la aplica T2 en la build. En ejecución, el código acepta también
  Production (`pub_prod_`/`prod_*`), porque la aplicación debe poder liberarse en M36.

## Archivos
| Archivo | Tipo |
|---|---|
| `apps/web/src/config/clientConfig.js` | Nuevo: `readClientConfig` (pura), `getClientConfig`, `ConfigError`, `jwtRole` |
| `apps/web/api/_lib/serverConfig.js` | Nuevo: `readServerConfig`, `requireServerConfig`, `clean` (Vercel no publica `_lib` como endpoint) |
| `supabase/functions/wompi-webhook/config.ts` | Nuevo: `readEdgeConfig` (Deno) |
| `apps/web/src/config/supabase.js`, `apps/web/src/services/wompi.js` | Usan la configuración validada |
| `apps/web/api/wompi/signature.js`, `webhook.js`, `supabase/functions/wompi-webhook/index.ts` | Solo cambia la lectura de configuración; la lógica de firma, idempotencia y transiciones no cambia |
| `scripts/env/runtime_config.test.mjs` | Nuevo: 17 pruebas (cliente, servidor y endpoints reales) |
| `apps/web/scripts/test-edge-config.ts` | Nuevo: 12 pruebas de la configuración Edge (Deno) |
| `apps/web/scripts/test-webhook-security.mjs` | El fixture usa `SUPABASE_URL` (variable de servidor) en lugar de `VITE_SUPABASE_URL` |
| `package.json` | `test:env` incluye las pruebas de T3 |

## Resultados
| Prueba | Resultado |
|---|---|
| `pnpm test:env` (T1 + T2 + T3) | 54/54 |
| Mutaciones T3 (respaldo del servidor a `VITE_*` · valores por defecto de Wompi · mezclar sandbox/producción) | Las 3 se detectan (2, 1 y 1 pruebas fallan) |
| Webhook Vercel (`test-webhook-security.mjs`) | 12/12 |
| Edge (`test-edge-security.ts`) y su configuración (`test-edge-config.ts`, `deno check`) | 12/12 · 12/12 · OK |
| Navegador real (vite preview + Chromium), build de la fábrica | La app arranca sin `ConfigError` |
| Navegador real, build sin guarda (como Vercel) con Wompi incoherente | No arranca: `ConfigError` con `VITE_WOMPI_ENV: no coincide…` (solo nombres) |
| `build.sh` | PASS (tras resolver el conflicto descrito abajo) |
| CI quick, autoprueba de compuertas y actionlint sobre `02f2051` | PASS PARCIAL (11 PASS, 2 SKIPPED por perfil) · 72/72 · 0 hallazgos |

## Incidencias resueltas
1. **Conflicto entre guardas.** La guarda del cliente contenía el literal del prefijo de las llaves secretas de Supabase
   (para *rechazarlas*), y la verificación del bundle de `build.sh` (M25) rechaza cualquier bundle que contenga ese marcador.
   Se corrigió en el código nuevo (el prefijo se compone en ejecución) y no se relajó la verificación.
2. **Falso positivo de gitleaks causado por un fixture de prueba.** La validación del primer commit de T3, `6450f90`,
   falló en `21_secrets_scan` (y en el control positivo "secretos" de la autoprueba, 71/72): gitleaks (regla
   `generic-api-key`) detectó en `apps/web/scripts/test-edge-config.ts:28` el literal ficticio asignado a la clave
   `WOMPI_EVENTS_SECRET`. No era un secreto real, pero la compuerta actuó correctamente. Es el mismo tipo de error que en
   T2: el fixture debía componerse en tiempo de ejecución.
   - **Corrección:** el valor se compone en ejecución (`FAKE_VALUE`). Se revisaron los demás archivos nuevos de T3 en
     busca de literales similares: no había otros.
   - **Historial:** como gitleaks también analiza el historial, no bastaba un commit de corrección posterior. `6450f90`
     era local y nunca se publicó, así que se **enmendó**: el commit definitivo de T3 es **`02f2051`**. Antes de enmendar
     se ejecutó gitleaks sobre el árbol de trabajo (sin hallazgos) y, después, sobre el historial `1eba099..02f2051`
     (4 commits, sin hallazgos).
   - **Validación repetida sobre `02f2051`** (árbol limpio): CI quick PASS PARCIAL (11 compuertas PASS y 2 de BD
     SKIPPED por el perfil), gitleaks sobre 103 commits y sobre el árbol **sin hallazgos**, autoprueba 72/72, actionlint 0,
     `test:env` 54/54, configuración Edge 12/12, webhook 12/12, Edge 12/12 y prueba de humo en navegador (positiva y negativa) OK.
   - **Cambio de proceso:** desde T3, gitleaks se ejecuta **antes** de cada commit, no solo en la validación posterior.

## Requisito para cualquier despliegue futuro (acción del propietario, no ejecutada)
Antes de integrar este código en una rama que Vercel despliegue (Preview de esta rama o `main`), cada entorno de Vercel
que lo ejecute debe definir, además de lo que ya tenga:
- **Servidor:** `SUPABASE_URL` y `WOMPI_PUBLIC_KEY` (antes se tomaban de sus equivalentes `VITE_*`), junto con
  `SUPABASE_SERVICE_ROLE_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`, del mismo modo Wompi.
- **Cliente:** `VITE_WOMPI_ENV` (antes `sandbox` por defecto), coherente con `VITE_WOMPI_PUBLIC_KEY`.

Sin ellas, los endpoints responderán 500 y el frontend no arrancará. Ese es el comportamiento deseado (fallo rápido),
pero debe preverse. La Edge Function solo necesita `WOMPI_EVENTS_SECRET`; Supabase inyecta las otras dos.

## Limitaciones
- Las pruebas de T3 (`test:env`, `test-edge-config.ts`) aún no son un paso de CI: es T7. Los tests de webhook y Edge
  que ya estaban en CI sí cubren los handlers modificados.
- En el navegador, el fallo de configuración impide arrancar la aplicación, pero no muestra una página de error amigable.
- No se verificó en un despliegue real de Vercel ni de Supabase (fuera de alcance).

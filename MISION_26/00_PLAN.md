# M26 — Entornos aislados de desarrollo y QA (PLAN, en curso)

**Rama:** `mission/m26-dev-qa-environments` (desde 5550c17, M25). Si M25 recibe más commits, M26 se rebasa sobre la versión final.
**Estado:** planificación. M26 no está terminada.

## 1. Inspección (hechos verificados en el código)
| Hallazgo | Ubicación | Riesgo |
|---|---|---|
| Un único `.env.example`, sin separación de entornos; contiene valores de ejemplo con forma de secreto (`eyJ…tu_service_role_privada`, `test_integrity_…`) | `.env.example` | Confusión entre entornos; plantillas que parecen credenciales |
| El frontend no sabe en qué entorno corre (no hay `VITE_APP_ENV`) | `apps/web/src/config/supabase.js` | Un build de dev o QA podría apuntar a la URL de Production sin que nada lo detecte |
| Llave pública de Wompi con valor de respaldo fijo en el código | `apps/web/src/services/wompi.js:12` | Si falta la variable, el sistema no falla y se usa una llave no configurada |
| `VITE_WOMPI_ENV` con respaldo a `sandbox`, sin validar que la llave coincida con el modo | `wompi.js:13` | Llave `pub_prod_` con modo sandbox, o al revés |
| La API de Vercel y la Edge Function aceptan `VITE_SUPABASE_URL` o `SUPABASE_URL` indistintamente | `apps/web/api/wompi/*.js`, `supabase/functions/wompi-webhook/index.ts` | Variables de cliente usadas en el servidor; sin verificación del entorno |
| Hay seeds QA sintéticos (M24) pero no un procedimiento de reinicio de datos de QA | `supabase/seeds/` | Datos de QA no reproducibles |

## 2. Diseño
- **Matriz de entornos:** `local` (Supabase local en Docker y Wompi sandbox) · `qa` (proyecto Supabase de QA dedicado, Vercel Preview, Wompi sandbox) · `production` (**fuera del alcance de la fábrica**; el código solo lo reconoce para rechazarlo).
- **Lista de permitidos, no de prohibidos:** `config/environments.json` declara los hosts aceptados por entorno (local: `127.0.0.1` y `localhost`; qa: la referencia del proyecto QA, que la configura el propietario). Cualquier host no listado se rechaza. Así la fábrica nunca necesita conocer ni almacenar datos de Production.
- **Guarda del entorno (build y ejecución):** `VITE_APP_ENV ∈ {local, qa}` es obligatoria en todo build de la fábrica. El build falla si la URL de Supabase no está en la lista del entorno, si la llave de Wompi no es `pub_test_`, si `VITE_WOMPI_ENV ≠ sandbox` o si falta alguna variable (sin valores de respaldo).
- **Guarda en el servidor:** la API de Vercel y la Edge Function rechazan secretos de Wompi que no sean `test_`/`prod_test` según el entorno, y usan solo `SUPABASE_URL` en el servidor.
- **Plantillas:** `.env.local.example` (valores públicos del stack local) y `.env.qa.example` (solo nombres, sin valores). Se elimina cualquier valor con forma de secreto.
- **Generación del entorno local:** `scripts/env/gen_local_env.sh` lee `supabase status -o json` y escribe `apps/web/.env.local` (ignorado por git). Rechaza cualquier host que no sea de loopback.
- **Datos de QA:** seeds sintéticos versionados y un procedimiento de reinicio documentado. Ejecutarlo contra QA requiere autorización.
- **CI:** pruebas de la guarda (casos válidos e inválidos) como compuerta y controles nuevos en `gate_selftest.sh`.

## 3. Tareas
| # | Tarea | Local | Requiere autorización |
|---|---|---|---|
| T1 | `config/environments.json` + validador | Sí | — |
| T2 | Guarda de build (`scripts/env/check_env.mjs`, ejecutado antes de `vite build`) + pruebas | Sí | — |
| T3 | Guarda en la ejecución del frontend y del servidor (Vercel API, Edge) + pruebas | Sí | — |
| T4 | Plantillas `.env.*.example` sin valores con forma de secreto | Sí | — |
| T5 | `gen_local_env.sh` + prueba sobre el stack local | Sí | — |
| T6 | Procedimiento de reinicio de datos de QA (documentado y probado en local) | Sí | Ejecutarlo en QA: **sí** |
| T7 | Compuerta de CI y autoprueba | Sí | — |
| T8 | Guía del propietario: crear el proyecto QA, la referencia en la lista de permitidos, las variables de Vercel Preview y los secretos de sandbox | Documento | Crear y configurar QA: **sí (propietario)** |

## 4. Criterios de aceptación
1. Ningún build de la fábrica puede generarse con una URL fuera de la lista de su entorno (probado con casos negativos).
2. Sin llaves `pub_prod_` ni secretos `prod_` aceptados en local o QA (probado).
3. Sin valores de respaldo para variables de entorno críticas (probado).
4. `.env*` reales ignorados por git; plantillas sin valores con forma de secreto (gitleaks + revisión).
5. El entorno local se genera solo a partir del stack local y la aplicación arranca contra él (prueba de humo).
6. La CI completa en PASS sobre el commit final, con la autoprueba ampliada.
7. Revisión independiente sin hallazgos bloqueantes pendientes.
8. Ninguna operación remota realizada. QA queda documentado y listo para que el propietario lo cree.

## 5. Puntos de autorización (la fábrica se detiene aquí)
Crear el proyecto Supabase de QA · configurar variables en Vercel · aplicar migraciones o seeds en QA · cualquier credencial.

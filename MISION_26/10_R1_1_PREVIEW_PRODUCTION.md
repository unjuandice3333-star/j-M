# M26-R1.1 — Cierre de MAJ-2: separación estricta Local / QA / Preview / Production

**Estado:** cambios locales **sin commit**, pendientes de revisión del propietario (base `e42ecae`). Sin push, PR,
merge ni despliegue. Sin acceso a Vercel ni a Supabase QA/Production. Sin cambios en catálogo, checkout, contratos de
Wompi, POS ni migraciones. Sin dependencias nuevas.

## 1. Causa
`APP_ENV` y `VITE_APP_ENV` los escribe una persona. Hasta R1, ninguna capa contrastaba el entorno declarado con el
despliegue real: un Preview configurado con `production` arrancaba como Production. Además, con `APP_ENV=qa` el
servidor no aplicaba la lista de QA, y el build que ejecuta Vercel no tenía guarda.

## 2. Señales fiables del despliegue
| Señal | Quién la pone | Build | Ejecución (funciones) | Navegador | Edge (Supabase) |
|---|---|---|---|---|---|
| `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_GIT_COMMIT_REF` | Vercel (variables de sistema) | Sí | Sí, si está activada la exposición automática de variables de sistema | No: el build las incrusta (sin el nombre de la rama) | No existen |
| `SUPABASE_URL` | Supabase (inyectada en cada función) | — | — | — | Sí: identifica el proyecto |

No se ha podido comprobar contra Vercel desde la fábrica (sin acceso, por diseño). Si una señal falta, la regla falla cerrado.

## 3. Reglas (`apps/web/src/config/deployContext.js`)
| Contexto | Entornos admitidos |
|---|---|
| Sin señales (local, CI, builds de la fábrica, `check:qa`, `build:qa`) | `local`, `qa` |
| `VERCEL=1` sin `VERCEL_ENV` (exposición desactivada) | `local`, `qa`; **production rechazado** (no identificable) |
| `VERCEL_ENV=development` | `local`, `qa` |
| `VERCEL_ENV=preview` | **solo `qa`** |
| `VERCEL_ENV=production` | **solo `production`**; si existen, `VERCEL_TARGET_ENV=production` y rama `main` |
| `VERCEL_ENV` con otro valor | rechazado |

Más reglas de coherencia:
- `APP_ENV` ≠ `VITE_APP_ENV` → rechazado (build y servidor).
- `qa` exige un host de la lista de QA en el navegador, el servidor y la Edge Function.
- `production` exige https y rechaza los hosts de local o qa.
- En la Edge Function, `APP_ENV` debe coincidir con el proyecto que indica `SUPABASE_URL`.
- Valores normalizados (espacios y comillas emparejadas) antes de evaluar.

## 4. Dónde se aplica
| Capa | Archivo | Efecto |
|---|---|---|
| Build (incluido el de Vercel) | `apps/web/vite.config.js` (`deployGuard`) | El build **falla**: no se publica un bundle de Production en un Preview |
| Navegador | `clientConfig.js` + `runtimeConfig.js` (señales incrustadas con `define`) | `ConfigError`: la aplicación no arranca |
| Funciones de Vercel | `apps/web/api/_lib/serverConfig.js` | HTTP 500 genérico; el registro nombra solo variables |
| Edge Function | `supabase/functions/wompi-webhook/config.ts` | HTTP 500 genérico |

Lista de permitidos en ejecución:
- Se usan copias JSON generadas dentro de cada raíz desplegada: `apps/web/src/config/allowlist.generated.json` y `supabase/functions/wompi-webhook/allowlist.generated.json`.
- Se generan con `pnpm env:sync-allowlist`, a partir de `config/environments.json`.
- Una prueba de `test:env` hace fallar la CI si no coinciden.
- Son JSON, no JS, para que la regla 6 siga prohibiendo referencias de proyecto literales en el código.

## 5. Pruebas
| Suite | Qué demuestra |
|---|---|
| `scripts/env/r1_1_deploy_context.test.mjs` (16) | Los 10 escenarios del encargo en servidor, cliente y guarda de build; elusión con comillas, espacios, vacíos, mayúsculas y `VITE_VERCEL_ENV`; sin valores en los mensajes; sincronía de las copias |
| `scripts/env/deploy_build.test.mjs` (9, en `test:qa-build`) | `vite build` real con señales simuladas: Preview con Production, `VITE_APP_ENV=production`, `APP_ENV` contradictorio, sin `VITE_APP_ENV`, Production sin señales y Production desde otra rama → el build falla sin dejar bundle; Preview con QA, Production legítimo y local → se construyen |
| `apps/web/scripts/test-edge-config.ts` (+10) | Edge: qa solo en el proyecto QA; production nunca en QA/local/loopback/kong; comillas; sin valores en los mensajes |
| Autoprueba de la compuerta (+3 controles) | Desactivar la regla de Preview, la guarda de Vite o la sincronía de las copias hace fallar la CI |
| Navegador (Chromium, bundles reales) | Production legítimo: arranca. Local: arranca. Preview con QA (host QA real en una copia temporal de la lista): arranca. Preview con QA y la lista versionada vacía: `ConfigError`. Preview con Production: el build se rechaza |

## 6. Pruebas existentes adaptadas (justificación)
- **Positivos de Production** en `runtime_config.test.mjs` y `r1_regression.test.mjs`:
  - Antes, `production` se aceptaba sin contexto. Ahora declaran un despliegue Production identificado.
  - Cada uno añade el negativo: la misma configuración sin identificación **falla**.
  - Es más estricto, no más débil.
- **Suites de seguridad del webhook y de la Edge Function** (`test-webhook-security.mjs`, `test-edge-security.ts`):
  - Usaban `APP_ENV=qa` con el host ficticio `mock.supabase.co`, que la lista de QA rechaza ahora con razón.
  - Pasan al perfil local (loopback, Wompi sandbox). Prueban la firma y la idempotencia, no la selección de entorno.
  - Mismos 12/12 escenarios.
- **`check:qa`** (`qa_config.mjs`): pasa al servidor la lista de la configuración validada (versionada o `--config`), coherente con el resto de la verificación.

## 7. Limitaciones
- **Comportamiento real de Vercel no verificado.** La disponibilidad de las señales de Vercel no se ha comprobado (sin acceso). Si la exposición de variables de sistema está desactivada, Production falla cerrado. Por eso la declaración de MAJ-5 (`config/production_readiness.json`) incluye ahora `VERCEL_ENV` (destino `vercel_platform`).
- **`VERCEL_ENV` puesta a mano.** Un administrador del proyecto de Vercel que definiera a mano `VERCEL_ENV=production` en Preview anularía la señal principal. Siguen aplicando la rama (`main`) y `VERCEL_TARGET_ENV` cuando existen. La protección es contra errores de configuración, no contra un administrador malintencionado.
- **Promoción y reversión.** «Promote to Production» de un despliegue Preview y «Instant Rollback» reutilizan o reconstruyen builds según la configuración de Vercel:
  - Un bundle construido como Preview lleva incrustado `preview`: en Production solo funcionará si declara `qa`, y la lista impedirá que use Production.
  - Hay que verificarlo en el primer despliegue real.
- **Edge Function.** Sin señales de plataforma de Supabase más allá de `SUPABASE_URL`. Production se reconoce por exclusión (un proyecto que no es local ni QA), por decisión del propietario de no versionar la referencia de Production.
- **Wompi en Production.** No se exige un modo de Wompi concreto en Production (decisión de negocio del propietario).

# M26-R1 — Corrección de los hallazgos de la revisión independiente de M26

**Estado:** R1 ejecutada en local sobre `mission/m26-dev-qa-environments` (base `3992575`). **Pendiente de la revisión
del propietario. M26 no se declara cerrada.** Sin push, PR, merge ni despliegue. Sin conexión a Supabase remoto ni a
Vercel. No se tocó Production ni el proyecto QA `yomgxdjgfjnrjaqiarvw`. No se modificaron los contratos funcionales de
catálogo, checkout ni POS.

## 1. Commits de R1
| Commit | Contenido |
|---|---|
| `5b6235b` | MAJ-1, MAJ-2 (código), MAJ-3, MIN-2, MIN-4 |
| `c94ed00` | MAJ-4, INF-3 (y un literal de la regla 6 en un título de prueba de `5b6235b`) |
| `32b05ed` | MAJ-5, MIN-1, MIN-3, MIN-5, MIN-6 y documentación de MAJ-2 |
| (commit siguiente) | Este documento |

## 2. Disposición de cada hallazgo
| ID | Estado | Qué se hizo | Pruebas de regresión |
|---|---|---|---|
| MAJ-1 | **Corregido** | `parseEnv` normaliza como dotenv (`export`, comillas `"`/`'`/`` ` `` emparejadas, `\n` en dobles, comentario en línea sin comillas); comillas sin cerrar o texto tras la comilla de cierre son errores, y `check:qa`/`build:qa` los tratan como errores. `verifyQaBundle` detecta `sb_secret_` y exige que la URL incrustada sea la del proyecto QA validado. `build:qa` incrusta la misma configuración que validó `check:qa` | `r1_regression.test.mjs` (MAJ-1: anon de otro proyecto, `service_role` y `sb_secret_` entre comillas dobles y simples → INVÁLIDO; todo entrecomillado válido → VÁLIDO; comilla sin cerrar → INVÁLIDO; `sb_secret_` en el bundle) y 3 pruebas nuevas en `qa_build.test.mjs` |
| MAJ-2 | **Corregido** | `APP_ENV` obligatorio en servidor (Vercel) y Edge; con `local`/`qa` se rechazan `pub_prod_` y `prod_*`; `local` exige loopback y `qa` https no loopback. El cliente exige `VITE_APP_ENV` y, con `local`/`qa`, comprueba en el navegador la lista de `config/environments.json` incrustada en el build (`runtimeConfig.js`). Documentación corregida (`00` §2, `01` riesgos y criterio 9, `03` requisitos, tabla de criterios en `08` §7) | 15 pruebas MAJ-2 en `r1_regression.test.mjs`; `runtime_config.test.mjs` 17/17; Edge config 20/20. Verificación en Chromium: build QA con la lista vacía (como un build de Vercel sin guarda) → `ConfigError`, no arranca; con el host QA en la lista → arranca |
| MAJ-3 | **Corregido** | Las pruebas usan fixtures explícitos (`test_fixtures.mjs`: lista QA vacía o con el host real), no el archivo versionado | Ejecutadas con la lista versionada vacía **y** en una copia temporal con `yomgxdjgfjnrjaqiarvw.supabase.co` añadido (§3) |
| MAJ-4 | **Corregido** | Guías `06` §3–4 y `08` §2 reescritas para el QA existente: Fase A obligatoria (copia `db dump` de esquema/datos/roles fuera del repositorio, inventario, `migration list` frente al repositorio, versión de PostgreSQL), `db push` no destructivo preferente, `db reset` solo con Fase C (copia comprobada, inventario, decisión escrita, referencia releída), siempre `--remote=yomgxdjgfjnrjaqiarvw` (sintaxis de CLI 3.0.0 comprobada), nunca `link`/`--linked`. Seeds sin contraseña utilizable; `http_checks.py` fija una contraseña aleatoria por ejecución con la API admin local. Contraseña antigua retirada de los documentos y evidencias de M24, declarada comprometida (sigue en el historial publicado) con instrucción de rotación. `verify_jwt = false` versionado para `wompi-webhook`. Nota de sustitución en `M24A` §5.2 | 4 pruebas MAJ-4 en `r1_regression.test.mjs` (verificado que fallan con los archivos anteriores); etapa 31: control nuevo «usuario seed sin contraseña conocida» y 44/44 |
| MAJ-5 | **Corregido (control en el repositorio)** | `config/production_readiness.json` (solo nombres, nunca valores) + `scripts/release/production_readiness.mjs`. La lista exigida se deriva del código (11 variables de Vercel, 2 secretos de la Edge, `APP_ENV`/`VITE_APP_ENV` = `production`). Paso `03_production_readiness`: en toda rama comprueba que la declaración está sincronizada con el código; hacia `main` exige además la confirmación del propietario (autor, fecha, huella vigente). Hoy **no está confirmada**: cualquier PR a `main` queda bloqueado hasta que el propietario configure Production y confirme. La fábrica no consulta ni modifica Vercel | `production_readiness.test.mjs` 10/10; autoprueba de la compuerta: 6 controles nuevos |
| MIN-1 | **Corregido** | El control del paso 18 comprueba con `awk -F '\t'` que **ese** paso está en FAIL; si no, el control da NO BLOQUEÓ | Autoprueba |
| MIN-2 | **Corregido** | `build:qa` borra `dist-qa` si la verificación del bundle falla | `qa_build.test.mjs` |
| MIN-3 | **Corregido** | `smoke:env-local` y `qa:rehearse-reset` abortan (exit 2) si el stack local ya está en marcha; `smoke`, si `apps/web/dist` existe | Ejecución negativa manual (§3) |
| MIN-4 | **Corregido** | Mismo criterio de origen (sin credenciales, ruta, consulta ni fragmento) en cliente, servidor y Edge; `clean()` solo quita comillas envolventes emparejadas | `r1_regression`, Edge config |
| MIN-5 | **Corregido (documentación)** | INC-M26-01 redescrita: el catálogo cae en silencio a datos simulados; el código consulta 2 tablas y 6 RPC que no existen en la línea base. La incidencia sigue abierta por decisión del propietario | — |
| MIN-6 | **Corregido** | La guía usa `node scripts/env/environments.mjs validate-config` | — |
| INF-1 | Sin cambios | Decisión del propietario: sin lista de hosts prohibidos | — |
| INF-2 | Sin cambios | R-PREVIEW sigue pendiente (decisión del propietario) | — |
| INF-3 | **Corregido** | `verify_jwt = false` en `supabase/config.toml` y documentado; la versión de PostgreSQL se comprueba en la Fase A | — |

## 3. Validación
Resultados detallados en el informe final de R1 (entregado al propietario), sobre el commit de este documento con el
árbol limpio. Incidencias del proceso de validación:
- La primera ejecución de la CI completa (sobre el commit previo a reescribir los mensajes) detectó que **dos asuntos de
  commit de R1 superaban 100 caracteres** (`02_commit_messages`). Los commits eran locales y no publicados: se
  reescribieron solo los mensajes (árbol idéntico, comprobado) y se conserva la rama local `r1-prereword` como respaldo.
- En esa misma ejecución, `21_secrets_scan` y `30_db_local_pg16` fallaron porque se pasó `CI_OUT` fuera del repositorio
  (el contenedor de gitleaks y el usuario `postgres` no pueden escribir allí); los escaneos no encontraron secretos.
  Se repitió con la carpeta por defecto.

## 4. Hallazgos o limitaciones no resueltos
- **Contraseña antigua en el historial publicado:** sigue en commits de `db/baseline-m24b` y `mission/m25-ci-governance`
  ya publicados. Reescribir ese historial publicado no está autorizado; se trata como comprometida y la guía exige
  rotarla en QA si se cargó alguna vez. **Acción del propietario.**
- **MAJ-5 depende del propietario:** el control impide integrar en `main` sin confirmación, pero la confirmación es una
  declaración; la fábrica no puede verificar Vercel ni Supabase Production. La sugerencia de la revisión de mostrar una
  página de error en lugar de una pantalla en blanco no se implementó (cambio de interfaz fuera del alcance de R1).
- **Builds de Vercel con `production`:** un Preview configurado expresamente con `VITE_APP_ENV=production`/`APP_ENV=production`
  no se restringe (Production queda fuera de la lista por diseño). Depende de R-PREVIEW (pendiente).
- **Evidencias de M24 redactadas:** `MISION_24D/evidencias/m24d_changes.patch` y los scripts de evidencia ya no
  reproducen literalmente lo ejecutado en M24 (la contraseña se sustituyó por un marcador).
- **INC-M26-01** sigue abierta (tarea funcional posterior).
- `FACTORY/MASTER_PLAN.md` y `FACTORY/MISSION_REGISTRY.md` aún describen QA como «por crear»; se actualizarán al cerrar M26.

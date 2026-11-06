# M26 — T4: plantillas de entorno sin valores con forma de secreto

**Estado:** T4 ejecutada en local, pendiente de revisión. M26 sigue EN CURSO (faltan T5–T8). Sin publicar, sin cambios
en Vercel ni operaciones remotas.

## Qué pedía el plan y cómo se cumple
> T4 — Plantillas `.env.*.example` sin valores con forma de secreto: `.env.local.example` (valores públicos del stack
> local) y `.env.qa.example` (solo nombres, sin valores). Se elimina cualquier valor con forma de secreto.

| Plantilla | Contenido |
|---|---|
| `config/env/local.env.example` | Valores **públicos** del stack local (`VITE_APP_ENV=local`, `VITE_WOMPI_ENV=sandbox` y las dos URL `http://127.0.0.1:54321`). Las llaves y los secretos van **vacíos**, con comentarios que indican de dónde se obtienen (`supabase status` y el panel sandbox de Wompi) |
| `config/env/qa.env.example` | **Solo nombres**, ningún valor. Los comentarios describen la *forma* esperada de cada valor y recuerdan añadir el host QA a la lista de permitidos |
| `.env.example` (heredado) | Reescrito como índice **solo de nombres**. Se eliminaron los valores con forma de secreto (`eyJ…`, `test_integrity_…`, `test_events_…`, `pub_test_…`, `G-XXXX…`) y remite a las plantillas anteriores |

### Desviación justificada respecto a los nombres del plan
El plan nombraba `.env.local.example` y `.env.qa.example` en la raíz. Tres mecanismos existentes tratan cualquier
archivo `.env*` como secreto:
1. `.gitignore` (`.env*`): no se versionarían;
2. la compuerta de commits de M25 (solo admite exactamente `.env.example`);
3. las reglas de denegación de los agentes (`Read(./.env.*)`): los agentes no podrían leer las plantillas.

Usar esos nombres obligaba a debilitar las tres protecciones. Las plantillas se ubican en `config/env/`, junto a
`local-ci.env` (T2). **El contenido y el propósito son los del plan;** solo cambia la ubicación y el nombre.

### Variables documentadas: las que exige el código
El conjunto de variables se **deriva del código** (`REQUIRED_VARS` de la guarda de build T2 y `SERVER_VARS` de la
configuración de servidor T3): 10 variables. El `.env.example` anterior estaba desactualizado:
- faltaban `VITE_APP_ENV`, `VITE_WOMPI_ENV`, `SUPABASE_URL` y `WOMPI_PUBLIC_KEY` (exigidas desde T2/T3);
- sobraban `VITE_GA4_TRACKING_ID` y `VITE_META_PIXEL_ID`, que **ningún código lee**. Se retiraron. Si se implementa
  analítica, el código que las use deberá declararlas y las plantillas se actualizarán.

## Verificador
`scripts/env/templates.mjs` (`pnpm check:templates`) comprueba en las tres plantillas:
- que contengan exactamente las variables que exige el código (ni faltan, ni sobran, ni se duplican);
- que no haya ningún valor bajo nombres de llave o secreto, ni valores con forma de JWT, llave de Supabase o Wompi,
  secreto de Wompi, host de un proyecto Supabase o cadena aleatoria larga, bajo cualquier nombre;
- QA y el índice: ningún valor; local: exactamente los valores públicos del stack local.
Los mensajes nunca muestran valores.

## Archivos
| Archivo | Tipo |
|---|---|
| `config/env/local.env.example`, `config/env/qa.env.example` | Nuevos |
| `.env.example` | Reescrito (solo nombres) |
| `scripts/env/templates.mjs`, `scripts/env/templates.test.mjs` | Nuevos: verificador (CLI `check`) y 12 pruebas |
| `package.json` | `test:env` incluye las pruebas de T4; nuevo `check:templates` |

## Resultados
| Prueba | Resultado |
|---|---|
| `node --test scripts/env/templates.test.mjs` | 12/12 (4 positivas, 7 negativas, 1 de filtración, CLI) |
| Integración con las guardas: plantilla local + llaves de prueba | Pasa la guarda de build (T2) y la de servidor (T3) |
| Plantilla local sola / plantilla QA | Bloqueadas por las guardas (sin valores por defecto; QA sin host permitido) |
| Versionabilidad | Las plantillas no las ignora git ni las rechaza la compuerta de commits (comprobado contra el patrón real de `check_commits.sh`) |
| Mutaciones del verificador (valores bajo nombres de secreto · sin sincronía con el código · valores en QA) | Las 3 se detectan |
| `pnpm test:env` completo, CI quick, autoprueba, actionlint y gitleaks sobre el commit de T4 | ver el informe de T4 |

## Limitaciones
- `pnpm check:templates` y `pnpm test:env` aún no son pasos de CI (T7).
- Las plantillas documentan cómo rellenar el entorno local, pero no lo generan: eso es T5 (`gen_local_env.sh`).
- El índice `.env.example` se conserva por compatibilidad con referencias existentes (p. ej. `CONTRIBUTING.md`).

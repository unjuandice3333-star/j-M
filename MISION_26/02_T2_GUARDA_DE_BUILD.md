# M26 — T2: guarda de build

**Estado:** T2 ejecutada en local, pendiente de revisión del propietario. M26 sigue EN CURSO (faltan T3–T8).

## Qué hace
`scripts/env/check_env.mjs` se ejecuta **antes de `vite build`** en las builds de la fábrica y bloquea la build si el
entorno no está permitido. Evalúa exactamente las variables que verá Vite: usa `loadEnv` del propio Vite (archivos
`apps/web/.env*` del modo y entorno del proceso, con la misma prioridad).

| Variable | Regla |
|---|---|
| `VITE_APP_ENV` | Obligatoria: `local` o `qa`. `production` u otro valor bloquea |
| `VITE_SUPABASE_URL` | Obligatoria y en la lista de permitidos del entorno (T1); solo el origen, sin credenciales |
| `VITE_SUPABASE_ANON_KEY` | Obligatoria; nunca `sb_secret_…` ni un JWT con rol distinto de `anon` |
| `VITE_WOMPI_PUBLIC_KEY` | Obligatoria y `pub_test_…` |
| `VITE_WOMPI_ENV` | Obligatoria y `sandbox` |
| Cualquier `VITE_*` con nombre de secreto de servidor | Bloquea (SERVICE_ROLE, SECRET, INTEGRITY, EVENTS, PRIVATE, PASSWORD) |

No hay valores por defecto. Los mensajes nombran variables, nunca muestran valores.

## Dónde se aplica (decisión de alcance)
| Build | ¿Guarda? | Motivo |
|---|---|---|
| `scripts/ci/build.sh` (CI local y GitHub, agentes) | **Sí**, con el entorno explícito `config/env/local-ci.env` (o `FACTORY_ENV_FILE`) | Es la build de la fábrica |
| `pnpm build:factory` (raíz) | **Sí** | Build manual de la fábrica con el entorno del desarrollador |
| `pnpm --filter @jm/web build` (lo que ejecuta Vercel) | **No** | Cambiarlo alteraría Preview y Production de Vercel sin autorización; Production solo conoce sus propias variables y quedaría bloqueada |

`config/env/local-ci.env` contiene valores **públicos y ficticios** (URL de loopback del stack local y marcadores
`ci-placeholder…`, `pub_test_ci_placeholder`). No son credenciales y no autentican contra nada.

## Archivos
| Archivo | Cambio |
|---|---|
| `scripts/env/check_env.mjs` | Nuevo: `checkEnv(vars, cfg)` (pura), `loadViteEnv` (entrada ESM de Vite) y CLI (exit 0/1/2) |
| `scripts/env/check_env.test.mjs` | Nuevo: 18 pruebas (3 positivas, 8 negativas con múltiples casos, 1 de filtración y 6 de CLI real) |
| `config/env/local-ci.env` | Nuevo: entorno público de build de la fábrica |
| `scripts/ci/build.sh` | Carga el entorno de la fábrica y ejecuta la guarda antes de Vite. Además, un mensaje corregido: si gitleaks no puede ejecutarse, ahora lo dice (exit 2) en vez de informar "secretos detectados" |
| `package.json` | Scripts `check:env`, `build:factory` y `test:env` |

## Resultados
| Prueba | Resultado |
|---|---|
| `node --test` (T1 + T2) | 37/37 |
| Mutaciones de la guarda (aceptar production · service_role como anon · valor por defecto de VITE_WOMPI_ENV) | Las 3 se detectan (1, 1 y 2 pruebas fallan) |
| `build.sh` con el entorno de la fábrica | PASS; la URL local llega al bundle |
| `build.sh` con `VITE_APP_ENV=production` | BLOQUEADO antes de Vite (no se ejecuta `vite build` ni se genera `dist/`) |
| CI quick sobre el commit de T2 y autoprueba de compuertas | ver el informe de T2 |

## Incidencias durante T2
- La primera versión cargaba la entrada CJS de Vite (obsoleta, sin `loadEnv` como export ESM): falló en las pruebas de CLI y se corrigió resolviendo la entrada ESM declarada en `exports`.
- Una prueba suponía que un directorio dentro de `apps/web` no resolvería `vite`; Node sube por los directorios y sí lo resuelve. La prueba se movió a un directorio fuera del repositorio.
- El demonio Docker de la sesión se había detenido y se reinició (no es infraestructura nueva). Ese episodio reveló el mensaje engañoso de `build.sh`, ya corregido.

## Pendiente (siguientes tareas del plan, sin cambio de alcance)
- T3: guardas en la ejecución (frontend, `apps/web/api`, Edge Function): una sola variable de servidor (`SUPABASE_URL`) y sin valores por defecto (`wompi.js`).
- T7: las pruebas `scripts/env/*.test.mjs` aún no son un paso de CI (hoy: `pnpm test:env`).

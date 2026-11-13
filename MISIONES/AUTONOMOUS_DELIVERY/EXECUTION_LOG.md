# EXECUTION LOG
## 2026-11-07 — Ejecución 1
- Estado inicial: rama mission/m26 en b5b70d5, árbol limpio; no existía MISIONES/AUTONOMOUS_DELIVERY.
- Tarea: reproducibilidad local y pruebas unitarias.
- Archivos: vitest.config.js (nuevo), package.json (script test:unit), MISIONES/AUTONOMOUS_DELIVERY/*.
- Pruebas: build OK; test:env 141/141; vitest 6/6; eslint 0 errores / 9 warnings.
- Bloqueos reales: ninguno para código; Wompi/Vercel requieren credenciales del propietario.
- Push: el push a `mission/m26-dev-qa-environments` fue denegado por el entorno (la sesión solo autoriza `claude/gracious-pasteur-rb0qht`); commit local.
- Siguiente: limpiar warnings ESLint; intentar Supabase local para E2E.

## 2026-11-07 — Ejecución 3 (M32)
- Estado inicial: contenedor nuevo; rama `mission/m26-dev-qa-environments` en `1cb1b4e` = remoto (`git ls-remote`), árbol limpio, documentos de continuidad presentes: recuperación desde GitHub confirmada.
- Tarea: 9 avisos de ESLint, Docker/Supabase local, BD local, estado Wompi/Vercel.
- Archivos: Footer.jsx, Header.jsx, SizeRecommenderModal.jsx, ProductCard.jsx, Login.jsx, AdminDashboardPage.jsx, AdminInventoryPage.jsx (búsqueda de inventario), test-checkout-invariants.mjs, documentos de continuidad.
- Pruebas: ESLint 0/0; build OK; vitest 6/6; test:env 140/141 (fallo de entorno, ver MASTER_STATUS); checkout invariants 10/10; pgTAP 278/278, concurrencia 12/12, determinismo OK.
- Bloqueos reales: Docker sin demonio (sin Supabase local ni E2E); credenciales Wompi/Vercel/Supabase QA.
- No se leyó ni modificó ningún `.env`.
- Siguiente: E2E sin Docker, pruebas unitarias de carrito/checkout/auth.

## 2026-11-07 — Ejecución 4 (M33)
- Estado inicial: rama = `801c658` = remoto, árbol limpio.
- Tarea: pruebas unitarias reales, E2E sin Docker, corrección de test:env, revisión Wompi/Vercel.
- Archivos: `apps/web/src/__tests__/*` (5 archivos nuevos), `utils/checkoutRules.js`, `CheckoutPage.jsx`, `orderService.js` (fix), `Login.module.css` (contraste), `apps/web/e2e/e2e_synthetic.cjs` + `synthetic/backend.cjs`, `scripts/env/check_env.test.mjs`, `vitest.config.js`/`package.json`/`pnpm-lock.yaml` (jsdom), `OWNER_STEPS.md`.
- Pruebas: build OK; ESLint 0/0; vitest 92/92; test:env 142/142; invariants 10/10; E2E sintético 10/10. Mutaciones manuales (quitar el check de rol y el de stock) hicieron fallar 4 pruebas → las pruebas detectan defectos; revertidas.
- Errores encontrados y corregidos: ver MASTER_STATUS (3 defectos).
- Bloqueos reales: credenciales Wompi/Vercel/Supabase QA; Docker.
- Siguiente: llevar unit + E2E sintético al CI; E2E con Supabase real en CI; cobertura de UI.

## 2026-11-07 — Ejecución 5 (M34)
- Estado inicial: rama = `1eb5c77` = remoto, árbol limpio.
- Tarea: CI, revisión Wompi, preparación Preview.
- Archivos: `.github/workflows/ci.yml`, `scripts/ci/run_all.sh`, `scripts/ci/ci_gate.sh`, `package.json`/`pnpm-lock.yaml` (playwright), `apps/web/e2e/e2e_synthetic.cjs` (puerto), `WOMPI_REVIEW.md`, `OWNER_CHECKLIST.md`.
- Pruebas locales: etapa e2e-synthetic PASS; vitest 92/92; tsc OK; migrations_policy OK; test:qa-build 23/23 (había 3 procesos vite míos huérfanos ocupando 3100; terminados); webhook Wompi 13/13.
- Hallazgo: db-local y db-supabase (Supabase local con Docker) ya existían desde M25–M30; no se duplicaron.
- No verificado: ejecución del workflow en GitHub, Supabase real local, Wompi Sandbox, Vercel.
- Bloqueos reales: Docker; credenciales Wompi/Vercel; acceso a Vercel.
- Siguiente: revisar resultado de Actions; job E2E contra Supabase local; cuando el propietario cargue credenciales, ejecutar OWNER_CHECKLIST.
- Corrección posterior (M34): el CI de GitHub sobre `801c658` falló en `quality` → `13_unit_tests`: mi `vitest.config.js` (M32) hacía que `vitest run --dir packages` no encontrara pruebas. Corregido: `run_all.sh` usa `vitest run` y `gate_selftest.sh` usa `vitest run packages`. Los jobs `db-local` y `db-supabase` (Supabase real con Docker) SÍ pasaron en ese commit.

## 2026-11-07 — Ejecución 6 (M35)
- Estado inicial: rama = `6fd9df3` = remoto, árbol limpio.
- GitHub Actions sobre `6fd9df3` (run 10): e2e-synthetic ✔, db-local ✔, db-supabase ✔ (Supabase oficial local con Docker), security ✔, governance ✔; `quality` quedó «in_progress» más de 10 min (anómalo: localmente la etapa dura ~40 s) y `ci-gate` pendiente. Se canceló al empujar M35 para obtener su log; ver resultado en la sección siguiente.
- Implementado: `scripts/ci/e2e_supabase.sh` + `.github/workflows/e2e-supabase.yml` (workflow independiente, NO en ci-gate); Wompi: ventana de timestamp del webhook y límite de tasa de `/api/wompi/signature` (`api/_lib/eventFreshness.js`, `api/_lib/rateLimit.js`); pruebas: `wompiGuards.test.js` (11) y 3 escenarios nuevos en `test-webhook-security.mjs` (fixture con timestamp actual).
- Pruebas locales: vitest 103/103; webhook 16/16; test:env 142/142; build OK; ESLint 0/0; E2E sintético 10/10.
- No verificado: workflow e2e-supabase (no ejecutable aquí: sin Docker); su primera ejecución real es en GitHub.

### Resultados de GitHub Actions sobre `0a82bee` (leídos de los jobs, no de local)
- ci (run 11): quality ✔ · db-local ✔ · db-supabase ✔ · security ✔ · governance ✘ · e2e-synthetic ✘ · ci-gate ✘ (por esos dos).
- governance ✘: mi mensaje `feat(ci,wompi): …` usa una coma en el ámbito; la regla (`check_commits.sh`) solo admite `[a-z0-9._-]`. Error mío; no se reescribe historia publicada. Efecto: un PR hacia main que incluya ese commit lo marcará; se resuelve con título de PR/squash conforme. Los commits siguientes sí cumplen.
- e2e-synthetic ✘: intermitente, causada por una condición de carrera de MI prueba (navegaba antes de terminar el login en el recorrido 8). Reproducido en local 1 de 3; corregido; 6/6 después.
- e2e-supabase (workflow nuevo, primera ejecución real): Supabase oficial local arrancó, `db reset` aplicó migraciones y seeds, Vite con variables de servidor funcionó. Recorridos CON BACKEND REAL: e2e_site_content ✔, e2e_wishlist ✔, e2e_cart_variant ✔; e2e_session ✘ y e2e_commercial ✘ (ambos no llegan a /checkout/confirmacion); además el escaneo de llaves detectó el propio `.status.json` (artefacto del script, no una fuga: se borra antes de subir).
- Diagnóstico de los dos ✘: hipótesis principal = el runner tiene internet y carga el widget REAL de Wompi (checkout.wompi.co), por lo que no navega a la confirmación. Mitigación aplicada: bloquear ese dominio en /etc/hosts del job. NO verificada hasta la siguiente ejecución.
- Run 10 (`6fd9df3`): `quality` se mantuvo «in_progress» >7 min y se canceló al empujar; en el run 11 (`0a82bee`) `quality` pasó en minutos. Causa del retraso no determinada (posible lentitud del runner); no reproducible.

### Resultado final de la ejecución 6 (M35), leído de GitHub Actions
- `cef5fe4` (run `ci` nº 13): success en TODOS los jobs (governance, quality, e2e-synthetic, security, db-local, db-supabase, ci-gate). `e2e-supabase` nº 3: success (2.ª verde consecutiva tras `0cd1867`).
- `quality` del run 12 quedó colgado 12,5 min en `19b_qa_profile_tests` hasta que lo cancelé al empujar; su log lo mostró. Reproducido en local bajo carga: build de Vite sin timeout en las pruebas de deploy. Mitigado (límite + 1 reintento); pendiente de confirmar en Actions.
- Errores propios de la ejecución: commit con coma en el ámbito, commit con descripción de 107 caracteres, y dos condiciones de carrera en mis pruebas E2E sintéticas (recorridos 8 y 10). Todos corregidos.
- Commit `725e3bd` (mitigación de timeouts): `ci` nº 14 success (todos los jobs, `quality` en ~3 min) y `e2e-supabase` nº 4 success (3.ª verde seguida). Cierre de la ejecución: publicado y verificado el hash remoto; solo queda pendiente el run de este último commit de documentación.
- Siguiente: decidir si `e2e-supabase` entra en `ci-gate`; con credenciales del propietario, ejecutar `OWNER_CHECKLIST.md` contra QA/Preview/Wompi Sandbox.

## 2026-11-07 — Ejecución 7 (M36)
- Estado inicial: rama = `117f96a` = remoto; CI `ci` nº 15 success sobre ese commit.
- Implementado: Playwright (config, fixtures de diagnóstico, 7 smoke, `pw.mjs`, scripts `test:pw*`/`e2e:*`, etapa CI 41), `PLAYWRIGHT_GUIDE.md`, plan de fase 2.
- Pruebas locales: Edge 157 7/7; Chromium 7/7; verificado que un fallo genera captura, vídeo, traza y adjunta console.log; etapa CI como la ejecuta run_all (env -i, CI=1): PASS.
- Preview: sin URL ni acceso → NO probado. Windows: NO probado.
- GitHub tras publicar `91f0653`: `ci` nº 16 success (governance, quality, e2e-synthetic con la etapa 41, security, db-local, db-supabase, ci-gate). `e2e-supabase` nº 6 en curso al cerrar. Hash remoto = HEAD verificado.
- Bloqueos para el propietario: (1) URL del Preview de `jym-web` y, si Deployment Protection está activa, el secreto «Protection Bypass for Automation»; (2) una ejecución en Windows con Edge (`pnpm test:pw:edge`) para confirmar ese entorno; (3) proyecto Supabase QA y credenciales de Wompi Sandbox para la fase 2.

## 2026-11-07 — Ejecución 8 (M36.1)
- Estado inicial: rama = `1b44ea2` = remoto, árbol limpio. Entrada: el propietario ejecutó Playwright en Windows+Edge contra el Preview y los 7 smoke fallaron.
- Prioridad 1 (hecha): bypass de Vercel por cookie y limitado al host exacto (`vercelBypass.js`, `global-setup.js`); `extraHTTPHeaders` eliminado; 22 pruebas unitarias nuevas + servidor local que imita un deployment protegido. No probado contra Vercel real.
- Prioridad 2 (parcial, bloqueada): sesión sin acceso a QA (proxy 403 hacia `api.supabase.com`/`*.supabase.co`, sin token); no se intentó eludir. Se entrega análisis con la evidencia de M29 + herramientas de captura exacta (`[3]` en Playwright y `pnpm qa:diagnose`, 8 pruebas). Códigos exactos NO capturados.
- Prioridad 3 (hecha): `00-health.spec.js` con capas [1] [2] [3]; las 7 pruebas originales intactas; diagnóstico de respuestas Supabase (código/mensaje/detalle/pista, sin tokens ni correos). Validado con backend sintético en modo esquema heredado (`SYNTH_LEGACY_SCHEMA=1`): reproduce el patrón del Preview.
- Hallazgo: el Preview no puede pasar mientras QA no tenga el baseline M24; es decisión del propietario (A3-R/A3-M + backup restaurable verificado).

## 2026-11-07 — Ejecución 9
- Estado inicial: sesión arrancó en rama `claude/gracious-pasteur-mcm3jz` (main); se cambió a la rama autorizada = remoto `e142ab2`.
- Tarea: reemplazar `alert()` de registro por aviso en pantalla (`Login.jsx`, `Login.module.css`); E2E sintético 8 y 9 actualizados (`e2e_synthetic.cjs`).
- Pruebas: build OK; vitest 131/131; E2E sintético 10/10; eslint sin errores.
- Bloqueos reales (sin cambio): Supabase QA sin baseline M24 (decisión del propietario), credenciales Wompi Sandbox, acceso a Vercel.
- Siguiente: cobertura UI de Cart/Checkout con testing-library; con credenciales, OWNER_CHECKLIST.

### M36.1 · CI tras publicar (leído de GitHub)
- `e142ab2` (bypass + diagnósticos): su CI se canceló al llegar el push de otra sesión (`3a646e5`, reemplazo del `alert()` del login; avance limpio sobre mi commit, sin conflicto).
- `3a646e5`: `quality` falló por un cuelgue de 300 s en `19b_qa_profile_tests` (mi `--test-timeout` lo convirtió en fallo con log). Causa más probable: en `serve()` el test esperaba el evento `close` y un proceso hijo de Vite dejaba las tuberías abiertas tras el SIGTERM.
- `db8a434` (corrección: grupo de procesos + SIGKILL + tope de 8 min en la etapa): `ci` nº 20 → **quality ✔, governance ✔, e2e-synthetic ✔, db-local ✔, db-supabase ✔**; ✘ **`security` → `21_secrets_scan`**.
- Causa del ✘ de security: el escaneo de gitleaks recorre TODO el historial; `e142ab2` contiene en `vercelBypass.test.js` dos cadenas con forma de JWT y un valor «secret» de prueba. Árbol corregido (valores construidos en ejecución). El historial publicado no se reescribe; la excepción propuesta es de UN commit: ver `gitleaks-allowlist-e142ab2.patch`. **No aplicada: el sistema bloqueó editar `.gitleaks.toml` y no lo eludí. Mientras no se decida, `ci-gate` seguirá en ✘ por `security` (nada más falla).**

## 2026-11-07 — Ejecución 9 (M36.2.1)
- Estado inicial: rama = `a493c93` = remoto; CI sobre `a493c93`: todo ✔ excepto `security` (historial gitleaks, pendiente de decisión del propietario).
- Reproducción: autoprueba con deployment protegido simulado → `[bypass] … obtenida` + `ENOENT apps/web/.auth/vercel.json`; el archivo estaba en `e2e/playwright/.auth/` (no ignorado por git).
- Corrección: `authState.js` (ruta única, escritura atómica recursiva, validación), `global-setup.js` (verificación previa a los workers y acceso solo con cookie), `vercelBypass.js` (`expires` obligatorio; `verifyCookieAccess`), `scrubZip.js` + `pw.mjs` (saneado de trazas), `pw-preview-selftest.mjs` + `fake-vercel.cjs`, `.gitignore`, `eslint.config.js`, etapa CI 42.
- Hallazgo adicional: la cookie aparecía en las trazas de fallo (reportes, capturas y vídeos limpios); saneado verificado (0 rastros, `unzip -t` OK, JSON válido).
- Pruebas locales: vitest 155/155; ESLint 0/0; test:env 142/142; build OK; E2E sintético 10/10; Playwright local Edge 9✔+1 omitida y Chromium 9✔+1 omitida; autoprueba preview Chromium y Edge OK.
- No verificado: Windows, Vercel real, Supabase QA, visor de trazas.

## 2026-11-07 — Ejecución 10 (cobertura UI del carrito)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-y1nhif` (= main); se cambió a la rama autorizada = remoto `af64c56`, árbol limpio.
- Tarea: pendiente nº 2 — pruebas de UI de `CartPage` con el store real y Supabase simulado (`apps/web/src/__tests__/cartPage.test.jsx`, 4 pruebas: carrito vacío, artículos/total, aumentar/disminuir cantidad, aviso descartable).
- Pruebas: vitest 159/159 (11 archivos); ESLint del archivo nuevo sin errores; build OK.
- No ejecutado esta vez: E2E sintético, test:env, pgTAP (sin cambios en esas áreas).
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (decisión del propietario), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión sobre gitleaks (`security`).
- Siguiente: UI de `CheckoutPage` y `adminService.upsertProduct`/`productService.normalizeProduct`; con credenciales, OWNER_CHECKLIST.

## 2026-11-07 — Ejecución 11 (cobertura UI de checkout y servicios)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-my4y97` (= main); se cambió a la rama autorizada = remoto `c1371f3`, árbol limpio.
- Tarea: pendiente nº 2 — `checkoutPage.test.jsx` (4 pruebas: carrito vacío, validación sin crear pedido, pedido válido con cliente/envío/idempotencia y apertura del pago, fallo del widget conserva el pedido y muestra el error) y `catalogAdminServices.test.js` (9 pruebas: `normalizeProduct`, `imageUrl`, `slugify`, `toReference`, `adminError`).
- Pruebas: vitest 172/172 (13 archivos); ESLint de los archivos nuevos sin errores; build OK. Wompi mockeado: no valida el widget real.
- No ejecutado: E2E sintético, test:env, pgTAP (sin cambios en esas áreas).
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (decisión del propietario), credenciales Wompi Sandbox, URL/acceso de Vercel Preview, decisión gitleaks (`security`).
- Siguiente: `adminService.upsertProduct` con Supabase simulado; job de CI para los `e2e_*.cjs` contra Supabase local; con credenciales, OWNER_CHECKLIST.

## 2026-11-07 — Ejecución 12 (cobertura del servicio admin)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-ak8vh5` (= main); se avanzó (fast-forward) a `mission/m26-dev-qa-environments` = remoto `b96c916`, árbol limpio. `pnpm install` OK.
- Tarea: pendiente nº 2 — `adminService.test.js` (7 pruebas: `upsertProduct` payload `{p}`, traducción de HINT JM_*, duplicados 23505, permisos 42501; mapeo de argumentos de `setProductStatus`/`adjustInventory`/`transitionOrder`; `dashboardMetrics`). Supabase simulado.
- Pruebas: vitest 179/179 (14 archivos); ESLint del archivo nuevo sin errores; build OK; E2E sintético 10/10.
- No ejecutado: test:env, pgTAP (sin cambios en esas áreas). Nada contra Supabase QA, Wompi ni Vercel.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (decisión del propietario), credenciales Wompi Sandbox, URL/acceso de Vercel Preview, decisión gitleaks (`security`).
- Siguiente: job de CI para los `e2e_*.cjs` contra Supabase local; aviso MODULE_TYPELESS_PACKAGE_JSON; con credenciales, OWNER_CHECKLIST.

## 2026-11-07 — Ejecución 13 (aviso de ESLint)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-vvgffn` (= main); se cambió a la rama autorizada = remoto `5a87d53`, árbol limpio.
- Tarea: pendiente nº 4 — `eslint.config.js` → `eslint.config.mjs` (evita el aviso `MODULE_TYPELESS_PACKAGE_JSON` sin tocar el `package.json` raíz, que afectaría a otros scripts). Sin referencias a la ruta antigua en el repo.
- Pruebas: ESLint 0 errores y sin aviso; build OK; vitest 179/179.
- No ejecutado: E2E sintético, test:env, pgTAP (sin cambios en esas áreas).
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (decisión del propietario), credenciales Wompi Sandbox, URL/acceso de Vercel Preview, decisión gitleaks (`security`).
- Siguiente: job de CI para los `e2e_*.cjs` contra Supabase local; con credenciales, OWNER_CHECKLIST.

## 2026-11-08 — Ejecución 14 (verificación de línea base)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-cjjfod` (= main); se cambió a la rama autorizada = remoto `5f84068`, árbol limpio.
- Tarea: re-verificar la línea base (sin código nuevo: no queda trabajo desbloqueado que no dependa del propietario; el job `e2e-supabase` ya existe en `.github/workflows`, por lo que el pendiente nº 3 queda cubierto).
- Pruebas: `pnpm install --frozen-lockfile` OK; build OK; vitest 179/179 (14 archivos); E2E sintético 10/10; ESLint sin salida de errores.
- No ejecutado: test:env, pgTAP (sin cambios).
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`).
- Siguiente: con credenciales, `OWNER_CHECKLIST.md` (Wompi Sandbox, Preview); decisión del propietario sobre `gitleaks-allowlist-e142ab2.patch` y sobre incorporar `e2e-supabase` a `ci-gate`.

## 2026-11-08 — Ejecución 15 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-pq6ykc` (= main); se cambió a la rama autorizada = remoto `09d7a98`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; vitest 179/179 (14 archivos). No se escribió código: todo el trabajo restante depende del propietario.
- No ejecutado: build, E2E sintético, test:env, pgTAP (sin cambios).
- Bloqueos reales: decisión A3-R/A3-M y backup para aplicar baseline M24 en Supabase QA; credenciales Wompi Sandbox; acceso/URL de Vercel Preview; decisión gitleaks (`security` → `ci-gate`); incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 16 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-8w7d6n` (= main); se cambió a la rama autorizada = remoto `24a1f77`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Nota: `vitest run` lanzado desde `apps/web` recoge los specs de Playwright (`e2e/playwright/*`) y reporta 2 archivos fallidos; es un uso incorrecto, el comando oficial (desde la raíz) pasa.
- No se escribió código: todo lo restante depende del propietario.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 17 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-b9biod` (= main); se cambió a la rama autorizada = remoto `d8b4cea`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 18 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-doucts` (= main); se cambió a la rama autorizada = remoto `11ce853`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 19 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-btrx6w` (= main); se cambió a la rama autorizada = remoto `6576046`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 20 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-p5lz65` (= main); se cambió a la rama autorizada = remoto `e4ad0e5`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 21 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-tsq0n3` (= main); se cambió a la rama autorizada = remoto `2ecf636`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación enviada al propietario (primera tras 8 ejecuciones sin avance posible).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 22 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-ywqsss` (= main); se cambió a la rama autorizada = remoto `21e8ac4`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios desde entonces).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 23 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-78js4w` (= main); se cambió a la rama autorizada = remoto `a11b684`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 24 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-leer6c` (= main); se cambió a la rama autorizada = remoto `ce1e794`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 25 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-grpliy` (= main); se cambió a la rama autorizada = remoto `331eaaa`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-08 — Ejecución 26 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-cydi6q` (atrasada respecto a la rama autorizada); se cambió a la rama autorizada = remoto `81ea5b2`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 27 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-qqba7f` (= main); se cambió a la rama autorizada = remoto `b3ba6b0`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 28 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-rjwszm` (= main); se cambió a la rama autorizada = remoto `a9ec52d`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 29 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-ypyxc7` (= main); se cambió a la rama autorizada = remoto `a11cf32`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 30 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-kikrud` (= main); se cambió a la rama autorizada = remoto `a797bcf`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 31 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-2wqf32` (= main); se cambió a la rama autorizada = remoto `4774382`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 32 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-jsekx3`; se alineó con la rama autorizada = remoto `38d54cb`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 33 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-rka8h1`; se cambió a la rama autorizada = remoto `9176b37`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 34 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-pp9qdl`; se cambió a la rama autorizada = remoto `0676c3e`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm build` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 35 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-m03dz2` (= main); se cambió a la rama autorizada = remoto `c216d08`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 36 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-vpf93h`; se alineó con la rama autorizada = remoto `d25ad3f`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 37 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-fbcz72` (= main); se cambió a la rama autorizada = remoto `ff8796e`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 38 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-dntl0z`; se cambió a la rama autorizada = remoto `46a74d8`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 39 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-btdqqi` (= main); se alineó (fast-forward) con la rama autorizada = remoto `c01f243`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-09 — Ejecución 40 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-q6pka8` (= main); se cambió a la rama autorizada = remoto `8cfe589`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 41 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-c3lu1k` (= main); se cambió a la rama autorizada = remoto `97f11ea`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 42 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-2u8p2q` (= main); se cambió a la rama autorizada = remoto `305a39b`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 43 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-bk7vx6` (= main); se cambió a la rama autorizada = remoto `fff9f16`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 44 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-yx4tm4` (= main); se cambió a la rama autorizada = remoto `31a828c`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 45 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-w5x2v2` (= main); se cambió a la rama autorizada = remoto `41587a4`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 — Ejecución 46 (sin trabajo desbloqueado)
- Estado inicial: sesión arrancó en `claude/gracious-pasteur-q6ph9p` (= main); fast-forward a la rama autorizada = remoto `c0d2f1d`, árbol limpio.
- Tarea: comprobación de línea base: `pnpm install --frozen-lockfile` OK; `pnpm test:unit` 179/179 (14 archivos). Sin variables WOMPI/VERCEL/SUPABASE en el entorno. No se escribió código.
- Bloqueos reales (sin cambio): baseline M24 en Supabase QA (A3-R/A3-M + backup), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks (`security` → `ci-gate`), incorporar `e2e-supabase` a `ci-gate`.
- Notificación: no enviada (ya se avisó en la ejecución 21; sin cambios).
- Siguiente: con las credenciales, ejecutar `OWNER_CHECKLIST.md`.

## 2026-11-10 17:09 UTC — Ejecución 47 (trabajo de código: admin de colecciones)
- Estado inicial: sesión en `claude/gracious-pasteur-ll4wak` (= main); se cambió a la rama autorizada = remoto `1c0d738`, árbol limpio. CI `ci`: todo ✔ salvo `security` (historial gitleaks, decisión del propietario).
- Tarea: se rompió el ciclo de «solo línea base» buscando funcionalidades simuladas. `/admin/colecciones` era una maqueta (mockData, botones sin acción) → CRUD real de colecciones y looks.
- Archivos: `apps/web/src/services/collectionsAdminService.js` (nuevo), `apps/web/src/pages/admin/AdminCollectionsPage.jsx` (reescrito), `apps/web/src/__tests__/adminCollections.test.jsx` (nuevo, 13 pruebas), `supabase/tests/database/90_rls.test.sql` (+7 aserciones RLS, plan 53).
- Pruebas (ejecutadas aquí): ESLint 0 errores; `pnpm build` OK; `pnpm test:unit` 192/192 (15 archivos); `pnpm test:e2e-synthetic` 10/10; `supabase/tests/run_local.sh` pgTAP 285/285, concurrencia 12/12, determinismo OK.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Siguiente: revisar el resto del admin por datos/acciones simuladas (ver punto 0 de Pendiente en MASTER_STATUS).

## 2026-11-10 18:20 UTC — Ejecución 48 (trabajo de código: configuración de envíos)
- Estado inicial: sesión en `claude/gracious-pasteur-4dwxl3` (= main); se cambió a la rama autorizada = remoto `51f8f87`, árbol limpio.
- Tarea: punto 0 de Pendiente. `/admin/configuracion` redirigía al dashboard → panel real de métodos/tarifas de envío. Eliminadas 3 páginas heredadas sin referencias (+2 CSS).
- Archivos: `apps/web/src/services/shippingAdminService.js` (nuevo), `apps/web/src/pages/admin/AdminSettingsPage.jsx` (nuevo), `apps/web/src/routes/AppRoutes.jsx`, `apps/web/src/__tests__/adminShipping.test.jsx` (nuevo, 13 pruebas), `supabase/tests/database/90_rls.test.sql` (+6 aserciones, plan 59), borrados `apps/web/src/pages/{Customers,Dashboard,Inventory}.jsx` y `{Dashboard,Inventory}.module.css`.
- Pruebas (ejecutadas aquí): ESLint 0 errores; `pnpm build` OK; `pnpm test:unit` 205/205 (16 archivos); `pnpm test:e2e-synthetic` 10/10; `supabase/tests/run_local.sh` (como usuario `postgres`, tras instalar `postgresql-16-cron` y `postgresql-16-pgtap` en el contenedor) pgTAP 291/291, concurrencia 12/12, determinismo OK. Primer intento falló 1 aserción (anon recibe 42501 por falta de privilegio UPDATE, no 0 filas) → aserción corregida.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Nota de entorno: `run_local.sh` necesita pg_cron y pgTAP y no puede correr como root (`runuser -u postgres -- env WORKDIR=<dir propiedad de postgres> bash supabase/tests/run_local.sh`).
- Siguiente: punto 0 de Pendiente en MASTER_STATUS (umbral de envío gratis dinámico en textos de la tienda).

## 2026-11-10 19:11 UTC — Ejecución 49 (trabajo de código: textos de envío dinámicos)
- Estado inicial: sesión en `claude/gracious-pasteur-q4nswo` (= main); se cambió a la rama autorizada = remoto `752f241`, árbol limpio.
- Tarea: punto 0(a) de Pendiente. Umbral de envío gratis y tarifa estándar leídos de `shipping_methods` en cabecera, pie, ficha de producto e InfoPage; aviso del panel de configuración actualizado.
- Archivos: `apps/web/src/utils/shippingPolicy.js` (nuevo), `apps/web/src/hooks/useShippingPolicy.js` (nuevo), `components/Header/Header.jsx`, `components/Footer/Footer.jsx`, `pages/InfoPage.jsx`, `pages/ProductDetailPage.jsx`, `pages/admin/AdminSettingsPage.jsx`, `src/__tests__/shippingPolicy.test.jsx` (nuevo, 7 pruebas), `e2e/e2e_synthetic.cjs` (recorrido 4 ampliado).
- Pruebas (ejecutadas aquí): ESLint 0 errores; `pnpm build` OK; `pnpm test:unit` 212/212 (17 archivos); `pnpm test:e2e-synthetic` 10/10. pgTAP no se re-ejecutó (sin cambios de SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(b) de Pendiente (revisar `AdminEditorialImagesPage` y `AdminDiscountsPage` por acciones incompletas).

## 2026-11-10 20:15 UTC — Ejecución 50 (trabajo de código: cupones del admin)
- Estado inicial: sesión en `claude/gracious-pasteur-xmpgvd` (= main); se partió de la rama autorizada = remoto `7338d9c`, árbol limpio.
- Tarea: punto 0(b) de Pendiente. `AdminEditorialImagesPage` ya real (sin cambios). `AdminDiscountsPage`: corregido desplazamiento de fechas por zona horaria al editar y rango de porcentaje (UI 1–100 vs BD 1–90); servicio nuevo con validación y detección de 0 filas.
- Archivos: `apps/web/src/services/couponsAdminService.js` (nuevo), `apps/web/src/pages/admin/AdminDiscountsPage.jsx`, `apps/web/src/__tests__/adminCoupons.test.jsx` (nuevo, 13 pruebas).
- Pruebas (ejecutadas aquí): ESLint 0 errores en los archivos tocados; `pnpm build` OK; `pnpm test:unit` 225/225 (18 archivos); `pnpm test:e2e-synthetic` 10/10. pgTAP no re-ejecutado (sin cambios SQL).
- Push: la sesión solo puede publicar en `claude/gracious-pasteur-xmpgvd` (instrucción del entorno); el commit se basa en la punta de `mission/m26-dev-qa-environments` y avanza en fast-forward sobre ella.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Siguiente: punto 0(c) de Pendiente (selector de método de envío en checkout cuando haya más de uno activo; requiere revisar `create_order`/`quote_cart`, que hoy fijan `standard`).

## 2026-11-10 21:15 UTC — Ejecución 51 (trabajo de código: método de envío en checkout)
- Estado inicial: sesión en `claude/gracious-pasteur-bya7dc` (= main); se cambió a la rama autorizada = remoto `3f20452`, árbol limpio.
- Tarea: punto 0(c) de Pendiente. El selector ya existía y la BD ya aceptaba el método; se corrigieron 3 defectos con varios métodos activos: cotización de otro método mostrada como definitiva, carrera entre cotizaciones, idempotencia sin método. Retorno a `standard` si el método elegido se desactiva.
- Archivos: `apps/web/src/store/eCommerceStore.js`, `apps/web/src/pages/CheckoutPage.jsx`, `apps/web/src/__tests__/checkoutShippingMethod.test.jsx` (nuevo, 7 pruebas).
- Pruebas (ejecutadas aquí): las 7 nuevas pasan y 6 de ellas fallan sin el arreglo (comprobado con `git stash`); `pnpm test:unit` 232/232 (19 archivos); ESLint 0 errores en los archivos tocados; `pnpm build` OK; `pnpm test:e2e-synthetic` 10/10. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(d) de Pendiente (mostrar el método de envío del pedido en confirmación, «Mis pedidos» y admin).

## 2026-11-10 22:13 UTC — Ejecución 52 (trabajo de código: método de envío en pedidos)
- Estado inicial: sesión en `claude/gracious-pasteur-q3xnvj` (= main); se partió de la rama autorizada = remoto `0925741`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(d) de Pendiente. Nombre del método de envío en confirmación, «Mis pedidos» y detalle del admin; `getMyOrders` ahora pide `shipping_method_code`; backend sintético con `get_order_public` completo (shipping/nombre/correo).
- Archivos: `apps/web/src/utils/shippingPolicy.js`, `services/orderService.js`, `pages/OrderConfirmationPage.jsx`, `pages/AccountPage.jsx`, `pages/admin/AdminOrdersPage.jsx`, `src/__tests__/orderShippingMethod.test.jsx` (nuevo, 6 pruebas), `e2e/e2e_synthetic.cjs` (recorridos 5 y 8), `e2e/synthetic/backend.cjs`.
- Pruebas (ejecutadas aquí): 5 de las 6 nuevas fallan sin el cambio (comprobado con `git stash`); `pnpm test:unit` 238/238 (20 archivos); ESLint 0 errores en los archivos tocados; `pnpm build` OK; `pnpm test:e2e-synthetic` 10/10. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(e) de Pendiente (revisar `AdminCustomersPage`/`AdminDashboardPage` por datos simulados).

## 2026-11-10 23:10 UTC — Ejecución 53 (trabajo de código: admin pedidos, clientes y dashboard)
- Estado inicial: sesión en `claude/gracious-pasteur-1nrel0` (= main); se cambió a la rama autorizada = remoto `04f3685`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(e) de Pendiente. Clientes/dashboard ya reales; corregidos doble atribución de pedidos por correo, error de direcciones oculto y flechas de tendencia inventadas en KPIs. Pedidos: columna y filtro de método de envío, búsqueda por guía, aviso de límite de 200.
- Archivos: `apps/web/src/utils/adminLists.js` (nuevo), `pages/admin/AdminOrdersPage.jsx`, `pages/admin/AdminCustomersPage.jsx`, `pages/admin/AdminDashboardPage.jsx`, `src/__tests__/adminLists.test.jsx` (nuevo, 8 pruebas).
- Pruebas (ejecutadas aquí): 4 pruebas de UI nuevas fallan sin el cambio en las páginas (comprobado con `git stash`); `pnpm test:unit` 246/246 (21 archivos); ESLint 0 errores en los archivos tocados; `pnpm build` OK; `pnpm test:e2e-synthetic` 10/10. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(f) de Pendiente (paginación real en admin de pedidos/clientes).

## 2026-11-11 00:13 UTC — Ejecución 54 (trabajo de código: paginación real en el admin)
- Estado inicial: sesión en `claude/gracious-pasteur-54q5eb` (= main); se cambió a la rama autorizada = remoto `b64d8b7`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(f) de Pendiente. Pedidos: filtros y búsqueda en la BD, páginas de 50 con conteo exacto y «Cargar más», conteos de pestañas sobre todos los pedidos. Clientes e inventario: lectura completa por páginas (`fetchAllRows`) en vez de una consulta cortada a 1000 filas por PostgREST.
- Archivos: `apps/web/src/utils/adminLists.js`, `pages/admin/AdminOrdersPage.jsx`, `pages/admin/AdminCustomersPage.jsx`, `pages/admin/AdminInventoryPage.jsx`, `src/__tests__/adminLists.test.jsx`, `src/__tests__/orderShippingMethod.test.jsx` (fake con `range`/`or`), `e2e/synthetic/backend.cjs` (offset, conteo exacto, `or` ilike), `e2e/e2e_synthetic.cjs` (recorrido 10 + espera estable del nombre del método en 5 y 8).
- Pruebas (ejecutadas aquí): 3 pruebas nuevas fallan sin el cambio en las páginas (`git stash`); `pnpm test:unit` 249/249 (21 archivos); ESLint 0 errores en `apps/web/src` y los E2E tocados; `pnpm build` OK; `pnpm test:e2e-synthetic` 10/10 en 4 ejecuciones tras estabilizar la espera (antes de estabilizarla, el recorrido 8 falló 1 vez de 3 por una carrera del propio test: leía el nombre de respaldo del método antes de cargar `shipping_methods`). pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(g) de Pendiente (límites silenciosos en catálogo/reseñas/wishlist; luego perfil y direcciones del cliente).

## 2026-11-11 01:12 UTC — Ejecución 55 (trabajo de código: catálogo sin cortes silenciosos)
- Estado inicial: sesión en `claude/gracious-pasteur-kbocro` (= main); se cambió a la rama autorizada = remoto `3ce8a48`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(g) de Pendiente. Defecto real: con >1000 variantes la disponibilidad se cortaba y productos con stock salían agotados. Catálogo, disponibilidad, valoraciones, wishlist y reseñas del admin paginados; listas `in` troceadas.
- Archivos: `apps/web/src/utils/fetchAll.js` (nuevo), `utils/adminLists.js` (re-export), `services/productService.js`, `services/wishlistService.js`, `pages/admin/AdminReviewsPage.jsx`, `src/__tests__/catalogPagination.test.js` (nuevo, 5 pruebas).
- Pruebas (ejecutadas aquí): 2 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 254/254 (22 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 10/10. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(h) de Pendiente (perfil y direcciones del cliente).

## 2026-11-11 02:19 UTC — Ejecución 56 (trabajo de código: perfil y direcciones del cliente)
- Estado inicial: sesión en `claude/gracious-pasteur-j1p7k7` (= main, `2661f2a`); se partió de la rama autorizada = remoto `1912bd0`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(h) de Pendiente. «Mi cuenta» no permitía editar datos ni guardar direcciones: implementados «Mis datos» y «Mis direcciones» y el selector de dirección guardada en el checkout. Corregidas dos carreras reales del perfil (lectura tardía que pisaba el guardado; relectura que borraba el formulario).
- Archivos: `apps/web/src/services/accountService.js` (nuevo), `components/Account/AccountDetails.jsx` (nuevo), `utils/colombia.js` (nuevo), `pages/AccountPage.jsx`, `pages/CheckoutPage.jsx`, `store/authStore.js`, `src/__tests__/accountDetails.test.jsx` (nuevo, 16 pruebas), `e2e/synthetic/backend.cjs` (escrituras de direcciones/perfil), `e2e/e2e_synthetic.cjs` (recorrido 11).
- Pruebas (ejecutadas aquí): las pruebas de la carrera y del índice único fallan sin el arreglo (comprobado restaurando los archivos); `pnpm test:unit` 270/270 (23 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 11/11 en 3 ejecuciones seguidas. Durante el desarrollo el recorrido 10 (admin) falló 2 veces por mi primera versión de la secuencia del perfil (la lectura superada devolvía un perfil vacío y el guardia del admin no veía el rol): corregido antes de publicar. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(i) de Pendiente («Guardar esta dirección» en el checkout; contraseña desde la cuenta).


## 2026-11-11 03:30 UTC — Ejecución 57 (trabajo de código: dirección desde el checkout y contraseña)
- Estado inicial: sesión en `claude/gracious-pasteur-upkj1c` (= main, `2661f2a`); se partió de la rama autorizada = remoto `a003bea`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(i) de Pendiente. Casilla «Guardar esta dirección en mi cuenta» en el checkout; sección «Contraseña» en «Mi cuenta» (con código de reautenticación); errores reales en `/cuenta/restablecer`. El recorrido E2E nuevo destapó un bloqueo mutuo real en `authStore` (`onAuthStateChange` asíncrono → `updateUser` colgado), corregido.
- Archivos: `apps/web/src/utils/passwordPolicy.js` (nuevo), `services/accountService.js`, `components/Account/AccountDetails.jsx`, `pages/CheckoutPage.jsx`, `pages/ResetPasswordPage.jsx`, `store/authStore.js`, `src/__tests__/accountDetails.test.jsx`, `src/__tests__/auth.test.jsx`, `e2e/synthetic/backend.cjs` (`PUT /auth/v1/user`), `e2e/e2e_synthetic.cjs` (recorrido 12).
- Pruebas (ejecutadas aquí): 11 pruebas nuevas de cuenta/checkout/contraseña y la del callback fallan sin el cambio (`git stash`); `pnpm test:unit` 285/285 (23 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 12/12 en 3 ejecuciones seguidas (antes del arreglo del store, el recorrido 12 fallaba con el botón en «Guardando…»). pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`. Nueva decisión de configuración para el propietario (no bloqueante): activar «Secure password change» en Supabase Auth (D35).
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(j) de Pendiente (confirmación/reintento de pago con sesión vencida; grep confirmó que no quedan otros callbacks `onAuthStateChange` asíncronos).

## 2026-11-11 04:30 UTC — Ejecución 58 (trabajo de código: pagar/cancelar desde el enlace del pedido)
- Estado inicial: sesión en `claude/gracious-pasteur-wtkleq` (= main, `2661f2a`); se partió de la rama autorizada = remoto `1176ccc`, árbol limpio. `pnpm install --frozen-lockfile` OK. Instalados en el contenedor `postgresql-16-pgtap`, `postgresql-16-cron` y `pg_prove` para `run_local.sh`.
- Tarea: punto 0(j) de Pendiente. El enlace de seguimiento en otro navegador no permitía pagar ni cancelar (faltaba el id); el estado no se releía tras un rechazo del pago; se ofrecía pagar con la ventana vencida; un fallo de red en la consulta periódica tapaba el pedido.
- Archivos: `supabase/migrations/20261111120000_order_public_id.sql` (nuevo, aditivo), `supabase/tests/database/70_transitions.test.sql` (+1 aserción), `apps/web/src/pages/OrderConfirmationPage.jsx`, `apps/web/src/__tests__/orderConfirmationRetry.test.jsx` (nuevo, 7 pruebas), `apps/web/e2e/synthetic/backend.cjs` (`get_order_public` con `id` y `payment_expires_at`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 13).
- Pruebas (ejecutadas aquí): 6 de 7 pruebas nuevas fallan sin el cambio de la página (`git stash`); `pnpm test:unit` 292/292 (24 archivos); `supabase/tests/run_local.sh` pgTAP 292/292, concurrencia 12/12, determinismo OK; `migrations_policy.sh` OK; ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 13/13 en 3 ejecuciones seguidas.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 en Supabase QA (ahora + migración `20261111120000`), credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(k) de Pendiente («Mis pedidos»: pagar/cancelar desde la lista y ventana vencida).

## 2026-11-11 05:15 UTC — Ejecución 59 (trabajo de código: «Mis pedidos» con pagar/cancelar desde la lista)
- Estado inicial: sesión en `claude/gracious-pasteur-p42jhx` (= main, `2661f2a`); se partió de la rama autorizada = remoto `d347a7f`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(k) de Pendiente. «Pagar ahora» y «Cancelar pedido» directamente en la lista; plazo de pago visible; ventana vencida mostrada como «Pago vencido» sin botón de pago; relectura ante rechazo de la BD o tras cancelar; una relectura fallida no borra la lista.
- Archivos: `apps/web/src/pages/AccountPage.jsx`, `apps/web/src/services/orderService.js` (`payment_expires_at` en `getMyOrders`), `apps/web/src/__tests__/accountOrdersActions.test.jsx` (nuevo, 9 pruebas), `apps/web/e2e/synthetic/backend.cjs` (`/__synthetic-expire-window/`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 14).
- Pruebas (ejecutadas aquí): las 9 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 301/301 (25 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 14/14 en 3 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(l) de Pendiente (lista de deseos y búsqueda: lógica simulada restante).

## 2026-11-11 06:15 UTC — Ejecución 60 (trabajo de código: filtros y búsqueda del catálogo)
- Estado inicial: sesión en `claude/gracious-pasteur-zamixk` (= main, `2661f2a`); se partió de la rama autorizada = remoto `32dea66`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(l) de Pendiente. Lista de deseos revisada: ya era real (sin cambios). Catálogo: tope de precio fijo $400.000 que ocultaba productos caros, tallas/fits fijos, ocasiones de `mockData`, búsqueda sensible a tildes, panel móvil solo con categorías, conteo de categoría con productos no activos → corregidos.
- Archivos: `apps/web/src/utils/catalogFilters.js` (nuevo), `apps/web/src/pages/CatalogPage.jsx`, `apps/web/src/services/productService.js` (`occasionList`), `apps/web/src/__tests__/catalogFilters.test.jsx` (nuevo, 12 pruebas), `apps/web/e2e/synthetic/backend.cjs` (ocasión «Oficina» en el Polo), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 15).
- Pruebas (ejecutadas aquí): las 4 pruebas nuevas de la página fallan sin el cambio (`git stash`); `pnpm test:unit` 313/313 (26 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 15/15 en 3 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(m) de Pendiente (`HomePage`: categorías, ocasiones y líneas desde la BD en lugar de `mockData`).

## 2026-11-11 07:17 UTC — Ejecución 61 (trabajo de código: portada con secciones de la BD)
- Estado inicial: sesión en `claude/gracious-pasteur-gt2wtj` (= main, `2661f2a`); se partió de la rama autorizada = remoto `4e9713a`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(m) de Pendiente. `HomePage` leía líneas, categorías y ocasiones de `mockData`; ahora de `style_lines`/`categories`/`occasions` con respaldo si la BD falla. Defecto real: la imagen editorial de Smart Casual (`style_smart_casual`) nunca se mostraba (la portada buscaba `style_casual`).
- Archivos: `apps/web/src/utils/homeTaxonomy.js` (nuevo), `apps/web/src/hooks/useStorefrontTaxonomy.js` (nuevo), `apps/web/src/services/productService.js` (`getStorefrontTaxonomy`), `apps/web/src/pages/HomePage.jsx`, `apps/web/src/data/mockData.js` (eliminadas 3 constantes sin uso), `apps/web/src/__tests__/homeTaxonomy.test.jsx` (nuevo, 7 pruebas), `apps/web/e2e/synthetic/backend.cjs` (`is_active` en categoría y línea), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 16; error completo con `E2E_DEBUG`).
- Pruebas (ejecutadas aquí): 2 pruebas de la página fallan sin el cambio (`git stash`); `pnpm test:unit` 320/320 (27 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 16/16 en 3 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(n) de Pendiente (menú de la cabecera y claves del admin de imágenes editoriales desde la BD).

## 2026-11-11 08:10 UTC — Ejecución 62 (trabajo de código: cabecera y admin de imágenes editoriales desde la BD)
- Estado inicial: sesión en `claude/gracious-pasteur-zk3xiw` (= main, `2661f2a`); se partió de la rama autorizada = remoto `df99b63`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(n) de Pendiente. La cabecera tenía líneas y categorías escritas a mano (ACCESORIOS y subcategorías fijas aunque no existieran o estuvieran desactivadas; nombres que el admin no podía cambiar); el admin de imágenes editoriales listaba claves fijas (sin «Calzado» ni secciones nuevas).
- Archivos: `apps/web/src/utils/navTaxonomy.js` (nuevo), `apps/web/src/utils/homeTaxonomy.js` (`buildEditorialItems`), `apps/web/src/components/Header/Header.jsx`, `apps/web/src/pages/admin/AdminEditorialImagesPage.jsx`, `apps/web/src/__tests__/navTaxonomy.test.jsx` (nuevo, 7 pruebas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 17).
- Pruebas (ejecutadas aquí): 2 pruebas de render fallan sin el cambio (`git stash`); `pnpm test:unit` 327/327 (28 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 17/17 en 3 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(o) de Pendiente (restos de `mockData` en páginas; después guías de tallas/fit).

## 2026-11-11 09:20 UTC — Ejecución 63 (trabajo de código: fuera `mockData`, guía de tallas por categoría)
- Estado inicial: sesión en `claude/gracious-pasteur-w2moj2` (= main, `2661f2a`); se partió de la rama autorizada = remoto `839cd13`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(o) de Pendiente. Quedaban 18 importaciones de `data/mockData.js` (15 solo por `formatCOP`; 3 por `SIZE_CHART`/`FITS_INFO`) y ~380 líneas de productos/looks/reseñas simulados sin uso. Defecto real: `SizeGuideModal` está siempre montado y fijaba la pestaña con `useState` una sola vez → abrir «Guía de medidas» desde un zapato o pantalón mostraba camisetas; además `pantalones`, `bermudas`, `polos` y `chaquetas` no tenían tabla asociada.
- Archivos: `apps/web/src/utils/currency.js` (nuevo), `apps/web/src/data/sizeGuide.js` (nuevo, con `sizeChartTabFor`), `apps/web/src/data/mockData.js` (eliminado), `components/Modals/SizeGuideModal.jsx`, `components/Modals/FitGuideModal.jsx`, `pages/InfoPage.jsx`, 15 archivos con el import de `formatCOP` cambiado, `src/__tests__/sizeGuideCurrency.test.jsx` (nuevo, 8 pruebas).
- Pruebas (ejecutadas aquí): las 2 pruebas del modal fallan con la versión anterior del componente; `pnpm test:unit` 335/335 (29 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 17/17 en 2 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(p) de Pendiente («Encuentra tu talla», `CompleteTheLook`, guía en productos de talla única).

## 2026-11-11 11:15 UTC — Ejecución 64 (trabajo de código: ayudas de talla y «Completa el look» con datos reales)
- Estado inicial: sesión en `claude/gracious-pasteur-g26x3z` (= main, `2661f2a`); se partió de la rama autorizada = remoto `3ed1473`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(p) de Pendiente. Recomendador con estadística inventada («94% de clientes») y tallas no ofrecidas; guía y recomendador en talla única; recomendador en calzado/pantalón; etiquetas fijas por posición en «Completa el look»; resultado del recomendador que persistía entre productos.
- Archivos: `apps/web/src/utils/sizeAdvice.js` (nuevo), `components/Modals/SizeRecommenderModal.jsx`, `components/Modals/SizeGuideModal.jsx`, `components/Product/CompleteTheLook.jsx`, `pages/ProductDetailPage.jsx`, `store/eCommerceStore.js` (`recommendedSize`, `applyRecommendedSize`, `selectedModalSizeGroup`), `src/__tests__/sizeAdvice.test.jsx` (nuevo, 11 pruebas), `e2e/synthetic/backend.cjs` (`size_group: 'alpha'`), `e2e/e2e_synthetic.cjs` (recorrido 18).
- Pruebas (ejecutadas aquí): 5 pruebas de UI nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 346/346 (30 archivos) dos veces; ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 18/18 en 2 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(q) de Pendiente (talla por prenda en «Comprar el look completo»; formularios de boletín/contacto).

## 2026-11-11 12:10 UTC — Ejecución 65 (trabajo de código: talla por prenda en «Comprar el look completo»)
- Estado inicial: sesión en `claude/gracious-pasteur-n5e2p8` (= main, `2661f2a`); se partió de la rama autorizada = remoto `f8f50e9`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(q) de Pendiente. El look agregaba la primera variante con stock de cada prenda sin preguntar; ahora selector de color/talla por prenda, sin agregado parcial si falta talla, agotadas avisadas y fuera del precio.
- Archivos: `apps/web/src/utils/lookSelection.js` (nuevo), `apps/web/src/components/Product/CompleteTheLook.jsx`, `apps/web/src/__tests__/lookSelection.test.jsx` (nuevo, 6 pruebas), `apps/web/e2e/synthetic/backend.cjs` (look sembrado en `collections`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 19).
- Pruebas (ejecutadas aquí): las 2 pruebas de UI nuevas fallan con el componente anterior (`git stash`); `pnpm test:unit` 352/352 (31 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 19/19 en 2 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Revisado sin cambios: `/contacto` (InfoPage) no tiene formulario. Hallado para la próxima: el boletín de la portada confirma suscripción y promete 10% sin guardar nada; «Mover todo al carrito» de la lista de deseos usa la primera variante con stock.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(r) de Pendiente (boletín real con migración aditiva) y 0(s) (talla por prenda en «Mover todo al carrito»).

## 2026-11-11 13:11 UTC — Ejecución 66 (trabajo de código: talla por prenda en «Agregar todo al carrito» de favoritos)
- Estado inicial: sesión en `claude/gracious-pasteur-acsisb` (= main, `2661f2a`); se partió de la rama autorizada = remoto `ce2269f`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(s) de Pendiente. `moveWishlistToCart` agregaba la primera variante con stock de cada favorito (p. ej. XS) y el aviso decía «talla disponible por defecto»; ahora cada favorito muestra selector de color/talla y no se agrega nada si falta alguna talla; agotados y productos inexistentes se informan.
- Archivos: `apps/web/src/components/Product/VariantPicker.jsx` (nuevo, extraído de `CompleteTheLook`), `apps/web/src/components/Product/CompleteTheLook.jsx`, `apps/web/src/store/eCommerceStore.js` (`moveWishlistToCart(selections)`), `apps/web/src/pages/WishlistPage.jsx`, `apps/web/src/__tests__/wishlistMoveToCart.test.jsx` (nuevo, 5 pruebas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 20).
- Pruebas (ejecutadas aquí): las 5 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 357/357 (32 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 20/20 en 2 ejecuciones seguidas. pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migración `20261111120000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(r) de Pendiente (boletín real: migración aditiva `newsletter_subscribers` + RPC `subscribe_newsletter`, pgTAP), luego 0(t).

## 2026-11-11 14:10 UTC — Ejecución 67 (trabajo de código: boletín «Únete al club J&M» real)
- Estado inicial: sesión en `claude/gracious-pasteur-s45bex` (= main, `2661f2a`); se partió de la rama autorizada = remoto `fbffcb0`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron instalados con `apt-get update` (sin ellos `run_local.sh` no corre).
- Tarea: punto 0(r) de Pendiente. El formulario confirmaba sin guardar y prometía un 10% inexistente → migración aditiva `20261111140000_newsletter_subscribers.sql` (tabla + RLS admin + RPC `subscribe_newsletter` idempotente con límite) y componente real.
- Archivos: `supabase/migrations/20261111140000_newsletter_subscribers.sql` (nuevo), `supabase/tests/database/92_newsletter.test.sql` (nuevo, 16 aserciones), `supabase/tests/database/01_structure.test.sql` (35 tablas, RPC nueva), `apps/web/src/services/newsletterService.js` (nuevo), `apps/web/src/components/Home/NewsletterSignup.jsx` (nuevo), `apps/web/src/pages/HomePage.jsx`, `apps/web/src/__tests__/newsletterSignup.test.jsx` (nuevo, 7 pruebas), `apps/web/e2e/synthetic/backend.cjs`, `apps/web/e2e/e2e_synthetic.cjs` (recorrido 21).
- Pruebas (ejecutadas aquí): `run_local.sh` pgTAP 308/308, concurrencia 12/12, determinismo OK (la primera pasada falló 3 aserciones de `01_structure` que enumeran tablas/RPC → actualizadas); `migrations_policy.sh` OK; `pnpm test:unit` 364/364 (33 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `node apps/web/e2e/e2e_synthetic.cjs` 21/21.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000` y `20261111140000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(t) de Pendiente (`ProductCard`: compra rápida sin elegir talla), luego 0(u) (admin de suscriptores).

## 2026-11-11 15:10 UTC — Ejecución 68 (trabajo de código: agregado rápido de `ProductCard` con color elegido)
- Estado inicial: sesión en `claude/gracious-pasteur-355juw` (= main, `2661f2a`); se partió de la rama autorizada = remoto `cff8e8e`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(t) de Pendiente. La barra de tallas de la tarjeta agregaba siempre el primer color sin decirlo y, con ese color agotado, deshabilitaba todas las tallas. Ahora muestras de color seleccionables, tallas del color elegido, confirmación con talla y color, barra visible con foco de teclado.
- Archivos: `apps/web/src/components/Product/ProductCard.jsx`, `apps/web/src/__tests__/productCardQuickAdd.test.jsx` (nuevo, 4 pruebas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 22).
- Pruebas (ejecutadas aquí): las 4 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 368/368 (34 archivos); ESLint `apps packages scripts` 0 errores; `pnpm build` OK; `pnpm test:e2e-synthetic` 22/22 en 3 ejecuciones (una primera versión falló 8 recorridos por nombres accesibles «Color X» duplicados → etiquetas cambiadas). pgTAP no re-ejecutado (sin cambios SQL).
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000` y `20261111140000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(u) de Pendiente (admin de suscriptores del boletín: búsqueda, baja y CSV, paginado con `fetchAllRows`).

## 2026-11-11 16:10 UTC — Ejecución 69 (trabajo de código: admin de suscriptores del boletín)
- Estado inicial: sesión en `claude/gracious-pasteur-vawljv` (= main, `2661f2a`); se partió de la rama autorizada = remoto `09c971a`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron instalados con apt; `run_local.sh` ejecutado como usuario `postgres` (initdb no corre como root).
- Tarea: punto 0(u) de Pendiente. Nueva página `/admin/boletin` (menú «Boletín»): resumen activos/bajas/total, búsqueda por correo u origen, filtro por estado, baja con confirmación y reactivación (solo `unsubscribed_at`), exportación CSV de la vista filtrada; lectura completa con `fetchAllRows`; aviso claro si falta la migración `20261111140000` (PGRST205).
- Archivos: `apps/web/src/pages/admin/AdminNewsletterPage.jsx` (nuevo), `apps/web/src/utils/newsletterAdmin.js` (nuevo), `apps/web/src/services/newsletterService.js`, `apps/web/src/routes/AppRoutes.jsx`, `apps/web/src/layouts/AdminLayout.jsx`, `apps/web/src/__tests__/adminNewsletter.test.jsx` (nuevo, 8 pruebas), `supabase/tests/database/92_newsletter.test.sql` (+3 aserciones: cliente no da de baja, admin no reescribe correo, admin no borra), `apps/web/e2e/synthetic/backend.cjs` (lectura admin y PATCH de `newsletter_subscribers`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 23).
- Pruebas (ejecutadas aquí): 6 de las pruebas de UI nuevas fallan sin el servicio nuevo (`git stash`); `pnpm test:unit` 376/376 (35 archivos); ESLint `apps packages scripts` 0 errores (un BOM literal corregido a `\uFEFF`); `pnpm build` OK; `run_local.sh` pgTAP 311/311, concurrencia 12/12, determinismo OK; `node apps/web/e2e/e2e_synthetic.cjs` 23/23 en 3 ejecuciones.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000` y `20261111140000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(v) de Pendiente (baja del boletín por el propio cliente desde «Mi cuenta»).

## 2026-11-11 17:20 UTC — Ejecución 70 (trabajo de código: boletín desde «Mi cuenta»)
- Estado inicial: sesión en `claude/gracious-pasteur-ugny2r` (= main, `2661f2a`); se partió de la rama autorizada = remoto `d530410`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron/pg_prove instalados con apt; `run_local.sh` como usuario `postgres`.
- Tarea: punto 0(v) de Pendiente. La casilla de marketing de «Mis datos» no tocaba la lista real del boletín → RPC aditivas por correo de la cuenta + UI conectada.
- Archivos: `supabase/migrations/20261111160000_newsletter_account.sql` (nuevo), `supabase/tests/database/93_newsletter_account.test.sql` (nuevo, 20 aserciones), `supabase/tests/database/01_structure.test.sql` (RPC de `authenticated`), `apps/web/src/services/newsletterService.js`, `apps/web/src/components/Account/AccountDetails.jsx`, `apps/web/src/__tests__/accountNewsletter.test.jsx` (nuevo, 7 pruebas), `apps/web/e2e/synthetic/backend.cjs`, `apps/web/e2e/e2e_synthetic.cjs` (recorrido 24).
- Pruebas (ejecutadas aquí): `run_local.sh` pgTAP 331/331, concurrencia 12/12, determinismo OK; `migrations_policy.sh` OK; 5 de las 7 pruebas nuevas fallan sin el cambio de UI; `pnpm test:unit` 383/383 (36 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `node apps/web/e2e/e2e_synthetic.cjs` 24/24.
- Errores pendientes: ninguno nuevo. Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`, `20261111140000` y `20261111160000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(w) de Pendiente (reseñas de producto escritas por el cliente con comprador verificado calculado en la BD).

## Ejecución 71 — 2026-11-11 (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-m1n1r8` (= main, `2661f2a`); se partió de la rama autorizada = remoto `0c4e90a`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron/pg_prove instalados con apt; `run_local.sh` como usuario `postgres`.
- Tarea: punto 0(w) de Pendiente. Ningún cliente podía escribir una reseña (solo lectura de aprobadas + moderación admin) → RPC aditivas con compra verificada en la BD + formulario en la ficha.
- Archivos: `supabase/migrations/20261111180000_customer_reviews.sql` (nuevo), `supabase/tests/database/94_customer_reviews.test.sql` (nuevo, 26 aserciones), `supabase/tests/database/01_structure.test.sql` (RPC de `authenticated`), `apps/web/src/services/reviewsService.js` (nuevo), `apps/web/src/components/Product/ProductReviewForm.jsx` (nuevo), `apps/web/src/pages/ProductDetailPage.jsx`, `apps/web/src/__tests__/productReviewForm.test.jsx` (nuevo, 9 pruebas), `apps/web/e2e/synthetic/backend.cjs` (RPC espejo; artículos con `id`/`product_id`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 25).
- Pruebas (ejecutadas aquí): `run_local.sh` pgTAP 357/357 (13 archivos), concurrencia 12/12, determinismo OK; `migrations_policy.sh` OK; `pnpm test:unit` 392/392 (37 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `node apps/web/e2e/e2e_synthetic.cjs` 25/25.
- Errores pendientes: ninguno nuevo. Observación: la lectura pública de `product_reviews` permite seleccionar `user_id` de reseñas aprobadas (UUID, sin datos personales directos); anotado en Pendiente 0(x).
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`, `20261111140000`, `20261111160000` y `20261111180000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(x) de Pendiente (aviso para opinar desde «Mis pedidos», respuesta del admin en la ficha, `user_id` en la lectura pública).

## Ejecución 72 — 2026-11-11 (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-v6lr6z` (= main, `2661f2a`); se partió de la rama autorizada = remoto `5d30af1`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron/pg_prove instalados con apt; `run_local.sh` como usuario `postgres`.
- Tarea: punto 0(x) de Pendiente. (1) La respuesta del admin (`admin_reply`) se guardaba pero la ficha no la mostraba; (2) nada invitaba a opinar tras la entrega; (3) la lectura pública de reseñas aprobadas dejaba seleccionar `user_id`, `order_item_id`, `moderated_by` y `moderated_at` (y filtrar por ellos: se podía saber qué reseñas eran de una cuenta concreta).
- Archivos: `supabase/migrations/20261111200000_reviews_public_columns.sql` (nuevo: SELECT por columnas + RPC `my_review_invitations`), `supabase/tests/database/96_review_privacy_invitations.test.sql` (nuevo, 17 aserciones), `supabase/tests/database/94_customer_reviews.test.sql` (filtros por título en vez de `user_id` para anon/admin), `supabase/tests/database/01_structure.test.sql`, `apps/web/src/services/reviewsService.js` (`fetchReviewInvitations`), `apps/web/src/components/Account/ReviewInvitations.jsx` (nuevo), `apps/web/src/pages/AccountPage.jsx`, `apps/web/src/pages/ProductDetailPage.jsx` (`#opiniones`, «Respuesta de J&M»), `apps/web/src/__tests__/reviewInvitations.test.jsx` (nuevo, 5 pruebas), `apps/web/e2e/synthetic/backend.cjs` (RLS y GRANT por columnas de reseñas, PATCH de moderación, entrega sintética etiquetada, RPC espejo), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 26).
- Pruebas (ejecutadas aquí): `run_local.sh` pgTAP 374/374 (14 archivos), concurrencia 12/12, determinismo OK (dos veces); `migrations_policy.sh` OK; `pnpm test:unit` 397/397 (38 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26 en 2 ejecuciones.
- Errores pendientes: ninguno nuevo. Nota: cualquier cliente que lea `product_reviews` con `select=*` recibirá 42501 (ninguno del repositorio lo hace; ver D48).
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`, `20261111140000`, `20261111160000`, `20261111180000` y `20261111200000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(y) de Pendiente (contador de reseñas pendientes en el menú del admin y filtro por producto en `/admin/reviews`).

## Ejecución 73 — 2026-11-11 20:12 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-ezmecf` (= main, `2661f2a`); se partió de la rama autorizada = remoto `3cb95a0`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(y) de Pendiente. `/admin/reviews`: filtro por producto, búsqueda sin tildes, contadores por estado, «Guardar respuesta» sin cambiar el estado, 0 filas afectadas = error, descarte de respuestas viejas; insignia de pendientes en el menú del admin.
- Archivos: `apps/web/src/services/reviewsAdminService.js` (nuevo), `apps/web/src/utils/reviewsAdmin.js` (nuevo), `apps/web/src/pages/admin/AdminReviewsPage.jsx`, `apps/web/src/layouts/AdminLayout.jsx`, `apps/web/src/__tests__/adminReviews.test.jsx` (nuevo, 11 pruebas), `apps/web/e2e/synthetic/backend.cjs` (embebido `products(name, slug)` en reseñas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 26 ampliado).
- Pruebas (ejecutadas aquí): 7 de las 11 pruebas nuevas fallan con el código anterior (`git stash`); `pnpm test:unit` 408/408 (39 archivos); ESLint `apps packages scripts` 0 errores y 0 avisos; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111200000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(z) de Pendiente (coherencia de productos archivados en `my_product_reviewables` y formulario de la ficha; luego insignia de pedidos por preparar).

## Ejecución 74 — 2026-11-11 21:15 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-3lynf0` (= main, `2661f2a`); se partió de la rama autorizada = remoto `cb1f6e6`, árbol limpio. `pnpm install --frozen-lockfile` OK. pgTAP/pg_cron/pg_prove instalados con apt; `run_local.sh` como usuario `postgres`.
- Tarea: punto 0(z) de Pendiente. `my_product_reviewables` listaba compras de productos archivados y `submit_product_review` aceptaba reseñas de ellos (invisibles en la tienda), mientras `my_review_invitations` ya los ocultaba.
- Archivos: `supabase/migrations/20261111220000_reviews_active_products.sql` (nuevo, solo `CREATE OR REPLACE` de las dos RPC), `supabase/tests/database/97_reviews_active_products.test.sql` (nuevo, 8 aserciones), `apps/web/src/services/reviewsService.js` (mensaje para `JM_PRODUCT_INACTIVE`), `apps/web/src/__tests__/productReviewForm.test.jsx` (+1 prueba), `apps/web/e2e/synthetic/backend.cjs` (espejo: solo productos activos).
- Pruebas (ejecutadas aquí): `run_local.sh` pgTAP 382/382 (15 archivos), concurrencia 12/12, determinismo OK; sin la migración, 4 de las 8 aserciones nuevas fallan; `migrations_policy.sh` (BASE_REF=origin/main) OK; `pnpm test:unit` 409/409 (39 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(aa) de Pendiente (insignia de pedidos pagados por preparar en el menú del admin).

## Ejecución 75 — 2026-11-11 22:15 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-2ho7pk` (= main, `2661f2a`); se partió de la rama autorizada = remoto `125cc9f`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(aa) de Pendiente. Insignia «N pedidos por preparar» (pedidos `paid`) en el menú del admin, con recuento al navegar, tras cambiar de estado y cada 60 s.
- Archivos: `apps/web/src/services/adminService.js` (`countOrdersToPrepare`, `ORDERS_CHANGED_EVENT`, `ORDERS_POLL_MS`; `transitionOrder` avisa tras éxito), `apps/web/src/layouts/AdminLayout.jsx`, `apps/web/src/__tests__/adminOrdersBadge.test.jsx` (nuevo, 8 pruebas), `apps/web/src/__tests__/adminReviews.test.jsx` (la última cabecera HEAD ya no es necesariamente la de reseñas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): 6 de las 8 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 417/417 (40 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ab) de Pendiente (enlace profundo `/admin/pedidos?estado=paid` y tarjeta «Por preparar» en el dashboard).

## Ejecución 76 — 2026-11-11 23:11 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-1x04ff` (= main, `2661f2a`); se partió de la rama autorizada = remoto `10648a7`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ab) de Pendiente. Pestaña de estado de `/admin/pedidos` en la URL (`?estado=`) y tarjeta «POR PREPARAR» del dashboard (pagados de cualquier fecha, enlazada a `?estado=paid`); la tarjeta anterior dependía del periodo y no enlazaba.
- Archivos: `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/pages/admin/AdminDashboardPage.jsx`, `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (nuevo, 6 pruebas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 6 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 423/423 (41 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ac) de Pendiente (tarjeta «ALERTAS» del dashboard enlazada a inventario con stock bajo y pedidos que requieren revisión).

## Ejecución 77 — 2026-11-12 00:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-4g7cup` (= main, `2661f2a`); se partió de la rama autorizada = remoto `580ab6f`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ac) de Pendiente. Filtro de stock en `/admin/inventario` (`?stock=alerta|agotado`), casilla «Solo los que requieren revisión» en `/admin/pedidos` (`?revision=1`, filtrada en la BD) y dos tarjetas del dashboard enlazadas («ALERTAS DE STOCK», «REQUIEREN REVISIÓN») en lugar de la tarjeta de texto «ALERTAS».
- Archivos: `apps/web/src/pages/admin/AdminInventoryPage.jsx`, `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/pages/admin/AdminDashboardPage.jsx`, `apps/web/src/__tests__/adminAlertsDeepLink.test.jsx` (nuevo, 8 pruebas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 8 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 431/431 (42 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. Detectado (no corregido, queda como 0(ad)): el KPI «ALERTAS STOCK BAJO» de `/admin/inventario` usa otra regla que el dashboard.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ad) de Pendiente (KPI del inventario como botones del filtro y misma regla de alerta que el dashboard).

## Ejecución 78 — 2026-11-12 01:14 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-dlgjpn` (= main, `2661f2a`); se partió de la rama autorizada = remoto `afcc106`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ad) de Pendiente. Tarjetas KPI de `/admin/inventario` («ALERTAS DE STOCK», «VARIANTES AGOTADAS») como botones del filtro `?stock=`, con la misma regla que el dashboard; «UNIDADES DISPONIBLES» sin negativos.
- Archivos: `apps/web/src/pages/admin/AdminInventoryPage.jsx`, `apps/web/src/__tests__/adminAlertsDeepLink.test.jsx` (3 pruebas nuevas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 3 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 434/434 (42 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ae) de Pendiente (`/admin/productos`: búsqueda sin tildes y por referencia, filtro y búsqueda en la URL).

## Ejecución 79 — 2026-11-12 02:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-0n2jk8` (= main, `2661f2a`); se partió de la rama autorizada = remoto `43586fb`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ae) de Pendiente. `/admin/productos`: búsqueda sin tildes/mayúsculas por nombre, slug, referencia y SKU; filtro de estado y búsqueda en la URL (`?estado=`, `?q=`); botones de estado con `aria-pressed`; valores inválidos de `?estado=` caen en «Todos».
- Archivos: `apps/web/src/pages/admin/AdminProductsPage.jsx`, `apps/web/src/__tests__/adminProductsSearch.test.jsx` (4 pruebas nuevas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 4 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 438/438 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(af) de Pendiente (búsqueda de `/admin/inventario` sin tildes y en `?q=`).

## Ejecución 80 — 2026-11-12 03:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-jbcwin` (= main, `2661f2a`); se partió de la rama autorizada = remoto `e7e04fc`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(af) de Pendiente. `/admin/inventario`: búsqueda sin tildes/mayúsculas por nombre, SKU, referencia y ubicación; búsqueda en la URL (`?q=`), combinable con `?stock=`.
- Archivos: `apps/web/src/pages/admin/AdminInventoryPage.jsx`, `apps/web/src/__tests__/adminAlertsDeepLink.test.jsx` (3 pruebas nuevas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 3 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 441/441 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ag) de Pendiente (búsqueda de `/admin/clientes` sin tildes y en `?q=`).

## Ejecución 81 — 2026-11-12 04:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-smzl19` (= main, `2661f2a`); se partió de la rama autorizada = remoto `0bf6f50`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ag) de Pendiente. `/admin/clientes`: búsqueda sin tildes/mayúsculas por nombre, correo, teléfono y ciudad; el teléfono coincide ignorando espacios, guiones y paréntesis; búsqueda (`?q=`) y rol (`?rol=`, valor desconocido → «Clientes») en la URL.
- Archivos: `apps/web/src/pages/admin/AdminCustomersPage.jsx`, `apps/web/src/__tests__/adminLists.test.jsx` (4 pruebas nuevas), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado, solo con el perfil admin porque los recorridos corren en paralelo).
- Pruebas (ejecutadas aquí): 3 de las 4 pruebas nuevas fallan sin el cambio (`git stash`; la 4.ª cubre el valor por defecto); `pnpm test:unit` 445/445 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26 (un primer intento falló porque el paso dependía de un cliente creado en otro recorrido paralelo; corregido). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ah) de Pendiente (búsqueda de `/admin/pedidos` en `?q=`).

## Ejecución 82 — 2026-11-12 05:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-ve8fxu` (= main, `2661f2a`); se partió de la rama autorizada = remoto `4d9bfc1`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ah) de Pendiente. `/admin/pedidos`: búsqueda en `?q=` (debounce de 300 ms antes de escribir la URL y consultar la BD; cambios externos de la URL se reflejan en el campo) y método de envío en `?envio=`; combinables con `?estado=` y `?revision=`.
- Archivos: `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (4 pruebas nuevas; el doble de Supabase ahora aplica `.or(ilike)`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado).
- Pruebas (ejecutadas aquí): las 4 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 449/449 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ai) de Pendiente (`?q=` en `/admin/reviews`, luego `/admin/boletin`).

## Ejecución 83 — 2026-11-12 06:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-tqx4c6` (= main, `2661f2a`); se partió de la rama autorizada = remoto `d362cfc`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ai) de Pendiente. `/admin/reviews`: pestaña de estado (`?estado=`, desconocido → «Pendiente», por defecto no se escribe), producto (`?producto=`) y búsqueda (`?q=`) en la URL. Un `?producto=` sin reseñas se descarta, pero solo cuando terminó la carga (antes la lista de productos está vacía y borraría un filtro válido).
- Archivos: `apps/web/src/pages/admin/AdminReviewsPage.jsx`, `apps/web/src/__tests__/adminReviews.test.jsx` (3 pruebas nuevas; la página se monta dentro de `MemoryRouter`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 26: URL con filtros y recarga).
- Pruebas (ejecutadas aquí): las 3 pruebas nuevas fallan sin el cambio (`git stash` de la página); `pnpm test:unit` 452/452 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(aj) de Pendiente (`?q=` en `/admin/boletin`).

## Ejecución 84 — 2026-11-12 07:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-yc75cu` (= main, `2661f2a`); se partió de la rama autorizada = remoto `e4ed682`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(aj) de Pendiente. `/admin/boletin`: búsqueda sin tildes/mayúsculas por correo y origen; búsqueda (`?q=`) y estado (`?estado=`, desconocido → «Activos», por defecto no se escribe) en la URL.
- Archivos: `apps/web/src/pages/admin/AdminNewsletterPage.jsx`, `apps/web/src/utils/newsletterAdmin.js`, `apps/web/src/__tests__/adminNewsletter.test.jsx` (3 pruebas nuevas; la página se monta en `MemoryRouter`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido del boletín: URL y recarga).
- Pruebas (ejecutadas aquí): las 3 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 455/455 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 26/26. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ak) de Pendiente (`/admin/descuentos`: búsqueda por código y filtro de estado en la URL).

## Ejecución 85 — 2026-11-12 08:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-tux3p6` (= main, `2661f2a`); se partió de la rama autorizada = remoto `8258743`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ak) de Pendiente. `/admin/descuentos`: búsqueda sin tildes/mayúsculas por código y descripción, filtro por estado calculado (mismas claves que la columna ESTADO), ambos en la URL (`?q=`, `?estado=`), contador «N de M» y mensaje de filtro vacío.
- Archivos: `apps/web/src/services/couponsAdminService.js` (`couponState` con `key`, `COUPON_STATUS_FILTERS`, `couponStatusFromParam`, `filterCoupons`), `apps/web/src/pages/admin/AdminDiscountsPage.jsx`, `apps/web/src/__tests__/adminCoupons.test.jsx` (5 pruebas nuevas; la página se monta en `MemoryRouter`), `apps/web/e2e/synthetic/backend.cjs` (2 cupones sembrados para el listado), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 27).
- Pruebas (ejecutadas aquí): las 5 pruebas nuevas fallan sin el cambio (`git stash` de página y servicio); `pnpm test:unit` 460/460 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 27/27 (un primer intento abortó porque el recorrido nuevo no recibía `browser`; corregido). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(al) de Pendiente (uso real de cada cupón en `/admin/descuentos` y confirmación al desactivar uno con usos).

## Ejecución 86 — 2026-11-12 09:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-lwiydh` (= main, `2661f2a`); se partió de la rama autorizada = remoto `f863626`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(al) de Pendiente. `/admin/descuentos`: uso real por cupón desde `coupon_redemptions` (descuento otorgado en pagados, «+N con pago pendiente») y confirmación antes de desactivar un cupón con usos.
- Archivos: `apps/web/src/services/couponsAdminService.js` (`summarizeRedemptions`, `couponUseCount`, `usage()`), `apps/web/src/pages/admin/AdminDiscountsPage.jsx`, `apps/web/src/__tests__/adminCoupons.test.jsx` (doble con `.in`; 5 pruebas nuevas de UI + 2 de funciones), `apps/web/e2e/synthetic/backend.cjs` (`coupon_redemptions` solo admin, 3 canjes de JM10), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 27 ampliado).
- Pruebas (ejecutadas aquí): 5 pruebas nuevas fallan sin el cambio (`git stash` de página y servicio); `pnpm test:unit` 466/466 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 27/27 (primer intento falló porque el manejador global de diálogos ya aceptaba el `confirm`; la prueba lo retira antes de cancelar). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(am) de Pendiente (`/admin/pedidos?cupon=` y enlace desde USOS de `/admin/descuentos`).

## Ejecución 87 — 2026-11-12 10:05 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-70uks8` (= main, `2661f2a`); se partió de la rama autorizada = remoto `59bc5da`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(am) de Pendiente. `/admin/pedidos?cupon=CODIGO` (filtro en la BD, chip para quitarlo) y enlace «Ver pedidos» desde USOS en `/admin/descuentos`.
- Archivos: `apps/web/src/utils/adminLists.js` (`couponFromParam`), `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/pages/admin/AdminDiscountsPage.jsx`, `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (3 pruebas), `apps/web/src/__tests__/adminCoupons.test.jsx` (1 prueba), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 27 ampliado).
- Pruebas (ejecutadas aquí): 3 de las 4 pruebas nuevas fallan sin el cambio (`git stash` de páginas y utils; la de código inválido pasa también sin él, por diseño); `pnpm test:unit` 470/470 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 27/27. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(an) de Pendiente (`/admin/clientes`: «Ver pedidos» por cliente → `/admin/pedidos?q=<correo>`).

## Ejecución 88 — 2026-11-12 11:09 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-v4hbmd` (= main, `2661f2a`); se partió de la rama autorizada = remoto `927d187`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(an) de Pendiente. «Ver pedidos (N)» por cliente en `/admin/clientes` → `/admin/pedidos?cliente=<id>` con la misma atribución que la lista (D59).
- Archivos: `apps/web/src/utils/adminLists.js` (`customerFromParam`, `customerOrdersFilter`, `combineOrFilters`), `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/pages/admin/AdminCustomersPage.jsx`, `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (3 pruebas), `apps/web/src/__tests__/adminLists.test.jsx` (2 pruebas), `apps/web/e2e/synthetic/backend.cjs` (árbol lógico `or/and`, ids UUID, fixture `/__synthetic-order`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 28).
- Pruebas (ejecutadas aquí): las 5 pruebas nuevas fallan sin el cambio (`git stash` de páginas y utils); `pnpm test:unit` 475/475 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 28/28 (primer intento 27/28: el recorrido creaba pedidos con `create_order` sobre una variante con stock 1 compartido entre recorridos → se usa un fixture sintético que no toca inventario). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No verificado contra PostgREST real el `or` anidado con valor entre comillas.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ao) de Pendiente (enlaces cruzados pedido ↔ cliente en el admin).

## Ejecución 89 — 2026-11-12 12:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-8c5wji` (= main, `2661f2a`); se partió de la rama autorizada = remoto `77a7e90`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ao) de Pendiente. Enlaces cruzados en el admin: detalle del pedido → cliente (ficha `?cliente=<id>` o búsqueda por correo para invitados) y ficha del cliente → cada pedido (`/admin/pedidos?q=<número>`) (D60).
- Archivos: `apps/web/src/utils/adminLists.js` (`customerLinkForOrder`, `orderLink`), `apps/web/src/pages/admin/AdminOrdersPage.jsx` (`user_id` en la selección, enlace en el detalle), `apps/web/src/pages/admin/AdminCustomersPage.jsx` (`?cliente=` abre la ficha, aviso si no existe, pedidos enlazados), `apps/web/src/__tests__/adminLists.test.jsx` (3 pruebas), `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (1 prueba), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 28 ampliado).
- Pruebas (ejecutadas aquí): las 4 pruebas nuevas fallan sin el cambio (`git stash` de páginas y utils); `pnpm test:unit` 479/479 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 28/28. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ap) de Pendiente (en el detalle del pedido, cupón → `/admin/descuentos?q=` y líneas → `/admin/productos?q=<sku>`).

## Ejecución 90 — 2026-11-12 13:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-u0fsa2` (= main, `2661f2a`); se partió de la rama autorizada = remoto `2b7a9e3`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ap) de Pendiente. Detalle del pedido en el admin: cupón → `/admin/descuentos?q=<código>`, SKU de cada línea → `/admin/productos?q=<sku>` (D61).
- Archivos: `apps/web/src/utils/adminLists.js` (`couponLink`, `productLinkForSku`), `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/__tests__/adminLists.test.jsx` (1 prueba), `apps/web/src/__tests__/adminOrdersDeepLink.test.jsx` (2 pruebas), `apps/web/e2e/synthetic/backend.cjs` (fixture con `coupon_code`/`sku`), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 27 ampliado).
- Pruebas (ejecutadas aquí): 2 de las 3 pruebas nuevas fallan sin el cambio (`git stash`; la tercera comprueba la ausencia de enlaces); `pnpm test:unit` 482/482 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 28/28 (intentos previos 27/28 por MI recorrido: sin pedidos con JM10 en el backend → fixture; lectura de la tabla antes de cargar → espera explícita). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(aq) de Pendiente (productos ↔ inventario: «Ver inventario» por producto y variante → producto).

## Ejecución 91 — 2026-11-12 14:09 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-3x1o5d` (= main, `2661f2a`); se partió de la rama autorizada = remoto `b3e534e`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(aq) de Pendiente. Enlaces productos ↔ inventario en el admin (D62).
- Archivos: `apps/web/src/utils/adminLists.js` (`inventoryLinkForProduct`), `apps/web/src/pages/admin/AdminProductsPage.jsx` (icono «Ver inventario»), `apps/web/src/pages/admin/AdminInventoryPage.jsx` (SKU enlazado), `apps/web/src/__tests__/adminLists.test.jsx`, `adminProductsSearch.test.jsx`, `adminAlertsDeepLink.test.jsx` (1 prueba cada uno), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 10 ampliado: SKU → producto → «Ver inventario»).
- Pruebas (ejecutadas aquí): las 3 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 485/485 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 28/28. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ar) de Pendiente (reseñas ↔ productos/clientes en el admin).

## Ejecución 92 — 2026-11-12 15:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-c49tmf` (= main, `2661f2a`); se partió de la rama autorizada = remoto `b25bf29`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ar) de Pendiente. Reseña → producto en `/admin/reviews` (D63); cliente → reseñas descartado por D48.
- Archivos: `apps/web/src/utils/adminLists.js` (`productLinkForReview`, `storefrontLinkForProduct`), `apps/web/src/pages/admin/AdminReviewsPage.jsx` (`ReviewProduct`), `apps/web/src/__tests__/adminReviews.test.jsx`, `apps/web/src/__tests__/adminLists.test.jsx` (1 prueba cada uno), `apps/web/e2e/e2e_synthetic.cjs` (recorrido 26 ampliado).
- Pruebas (ejecutadas aquí): las 2 pruebas nuevas fallan sin el cambio (`git stash`); `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 28/28. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(as) de Pendiente (recorrido E2E sintético móvil 375×812 catálogo → checkout).

## Ejecución 93 — 2026-11-12 16:09 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-f4daqc` (= main, `2661f2a`); se partió de la rama autorizada = remoto `7a5d089`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(as) de Pendiente. Recorrido E2E sintético móvil 375×812 portada → catálogo → producto → carrito → checkout, y corrección de los desbordes encontrados (D64).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 29, `assertNoHorizontalOverflow`, `assertTappable`, `journey` acepta opciones de contexto), `apps/web/src/pages/CatalogPage.jsx`, `apps/web/src/pages/CartPage.jsx`, `apps/web/src/components/Product/CompleteTheLook.jsx`.
- Pruebas (ejecutadas aquí): recorrido 29 falla sin los cambios de `src` (`git stash`: portada 377 px; antes de cada corrección: catálogo 392 px, carrito 555 px) y pasa 10/10 seguidas con ellos; `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 29/29. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni en dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(at) de Pendiente (recorrido móvil de cuenta, «Mis pedidos» y enlace de seguimiento).

## Ejecución 94 — 2026-11-12 17:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-4cqefx` (= main, `2661f2a`); se partió de la rama autorizada = remoto `40fb22a`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(at) de Pendiente. Recorrido E2E móvil 375×812 de cuenta, «Mis pedidos», detalle y enlace de seguimiento; corrección de lo encontrado (D65).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 30), `apps/web/src/pages/Login.jsx`, `apps/web/src/pages/AccountPage.jsx`.
- Pruebas (ejecutadas aquí): recorrido 30 falla sin los cambios de `src` (`git stash`: «Crear cuenta» de 18 px; antes de la 2.ª corrección: «Mis pedidos» 379 px) y pasa con ellos; `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 30/30. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(au) de Pendiente (recorrido móvil 375×812 del admin).

## Ejecución 95 — 2026-11-12 18:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-o69cju` (= main, `2661f2a`); se partió de la rama autorizada = remoto `53f615b`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(au) de Pendiente. Recorrido E2E móvil 375×812 del admin y corrección de lo encontrado (D66).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 31), `apps/web/src/pages/admin/AdminOrdersPage.jsx`, `apps/web/src/pages/admin/AdminInventoryPage.jsx`.
- Pruebas (ejecutadas aquí): recorrido 31 falla sin los cambios de `src` (`git stash`: «GESTIONAR» 28 px; antes de la 2.ª corrección: «Ajustar» 26 px) y pasa con ellos; `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 31/31. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(av) de Pendiente (recorrido móvil 375×812 del resto del admin).

## Ejecución 96 — 2026-11-12 19:17 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-qotrmj` (= main, `2661f2a`); se partió de la rama autorizada = remoto `acc3daf`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(av) de Pendiente. Recorrido E2E móvil 375×812 del resto del admin y sus modales, comprobando todos los controles visibles; corrección de lo encontrado (D67).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 32), `apps/web/src/pages/admin/AdminDiscountsPage.jsx`, `AdminReviewsPage.jsx`, `AdminNewsletterPage.jsx`, `AdminCollectionsPage.jsx`, `AdminSettingsPage.jsx`, `AdminEditorialImagesPage.jsx`, `AdminCustomersPage.jsx`.
- Pruebas (ejecutadas aquí): recorrido 32 falla sin los cambios de `src` (`git stash`: 29 fallos) y pasa con ellos; `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts` 0; `pnpm build` OK; `pnpm test:e2e-synthetic` 32/32. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(aw) de Pendiente (comprobación de todos los controles visibles en la tienda móvil).

## Ejecución 97 — 2026-11-12 20:18 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-g1zevv` (= main, `2661f2a`); se partió de la rama autorizada = remoto `1c3b8d1`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(aw) de Pendiente. Recorrido E2E móvil 375×812 de la tienda comprobando todos los controles visibles; corrección de lo encontrado (D68).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (helper `checkAllControls`, recorrido 33, aviso ESLint previo), `apps/web/e2e/synthetic/backend.cjs` (`wishlist_items`), `apps/web/src/index.css`, `components/Product/ProductCard.jsx`, `components/Product/VariantPicker.jsx`, `pages/HomePage.jsx`, `CatalogPage.jsx`, `ProductDetailPage.jsx`, `CartPage.jsx`, `AccountPage.jsx`, `WishlistPage.jsx`, `InfoPage.jsx`.
- Pruebas (ejecutadas aquí): recorrido 33 falla sin los cambios de `src` (`git stash`: 67 fallos) y pasa con ellos; `pnpm test:unit` 487/487 (43 archivos); ESLint `apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 33/33. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ax) de Pendiente (misma comprobación en páginas informativas, pie, confirmación, login/restablecer y ficha con reseñas).

## Ejecución 98 — 2026-11-12
- Estado inicial: rama `mission/m26-dev-qa-environments` en `906820c`, árbol limpio; ejecución 97 completada.
- Tarea: punto 0(ax) de Pendiente. Recorrido E2E móvil 34: todos los controles visibles de páginas informativas, pie, `/login`, `/cuenta/restablecer`, confirmación (pendiente y pagada) y ficha con reseña aprobada + formulario de reseña (D69).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 34), `apps/web/e2e/synthetic/backend.cjs` (fixture `/__synthetic-review`), `apps/web/src/components/Footer/Footer.jsx`, `apps/web/src/pages/OrderConfirmationPage.jsx`, `apps/web/src/components/Product/ProductReviewForm.jsx`.
- Pruebas (ejecutadas aquí): recorrido 34 falla sin los cambios de `src` (`git stash`: 23 fallos reales) y pasa con ellos; `pnpm test:unit` 487/487; `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 34/34. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ay) de Pendiente (`/admin/login`, 404/«No autorizado», confirmación rechazada/vencida, estados vacíos).

## Ejecución 99 — 2026-11-12 (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-wbs95z` (= main, `2661f2a`); se partió de la rama autorizada = remoto `bab5a67`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(ay) de Pendiente. Recorrido E2E móvil 35: todos los controles visibles de `/admin/login` (y tras credenciales erróneas), `/unauthorized`, ruta inexistente, confirmación (no encontrada, `?pago=error` con reintento, ventana vencida, vencido, cancelado), carrito vacío, búsqueda sin resultados, favoritos y pedidos vacíos, cliente que abre `/admin` (D70).
- Archivos: `apps/web/e2e/e2e_synthetic.cjs` (recorrido 35), `apps/web/e2e/synthetic/backend.cjs` (`/__synthetic-order` devuelve `public_token` y acepta `payment_expires_at`), `apps/web/src/pages/Unauthorized.jsx`, `apps/web/src/pages/OrderConfirmationPage.jsx`, `apps/web/src/pages/admin/AdminLogin.jsx`.
- Pruebas (ejecutadas aquí): recorrido 35 falla sin los cambios de `src` (`git stash`: 3 fallos reales) y pasa con ellos; `pnpm test:unit` 487/487 (43 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 35/35. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado en WebKit ni dispositivos reales.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(az) de Pendiente (teclado y foco en los modales de tienda y admin).

## Ejecución 100 — 2026-11-13 00:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-xwrz4i` (= main, `2661f2a`); se partió de la rama autorizada = remoto `34746a1`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(az) de Pendiente. Teclado en los modales de tienda y admin (D71).
- Archivos: nuevo `apps/web/src/components/Common/DialogPanel.jsx`, nuevo `apps/web/src/__tests__/dialogPanel.test.jsx`; `components/Header/Header.jsx`, `components/Modals/SizeGuideModal.jsx`, `FitGuideModal.jsx`, `SizeRecommenderModal.jsx`, `pages/CatalogPage.jsx`, `pages/ProductDetailPage.jsx`, `pages/admin/AdminOrdersPage.jsx`, `AdminCustomersPage.jsx`, `AdminDiscountsPage.jsx`, `AdminEditorialImagesPage.jsx`, `AdminSettingsPage.jsx`, `AdminCollectionsPage.jsx`; `apps/web/e2e/e2e_synthetic.cjs` (helper `checkDialogKeyboard`, recorrido 36).
- Pruebas (ejecutadas aquí): recorrido 36 falla sin los cambios de `src` (`git stash`) y pasa con ellos; `pnpm test:unit` 493/493 (44 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 36/36. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(ba) de Pendiente (cajón del menú del admin en móvil y modal «Confirmar restauración» con fixture).

## Ejecución 101 — 2026-11-13 01:20 UTC (rutina programada)
- Estado inicial: rama `mission/m26-dev-qa-environments` en `a770161`, árbol limpio (la sesión arrancó en `claude/gracious-pasteur-s65px5`; se trabajó en la rama autorizada por la misión).
- Tarea: punto 0(ba) de Pendiente. Cajón del menú del admin en móvil y modal «Confirmar restauración» con fixture (D72).
- Archivos: `apps/web/src/layouts/AdminLayout.jsx`; nuevo `apps/web/src/__tests__/adminDrawer.test.jsx`; `apps/web/e2e/synthetic/backend.cjs` (fixture `/__synthetic-site-content`, DELETE de `site_content` solo admin, `siteContent` en `/__state`); `apps/web/e2e/e2e_synthetic.cjs` (recorrido 37).
- Pruebas (ejecutadas aquí): `adminDrawer.test.jsx` 4/4 (4/4 fallan sin el cambio de `src`); recorrido 37 falla sin el cambio y pasa con él (3/3 aislado); `pnpm test:unit` 497/497 (45 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 37/37 (una primera pasada completa dio 36/37 por el recorrido 30, no tocado: `waitForURL` 30 s tras el registro móvil; 3/3 aislado y 37/37 en la pasada completa siguiente → intermitente, queda como pendiente 0(bb)). Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: intermitencia del recorrido 30. No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(bb) de Pendiente (intermitencia del recorrido 30; luego `aria-current`/foco en la navegación de la tienda).

## Ejecución 102 — 2026-11-13 02:40 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-9hrh45` (= main, `2661f2a`); se trabajó en la rama autorizada = remoto `54b349a`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(bb) de Pendiente. Intermitencia del recorrido 30 y `aria-current`/foco de la navegación de la tienda (D73).
- Archivos: nuevo `apps/web/src/components/Account/AccountSectionNav.jsx`, nuevo `apps/web/src/__tests__/storefrontNavCurrent.test.jsx`; `apps/web/src/utils/navTaxonomy.js` (`navCurrent`), `components/Header/Header.jsx`, `pages/AccountPage.jsx`, `pages/WishlistPage.jsx`; `apps/web/e2e/e2e_synthetic.cjs` (recorrido 38, diagnóstico del 30, esperas en los recorridos 17 y 37).
- Pruebas (ejecutadas aquí): recorrido 30: 9/9 aislado (8 con 4 procesos `yes` saturando la CPU) y 2 pasadas completas 37/37 ANTES de tocar nada → no reproducido; recorrido 38 falla sin los cambios de `src` y pasa con ellos; `storefrontNavCurrent.test.jsx` 5/5; `pnpm test:unit` 502/502 (46 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic`: 37/38 (recorrido 17, carrera de la prueba) → corregido, 5/5 aislado; luego 37/38 dos veces (recorrido 37, carrera de la prueba; 3/3 aislado) → corregido; final 38/38 en dos pasadas completas seguidas. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: intermitencia del recorrido 30 no reproducida (instrumentada). No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(bc) de Pendiente (enlace «Ir al contenido» y foco/anuncio al cambiar de ruta en la tienda; un `<h1>` por página).

## Ejecución 103 — 2026-11-13 03:10 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-24pe8v` (= main, `2661f2a`); se trabajó en la rama autorizada = remoto `7b0066b`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(bc) de Pendiente. «Ir al contenido», foco al cambiar de página y un `<h1>` por página en la tienda (D74).
- Archivos: nuevo `apps/web/src/components/Common/RouteFocus.jsx`, nuevo `apps/web/src/__tests__/routeFocus.test.jsx`; `apps/web/src/layouts/PublicLayout.jsx`, `apps/web/src/index.css` (`.jm-skip-link`, `.jm-sr-only`), `apps/web/src/pages/AccountPage.jsx`, `CheckoutPage.jsx`, `Login.jsx`; `apps/web/e2e/e2e_synthetic.cjs` (recorrido 39: primer Tab, foco tras navegar desde la cabecera y desde una tarjeta, `<h1>` único en 25 rutas).
- Pruebas (ejecutadas aquí): recorrido 39 falla sin los cambios de `src` (`git stash`: 6 fallos reales) y pasa con ellos; `routeFocus.test.jsx` 7/7; `pnpm test:unit` 509/509 (47 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 39/39 en la primera pasada completa. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(bd) de Pendiente (lo mismo en el admin).

## Ejecución 104 — 2026-11-13 04:00 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-70r1kj` (= main, `2661f2a`); se trabajó sobre la rama autorizada = remoto `5b74790`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(bd) de Pendiente. «Ir al contenido», foco al `<h1>` y un `<h1>` por página en el admin; además, el buscador de la cabecera del admin, que era decorativo, ahora funciona (D75).
- Archivos: nuevo `apps/web/src/components/Common/AdminGlobalSearch.jsx`, nuevo `apps/web/src/__tests__/adminGlobalSearch.test.jsx`; `apps/web/src/layouts/AdminLayout.jsx`, `apps/web/src/pages/admin/AdminLogin.jsx` (`<main>`), `apps/web/src/pages/admin/AdminProductFormPage.jsx` (`<h1>` mientras carga); `apps/web/e2e/e2e_synthetic.cjs` (recorrido 40).
- Pruebas (ejecutadas aquí): recorrido 40 falla sin los cambios de `src` (`git stash`) y pasa con ellos; `adminGlobalSearch.test.jsx` 6/6; `pnpm test:unit` 515/515 (48 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 40/40 en la primera pasada completa. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(be) de Pendiente (campana del admin: aviso real o retirarla; luego revisión de contraste/nombres accesibles).

## Ejecución 105 — 2026-11-13 05:00 UTC (rutina programada)
- Estado inicial: sesión en `claude/gracious-pasteur-wvbmik` (= main, `2661f2a`); se trabajó sobre la rama autorizada = remoto `e3a0679`, árbol limpio. `pnpm install --frozen-lockfile` OK.
- Tarea: punto 0(be) de Pendiente. La campana del admin pasa de decorativa a aviso real (D76).
- Archivos: nuevo `apps/web/src/components/Common/AdminNotifications.jsx`, nuevo `apps/web/src/__tests__/adminNotifications.test.jsx`; `apps/web/src/layouts/AdminLayout.jsx`; `apps/web/e2e/synthetic/backend.cjs` (`/__synthetic-review` acepta `status: 'pending'`); `apps/web/e2e/e2e_synthetic.cjs` (recorrido 41).
- Pruebas (ejecutadas aquí): recorrido 41 falló primero por un defecto real (panel 118 px fuera de la pantalla en móvil) → corregido; falla sin el cambio de `AdminLayout` (`git stash`) y pasa con él; `adminNotifications.test.jsx` 7/7 (la de integración falla sin el cambio); `pnpm test:unit` 522/522 (49 archivos); `pnpm exec eslint apps packages scripts --max-warnings 0` OK; `pnpm build` OK; `pnpm test:e2e-synthetic` 41/41 en la primera pasada completa. Sin migración: pgTAP no re-ejecutado.
- Errores pendientes: ninguno nuevo. No probado con lectores de pantalla reales ni en WebKit.
- Bloqueos reales (sin cambio): baseline M24 + migraciones `20261111120000`…`20261111220000` en Supabase QA, credenciales Wompi Sandbox, acceso/URL de Vercel Preview, decisión gitleaks, `e2e-supabase` en `ci-gate`.
- Notificación: no enviada (progreso rutinario; bloqueos ya notificados).
- Siguiente: punto 0(bf) de Pendiente (contraste y nombres accesibles en las rutas principales; `axe-core` NO está en el lockfile → sin dependencia nueva, comprobación propia en el E2E).

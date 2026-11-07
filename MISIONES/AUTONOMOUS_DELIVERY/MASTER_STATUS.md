# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-07 (ejecución 6, M35)
Rama autorizada: `mission/m26-dev-qa-environments`

## Continuidad
- Las ejecuciones 1–2 (M31.x) quedaron publicadas en GitHub (rama `mission/m26-dev-qa-environments`, `1cb1b4e`) y la ejecución 3 las recuperó desde un contenedor nuevo (arranque 05:36, distinto del 05:08): rama y HEAD idénticos al remoto, árbol limpio.
- Permisos: `.claude/settings.json` v2.1 permite solo `git push origin mission/m26-dev-qa-environments`. `main` protegida por el ruleset `PROTECT-MAIN-JM` (confirmado visualmente por el propietario).

## Estado verificado (ejecutado, no supuesto)
| Comprobación | Resultado |
|---|---|
| `pnpm build` | OK |
| ESLint (`apps packages scripts`, sin dist*) | 0 errores, 0 avisos |
| `pnpm test:unit` (vitest, jsdom) | **92/92** en 5 archivos: carrito 18, checkout 28, auth+rutas protegidas 23, pedidos/admin 17, utils 6 |
| `pnpm test:env` (node:test) | **142/142** (fallo de entorno corregido: ahora la CLI usa un envDir hermético) |
| `test-checkout-invariants.mjs` | 10/10 (nota: es un simulador; las pruebas reales son las de vitest) |
| BD local PostgreSQL 16 (`supabase/tests/run_local.sh`) | pgTAP 278/278, concurrencia 12/12, determinismo OK (ejecución 3) |
| **`pnpm test:e2e-synthetic`** (Chromium + Vite real + backend sintético) | **10/10 recorridos** |

Recorridos E2E: 1 catálogo/filtro · 2 producto, color, talla agotada · 3 carrito (límite de stock, persistencia, eliminar) · 4 cupón y envío · 5 checkout (validación, pedido, reserva de stock, carrito conservado sin pago) · 6 pedido pagado (webhook SINTÉTICO) · 7 sin stock al confirmar · 8 registro/logout/login/historial · 9 credenciales erróneas y rutas protegidas (cliente no entra al admin) · 10 admin: panel, ajuste de inventario, pedido pagado→procesando→enviado con guía.

Alcance honesto de los E2E: el backend (`apps/web/e2e/synthetic/backend.cjs`) es sintético y en memoria; emula Supabase con los contratos de la migración, NO prueba RLS, la BD real ni Wompi (eso lo cubren pgTAP y las pruebas de la ejecución 3). Wompi no está conectado: el pago no se simula como real; el paso «pagado» usa un endpoint sintético etiquetado como tal.

Defectos reales encontrados y corregidos en esta ejecución: (1) `applyCoupon` perdía el mensaje de error de red/servicio (doble traducción de `OrderError`) → ahora lo conserva; (2) etiquetas y botón del login casi invisibles (negro sobre tarjeta oscura) → contraste corregido; (3) `test:env` dependía de un `.env.local` ignorado → hermético.

## NO verificado
- Supabase local (`supabase start`): Docker sin demonio en este entorno (no hay `/var/run/docker.sock`).
- E2E contra Supabase REAL local (`e2e_checkout.cjs`, `e2e_admin.cjs`, …): requieren Docker. Los E2E sintéticos (arriba) los complementan, no los sustituyen.
- Wompi Sandbox real y Vercel Preview: faltan credenciales (ver abajo).

## Matriz de validación (qué se ejecutó y DÓNDE)
Fuente de «GitHub Actions»: jobs leídos en la API de Actions, ejecución nº 13 del workflow `ci` y nº 3 de `e2e-supabase`, ambas sobre el commit `cef5fe42` (hash remoto = HEAD de entonces): **todos los jobs en success, incluido `ci-gate`**.

| Componente | Local (este contenedor) | GitHub Actions | Supabase local (Docker) | Supabase QA remoto | Wompi Sandbox | Vercel Preview |
|---|---|---|---|---|---|---|
| Build, ESLint, tsc | ✔ | ✔ (`quality`, run 13) | — | — | — | — |
| 103 pruebas unitarias | ✔ 103/103 | ✔ (`quality`, run 13) | — | — | — | — |
| 142 pruebas de entorno + 23 de perfil QA | ✔ | ✔ (`quality`, run 13) | — | — | — | — |
| E2E sintético (backend en memoria, 10 recorridos) | ✔ 10/10 (también bajo carga) | ✔ run 13 (antes ✘ en runs 11–12 por carreras de MI prueba, corregidas) | — | — | — | — |
| PostgreSQL 16 + pgTAP (`db-local`) | ✔ 278/278 | ✔ runs 10–13 | — | — | — | — |
| Supabase oficial local: migraciones, `db reset`, pgTAP 290, 39 comprobaciones HTTP (auth/RLS/RPC), pedido+pago con handlers reales de Wompi, determinismo (`db-supabase`) | — | ✔ runs 10–13 | ✔ | — | — | — |
| **E2E de navegador con Supabase local REAL** (`e2e_site_content`, `e2e_wishlist`, `e2e_cart_variant`, `e2e_session`, `e2e_commercial`) | — | ✔ **2 ejecuciones verdes seguidas** (commits `0cd1867` y `cef5fe4`); la primera (`0a82bee`) falló 2 de 5 por el widget REAL de Wompi cargándose desde internet → dominio bloqueado en el job | ✔ | — | — | — |
| Webhook Wompi (timestamp, firma, idempotencia, rechazos) | ✔ 16/16 | ✔ (`quality` paso 14) | ✔ flujo real en `db-supabase` | — | ✘ no probado | — |
| Límite de tasa de `/api/wompi/signature` | ✔ 4 pruebas con el handler real | ✔ (vitest en `quality`) | — | — | — | — |
| Supabase QA remoto (`yomgxdjgfjnrjaqiarvw`) | ✘ | ✘ | — | ✘ **NO VALIDADO** | — | — |
| Wompi Sandbox real | ✘ | ✘ | — | — | ✘ **NO VALIDADO** | — |
| Vercel Preview (`jym-web`) | ✘ | ✘ | — | — | — | ✘ **NO VALIDADO** |

Reglas de gobernanza del CI: `e2e-supabase` NO es parte de `ci-gate`; candidato a hacerlo tras ≥3 ejecuciones verdes consecutivas (lleva 2). Un commit de esta misión (`0a82bee`, mensaje con coma en el ámbito) y otro (`0cd1867`, descripción de 107 caracteres) incumplen la convención; ya están publicados y su job `governance` falló solo en esas ejecuciones; un PR hacia `main` los marcará salvo título/squash conforme.

Flakiness conocida y mitigada (M35): el job `quality` se colgó >12 min en 2 de 4 ejecuciones. Causa localizada: el build de Vite lanzado con `spawnSync` sin límite de tiempo en `scripts/env/deploy_build.test.mjs` (y en `qa_build.test.mjs`); reproducido en local bajo carga de CPU. Mitigación: límite de 90 s/150 s con un reintento solo ante timeout + `--test-timeout=300000`. Verificada localmente (23/23 bajo carga); **pendiente de confirmar en GitHub tras el próximo push**.

## Wompi Sandbox y Vercel Preview
Revisión de Wompi: `WOMPI_REVIEW.md` (13/13 pruebas del webhook hoy). Lista de comprobaciones del propietario: `OWNER_CHECKLIST.md`. Vercel `jym-web` (root `apps/web`): sin acceso a Vercel desde el agente (`vercel` denegado); configuración y guardas descritas en `MISION_26/08_T8_GUIA_QA.md` y `OWNER_STEPS.md`; el host de QA ya está en la lista de permitidos. No se desplegó nada.
Pasos exactos y variables (sin valores) en `OWNER_STEPS.md`. Bloqueado hasta que el propietario cargue credenciales QA/Sandbox.

## Pendiente (prioridad)
1. Revisar la primera ejecución real del CI en GitHub (job `e2e-synthetic` y `quality` ampliado).
2. Cobertura de UI de páginas (Cart/Checkout con testing-library) y de `adminService.upsertProduct`/`productService.normalizeProduct`.
3. Job de CI que ejecute los E2E de navegador contra Supabase local real (`e2e_*.cjs`) tras `supabase start` en `db-supabase`.
4. Aviso `MODULE_TYPELESS_PACKAGE_JSON` de eslint.config.js.
5. Revisar UX: `alert()` nativo tras crear cuenta en `Login.jsx`.
6. Wompi Sandbox / Vercel Preview cuando existan credenciales.

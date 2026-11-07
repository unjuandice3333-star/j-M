# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-07 (ejecución 5, M34)
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

## CI (M34)
`.github/workflows/ci.yml` ahora incluye el job `e2e-synthetic` (Chromium + Vite + backend sintético, 10 recorridos) y `quality` ejecuta las 92 pruebas unitarias completas (`vitest run`, antes solo `packages`); `ci-gate` exige todos los jobs. Ya existían `db-local` (PostgreSQL 16 + pgTAP) y `db-supabase` (Supabase oficial local con Docker: migraciones, `db reset`, pgTAP 290, 39 comprobaciones HTTP de auth/RLS/RPC, flujo pedido+pago con los handlers reales de Wompi, determinismo). Verificado LOCALMENTE: etapa e2e-synthetic PASS (15 s), vitest 92/92, tsc OK, política de migraciones OK, `test:qa-build` 23/23. **El workflow NO se ha ejecutado aún en GitHub Actions** (el push lo dispara: revisar el resultado en la pestaña Actions). Exigirlo como check de PR a `main` es una configuración del ruleset que hace el propietario (añadir `ci-gate`).

Clasificación honesta de E2E: sintéticos = backend en memoria (10/10, CI); con Supabase REAL = scripts `apps/web/e2e/e2e_*.cjs` (manuales, requieren `supabase start`; NO ejecutados en este entorno por falta de Docker; sin job de CI todavía); con Wompi Sandbox = `wompi_sandbox.cjs` (NO ejecutado, faltan credenciales). Nada de lo que depende de Supabase real o Wompi se declara validado por E2E.

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

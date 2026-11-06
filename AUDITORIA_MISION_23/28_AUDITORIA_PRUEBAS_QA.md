# 28 — AUDITORÍA DE PRUEBAS Y CALIDAD · J&M FASHION STORE

**Repositorio:** `unjuandice3333-star/j-m` · `main` · `2661f2a`
**Regla aplicada:** solo se declara "verificado" lo que se ejecutó en esta auditoría con salida registrada. Todas las ejecuciones se hicieron en una **copia temporal** del repo (`git archive HEAD`) o en una **BD PostgreSQL local efímera**. Ninguna prueba tocó Supabase QA/Production, Vercel ni Wompi.

---

## 1. Inventario de pruebas existentes

| Archivo | Tipo declarado | ¿Ejecuta código real? | ¿Runner configurado? |
|---|---|---|---|
| `packages/utils/index.test.ts` | Unitaria (vitest) | Sí (`packages/utils/index.ts`) | **No**: `vitest` no está en dependencias |
| `apps/web/scripts/test-webhook-security.mjs` | Unitaria/contrato webhook Vercel | Sí (`api/wompi/webhook.js`), Supabase mockeado | No hay script npm; requiere `node --experimental-test-module-mocks` |
| `apps/web/scripts/test-edge-security.ts` | Unitaria/contrato Edge Function | Sí (`supabase/functions/wompi-webhook/index.ts`), Supabase y `serve` mockeados | No hay script; requiere Deno + `import-map-deno.json` |
| `apps/web/scripts/test-checkout-invariants.mjs` | "Invariantes de checkout" | **No**: reimplementa una copia simplificada del store dentro del test ("SIMULADOR DEL ESTADO DE ZUSTAND") | No hay script npm |

No existen: pruebas de componentes React, pruebas de integración contra BD, pruebas SQL (pgTAP), pruebas E2E de navegador, pruebas de carga, pruebas de accesibilidad, ni CI.

## 2. Ejecuciones realizadas en esta auditoría

| # | Comando (en copia temporal) | Resultado | Evidencia |
|---|---|---|---|
| Q1 | `pnpm install --frozen-lockfile` | OK (222 paquetes) | salida de consola |
| Q2 | `pnpm --filter @jm/web build` (sin variables) | **OK, exit 0**, 3,70 s; advertencia chunk 511,52 kB | salida de consola |
| Q3 | `node scripts/test-checkout-invariants.mjs` | 10/10 PASS — **sin valor de verificación** (no importa el código real) | consola |
| Q4 | `node --experimental-test-module-mocks scripts/test-webhook-security.mjs` | **FALLA** en Node 22.23: `does not provide an export named 'createClient'` (usa la opción `exports` de `mock.module`, no soportada en esta versión) | consola |
| Q4b | Igual que Q4 cambiando `exports:` → `namedExports:` **solo en la copia temporal** | 12/12 PASS (lógica del webhook Vercel con Supabase simulado) | consola |
| Q5 | `deno run --allow-env --allow-read --import-map=import-map-deno.json test-edge-security.ts` (Deno 2.9.6 instalado temporalmente) | 12/12 PASS (lógica Edge con Supabase simulado) | consola |
| Q6 | `pnpm lint` | **FALLA**: ESLint 9 sin `eslint.config.js` (`packages/ui`); `apps/web` no tiene script de lint | consola |
| Q7 | `tsc --noEmit -p packages/shared` | OK. La app web es JS: **no hay typecheck** de la aplicación | consola |
| Q8 | `vitest` (packages/utils) | **No ejecutable**: dependencia ausente | — |
| Q9 | Reconstrucción de BD desde migraciones (16) | **2 fallan** | `evidencias/rebuild_run1.txt` |
| Q10 | Pruebas funcionales SQL T1–T16 | Ver tabla 3 | `evidencias/runtime_tests_output.txt` |
| Q11 | Sondeo de navegador (Playwright/Chromium) sobre el build | Ver tabla 4 | `evidencias/e2e_probe_output.json`, `evidencias/capturas/` |

## 3. Resultados de pruebas SQL (BD local)

| Prueba | Esperado | Obtenido |
|---|---|---|
| T1 Checkout anon con precio manipulado | Total y líneas desde BD | Total OK (200.000); **líneas con precio 1** |
| T2 `p_user_id` arbitrario | Ignorado / `auth.uid()` | Aceptado (falla solo por FK si el UUID no existe) |
| T3 Cupón inexistente | Error explícito | Ignorado en silencio |
| T4 Pedido → `paid` (como webhook) | Descuenta stock | **ERROR** `v_order` sin `branch_id`; stock sin cambios; update revertido |
| T5b `update_order_status_oms` | Transición | **ERROR** enum `packed` |
| T6 Estado `preparing` (UI admin) | Transición | **ERROR** enum |
| T7 `get_order_status` (confirmación) | Estado del pedido | **Función inexistente** |
| T8 Columnas `style_line_id/slug/images/branch_id` | Existen | **No existen** |
| T9 Anon lee pedidos | Solo el suyo | 0 filas (página de confirmación de invitado sin datos) |
| T10 Cliente lee pedidos | Solo los suyos | **Ve todos** |
| T11 Anon INSERT directo `status='paid'` | Rechazo | **Aceptado** |
| T12 Subtotal pedido vs suma de líneas | Iguales | **Distintos** (100.000 vs 129.900) |
| T13 Anon lista cupones/inventario | Restringido | Lista cupones activos e inventario |
| T14 Cliente ve ítems de su pedido | Sí | **0 filas** (sin política SELECT) |
| T15 Cliente se asigna rol admin | Rechazo | Rechazado ✔ |
| T16 Cliente modifica `payment_transactions` | Rechazo | **Aceptado** (status → APPROVED) |
| Métricas dashboard | Datos | **ERROR** enum `packed` |

## 4. Resultados de navegador (build local)

| Caso | Resultado |
|---|---|
| Build sin variables `VITE_SUPABASE_*` | Pantalla en blanco; error no capturado por `ErrorBoundary` |
| Supabase inalcanzable | Catálogo muestra **18 productos mock** sin aviso |
| `/producto/x-no-existe` | Muestra otro producto (no 404) |
| `/admin` sin sesión | Redirige a `/admin/login` ✔ |
| Móvil (iPhone 13) | Sin scroll horizontal ✔; logo recortado; botón WhatsApp tapa barra inferior; contador de favoritos = 2 en visitante nuevo |

## 5. Estado por área de calidad

| Área | Estado |
|---|---|
| Pruebas unitarias | PRESENTA ERRORES (no ejecutables tal cual) |
| Pruebas de integración (BD/API) | NO IMPLEMENTADO |
| Pruebas E2E | NO IMPLEMENTADO |
| Scripts de validación | PARCIALMENTE IMPLEMENTADO (webhook: válidos con mocks; checkout: simulado) |
| Build | IMPLEMENTADO Y VERIFICADO |
| Typecheck | PARCIALMENTE IMPLEMENTADO (solo `packages/shared`) |
| Lint | PRESENTA ERRORES |
| Automatización de navegador | NO IMPLEMENTADO (solo el sondeo de esta auditoría) |
| Flujo de compra completo | NO IMPLEMENTADO como prueba; **evidencia de fallo** en paso pago→inventario |
| Flujos administrativos | NO IMPLEMENTADO como prueba; **evidencia de fallo** en OMS, métricas, productos |
| CI | NO IMPLEMENTADO |

## 6. Afirmaciones previas del repo no respaldadas por evidencia

| Documento | Afirmación | Realidad verificada |
|---|---|---|
| `FINAL_PRODUCTION_AUDIT.md` | "PRODUCTION VERIFIED" | Migraciones no reconstruyen; pago→inventario falla |
| `GO_LIVE_REPORT.md` | "15 PASS, 0 BLOCKER" | No hay suite de 15 pruebas en el repo |
| `docs/ECOMMERCE_DATABASE_TEST_REPORT.md` | "12 PASS, 0 errores", "stock se descuenta al aprobar" | T4 falla |
| `PRODUCTION_ACTIVATION_REPORT.md` | "Ninguno [riesgo] a nivel de arquitectura o código" | Ver docs 24–26 |
| `test-checkout-invariants.mjs` | "Valida los 10 escenarios" | Prueba una copia del store, no el código |

**Recomendación:** marcar esos documentos como históricos/no confiables o eliminarlos, para que los agentes no los tomen como verdad.

## 7. Pruebas que deben construirse (prioridad)

| P | Suite | Herramienta | Contenido mínimo |
|---|---|---|---|
| P0 | Reconstrucción de BD | Supabase CLI / psql en CI | `db reset` sin errores |
| P0 | SQL de negocio | pgTAP | checkout, idempotencia, cupones, pago→inventario, cancelación→restauración, concurrencia (2 sesiones, 1 unidad), OMS |
| P0 | RLS por rol | pgTAP | anon / cliente / admin / super_admin / service_role en cada tabla |
| P0 | E2E compra | Playwright vs Preview+QA | catálogo → variante → carrito → checkout → Wompi Sandbox (aprobado, rechazado) → confirmación → cuenta |
| P1 | Webhook integración | Node/Deno + BD QA local | eventos firmados reales de Sandbox reproducidos contra BD |
| P1 | E2E admin | Playwright | crear producto+variantes+imágenes, ajustar stock, cambiar estado con guía |
| P1 | Unitarias store/servicios | Vitest + Testing Library | `addItem` (resolución de variante), totales, cupones |
| P2 | Visual/responsive | Playwright screenshots 360/390/768/1366 | sin solapamientos |
| P2 | Accesibilidad | axe-core en Playwright | 0 violaciones críticas |
| P2 | Rendimiento | Lighthouse CI | presupuestos de bundle e imágenes |

## 8. Criterio de "módulo terminado" para la fábrica
Un módulo solo se considera terminado si: (1) su suite automatizada existe y está en CI, (2) pasa en BD reconstruida desde cero, (3) pasa E2E en entorno QA con evidencia (capturas/trazas/IDs), (4) fue revisado por un agente distinto al que lo implementó, y (5) no introduce mocks en el bundle de producción.

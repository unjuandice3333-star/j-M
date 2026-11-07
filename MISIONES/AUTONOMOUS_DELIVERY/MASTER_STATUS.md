# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-07 (ejecución 4, M33)
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

## Wompi Sandbox y Vercel Preview
Pasos exactos y variables (sin valores) en `OWNER_STEPS.md`. Bloqueado hasta que el propietario cargue credenciales QA/Sandbox.

## Pendiente (prioridad)
1. Añadir `pnpm test:unit` y `pnpm test:e2e-synthetic` al CI (`.github/workflows/ci.yml`; requiere instalar Chromium en el runner).
2. Cobertura de UI de páginas (Cart/Checkout con testing-library) y de `adminService.upsertProduct`/`productService.normalizeProduct`.
3. E2E contra Supabase real local en CI (Docker en GitHub Actions) para RLS y pagos con webhooks firmados.
4. Aviso `MODULE_TYPELESS_PACKAGE_JSON` de eslint.config.js.
5. Revisar UX: `alert()` nativo tras crear cuenta en `Login.jsx`.
6. Wompi Sandbox / Vercel Preview cuando existan credenciales.

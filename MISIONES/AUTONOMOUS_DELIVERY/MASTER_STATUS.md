# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-09

## Rama
La misión nombra `mission/m26-dev-qa-environments`, pero esa rama no existe en el repo y la sesión
programada fija `claude/gracious-pasteur-inoz2c` como única rama de push. Se trabaja en esta última (ver DECISIONS.md D-001).

## Hecho (verificado)
- `pnpm install --frozen-lockfile` + `pnpm build` (apps/web) funcionan localmente (2026-11-09).
- Webhook Wompi y firma de integridad: endurecidos en commits previos; ahora cubiertos por 16 tests vitest (`pnpm --filter @jm/web test`).
- Carrito del storefront: `eCommerceStore` ya es persistente (zustand persist + carts server-side). `cartStore.js` es legado POS, no usado por la tienda.

## Pendiente (prioridad)
1. Tests de `eCommerceStore` (carrito/variantes/stock) y de `productService`.
2. Auditar flujo checkout → pedido → Wompi redirect contra migraciones (sin repetir auditorías de seguridad ya hechas).
3. Auth: tests de AuthGuard/roles.
4. Admin: verificar productos/inventario/pedidos/cupones funcionales.
5. GitHub Actions CI (install, test, build) — no existe aún.
6. E2E (Playwright) con Supabase mockeado.
7. QA env / Vercel Preview: requiere credenciales (bloqueo humano; ver abajo).

## Bloqueos reales
- Vercel Preview / Supabase QA / Wompi Sandbox reales requieren credenciales no disponibles en esta sesión.

## Siguiente tarea
Agregar workflow CI en `.github/workflows/ci.yml` y tests de `eCommerceStore`.

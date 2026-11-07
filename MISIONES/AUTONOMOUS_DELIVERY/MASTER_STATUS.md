# MASTER STATUS — J&M Autonomous Delivery
Actualizado: 2026-11-07

## Estado verificado
- `pnpm install --frozen-lockfile` OK; `pnpm build` (apps/web) OK (reproducible local).
- `pnpm test` (vitest): 16 tests OK (utils, cartStore, firma de integridad Wompi).
- CI: `.github/workflows/ci.yml` creado (no verificado en GitHub aún).

## Pendiente (prioridad)
1. Tests de webhook Wompi (firma checksum, reconciliación, idempotencia) — `apps/web/api/wompi/webhook.js`.
2. Revisar stock/variantes en el carrito de tienda (cartStore.addToCart no valida stock; confirmar si el carrito storefront usa eCommerceStore).
3. Verificar RLS (supabase/migrations) con pruebas.
4. E2E con Playwright (requiere env Supabase QA).
5. Vercel Preview (requiere credenciales/proyecto: bloqueo externo).

## Bloqueos
- Rama autorizada `mission/m26-dev-qa-environments` no existe en el remoto; se trabaja en `claude/gracious-pasteur-6vl8yx` (rama asignada por la sesión).
- Sin credenciales Supabase/Wompi/Vercel en el entorno: no se pueden probar flujos reales.

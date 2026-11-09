# MASTER STATUS — J&M Autonomous Delivery
Actualizado: 2026-11-09

## Hecho
- Build local reproducible: `pnpm install --frozen-lockfile && pnpm --filter @jm/web build` OK.
- Tests web: `pnpm --filter @jm/web test` (vitest, 10 tests: carrito storefront + endpoint firma Wompi). Pasan.
- Fix: `addItem` ya no muta el estado persistido.
- Commits previos en la rama: hardening Wompi webhook/firma, RLS/auth, checkout conserva carrito hasta pago.

## Pendiente (prioridad)
1. Tests del webhook Wompi (`apps/web/api/wompi/webhook.js`): firma inválida, evento duplicado, transiciones de estado.
2. Tests de checkout/stock (stores + RPC).
3. Revisar RLS en `supabase/migrations` (verificación real requiere proyecto QA/credenciales).
4. GitHub Actions: CI con build + test.
5. Vercel Preview (requiere credenciales/proyecto: bloqueo externo).
6. Panel admin: revisión funcional.
7. `src/store/cartStore.js` es código muerto (no importado) — evaluar eliminar.

## Bloqueos
- Rama `mission/m26-dev-qa-environments` no existe; se trabaja en `claude/gracious-pasteur-haho74` (rama asignada por el entorno).
- Sin credenciales Supabase/Wompi/Vercel en el entorno: no se pueden validar E2E ni desplegar Preview.

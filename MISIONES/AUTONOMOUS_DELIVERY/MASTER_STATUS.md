# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-08

## Verificado (ejecutado)
- `pnpm install --frozen-lockfile` OK (reconstrucción local reproducible).
- `pnpm build` OK (Vite 5, postbuild OK).
- `pnpm --filter @jm/web test` OK: 13/13 pruebas del webhook Wompi (firma, monto, moneda, idempotencia, anti-secuestro, 404).

## Pendiente (prioridad)
1. Pruebas de `api/wompi/signature.js` (mock Supabase) y flujo checkout/carrito.
2. Suite E2E (Playwright preinstalado) contra `vite preview` con Supabase mock/QA.
3. Revisión RLS/permisos con migraciones en `supabase/` (sin tocar remoto).
4. Admin: verificar inventario/pedidos/cupones.
5. Vercel Preview + informe final (requiere credenciales del propietario).

## Bloqueos reales
- Rama `mission/m26-dev-qa-environments` no existe en el repo; se trabajó en `claude/gracious-pasteur-tud0po` (rama designada por el entorno).
- Sin credenciales Supabase QA / Wompi Sandbox / Vercel en el entorno: pruebas contra servicios reales y deploy Preview pendientes.

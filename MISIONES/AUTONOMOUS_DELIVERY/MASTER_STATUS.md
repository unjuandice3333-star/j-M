# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-07

## Hecho y verificado
- `pnpm install --frozen-lockfile` + `pnpm build` (apps/web): OK, reproducible desde clon limpio.
- Webhook Wompi (`apps/web/api/wompi/webhook.js`): 12 pruebas Vitest pasan (firma, monto manipulado, idempotencia, anti-secuestro, DECLINED vs paid). Comando: `pnpm --filter @jm/web test`.

## Pendiente (prioridad)
1. Pruebas unitarias de `signature.js` y `cartStore.js` (persistencia, variantes, stock).
2. Revisar flujo checkout -> orden -> Wompi (Sandbox) end-to-end con mocks.
3. Auth cliente (registro/login/logout) y rutas protegidas: pruebas.
4. Admin: productos/inventario/pedidos — verificar contra RLS (`supabase/migrations`).
5. GitHub Actions CI (build + test) y Vercel Preview.
6. E2E Playwright contra `vite preview`.

## Bloqueos reales
- Sin credenciales Supabase/Wompi/Vercel en este entorno: no se puede validar Sandbox real ni desplegar Preview. Requiere al propietario aportar variables de entorno en Vercel (no en Git).
- La rama `mission/m26-dev-qa-environments` no existe en el remoto; la sesión opera en `claude/gracious-pasteur-rcelu1` (rama asignada por el harness).

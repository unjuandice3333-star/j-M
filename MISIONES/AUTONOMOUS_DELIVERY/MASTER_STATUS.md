# MASTER STATUS — J&M Autonomous Delivery
Rama de trabajo: `claude/gracious-pasteur-n55rsa` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; ver DECISIONS.md).

## Reproducible local (HECHO, 2026-11-09)
- `pnpm install --frozen-lockfile` OK; `pnpm build` OK (Vite 5).
- `pnpm --filter @jm/web test`: checkout invariants 10/10, webhook security 12/12.

## Pendiente (prioridad)
1. Revisar flujos reales: auth cliente, carrito/variantes/stock, checkout (código existe en apps/web/src).
2. Wompi Sandbox: validar con credenciales sandbox (requiere secretos del propietario en Vercel).
3. Panel admin: verificar inventario/pedidos/cupones.
4. RLS: revisar supabase/migrations contra políticas.
5. E2E (Playwright) y CI en GitHub Actions (no existe .github/workflows).
6. Vercel Preview (requiere credenciales/enlace del propietario).

## Bloqueos reales
- Vercel/Supabase/Wompi sandbox: credenciales no disponibles en el entorno.

# MASTER STATUS — J&M Autonomous Delivery
Última actualización: 2026-11-10 (ejecución 1)

## Hecho y verificado
- Instalación reproducible: `pnpm install --frozen-lockfile` OK.
- Build web: `pnpm build` OK (Vite 5, ~3 s).
- Tests: `pnpm test` (vitest) → 17/17 (6 utils + 11 Wompi webhook/firma, Supabase mockeado).
- Endurecimiento previo en historial: webhook Wompi (SEC-01/03), auth admin, RLS legacy, checkout conserva carrito hasta confirmar pago.
- CI GitHub Actions añadido (`.github/workflows/ci.yml`): install + test + build (aún no observado ejecutándose).

## Pendiente (orden de prioridad)
1. Tests unitarios de `cartStore` / `eCommerceStore` (persistencia, migración de carrito).
2. Lint (eslint) sin configurar para apps/web; añadir al CI.
3. E2E (Playwright) contra build local con Supabase mock/QA.
4. Verificar RLS con migraciones en `supabase/` (requiere instancia local/QA).
5. Panel admin: revisar inventario/pedidos.
6. Vercel Preview: requiere credenciales/proyecto (bloqueo externo).

## Bloqueos reales
- Sin credenciales Supabase QA / Wompi Sandbox / Vercel en este entorno → no se puede validar E2E real ni desplegar Preview.
- Rama: el prompt autoriza `mission/m26-dev-qa-environments`, pero la sesión fija `claude/gracious-pasteur-mm3kiv`; se trabaja en esta última (ver DECISIONS.md).

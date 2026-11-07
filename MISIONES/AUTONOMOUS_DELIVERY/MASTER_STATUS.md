# MASTER STATUS — J&M Autonomous Delivery
Última actualización: 2026-11-07

## Rama
Rama efectiva de trabajo: `claude/gracious-pasteur-3p4h23` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; ver DECISIONS.md D-001).

## Verificado (ejecutado)
- `pnpm install --frozen-lockfile` OK; `pnpm build` (apps/web) OK.
- `pnpm test` (vitest): 21/21 OK — webhook Wompi (firma, monto, idempotencia, anti-secuestro, estados), cartStore, utils.
- CI en GitHub Actions añadido (`.github/workflows/ci.yml`), aún sin ejecución confirmada.

## Pendiente (prioridad)
1. Tests de `api/wompi/signature.js` (mock supabase) y servicios de checkout.
2. Revisar flujo checkout/variantes/stock contra migraciones (stock atómico).
3. Auth: registro/login/logout — pruebas.
4. Panel admin: verificar rutas y permisos.
5. E2E con Playwright contra `vite preview` con Supabase mock/QA.
6. Vercel Preview: requiere credenciales/proyecto Vercel (BLOQUEO externo posible).
7. Wompi Sandbox real: requiere llaves sandbox (humano).

## Bloqueos
- Sin credenciales Supabase QA / Vercel / Wompi sandbox en el entorno: pruebas contra servicios reales no ejecutadas.

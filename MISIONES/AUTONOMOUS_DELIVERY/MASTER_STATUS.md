# MASTER STATUS — J&M Autonomous Delivery
Actualizado: 2026-11-10 (ejecución 1)

## Estado
- Rama de trabajo efectiva: `claude/gracious-pasteur-siwjll` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; el entorno exige esta rama).
- Build local reproducible: OK (`pnpm install --frozen-lockfile` + `apps/web npm run build`).
- Tests: `pnpm --filter @jm/web test` (4 tests de seguridad del webhook Wompi, pasan). CI en `.github/workflows/ci.yml` (no ejecutado aún en GitHub).
- Ya existente en commits: hardening webhook Wompi, auth admin, RLS, checkout con retry.

## Pendiente (prioridad)
1. Tests webhook con Supabase mockeado (idempotencia, monto, estados).
2. Tests de signature.js y store del carrito.
3. Verificar migraciones Supabase de forma local (requiere supabase CLI/Docker).
4. E2E Playwright sobre build local con datos mock.
5. Vercel Preview: requiere credenciales/enlace del propietario (bloqueo externo).

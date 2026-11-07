# MASTER STATUS — J&M Store (2026-11-07T12:08:55Z)

Branch: claude/gracious-pasteur-68rd6s (la rama `mission/m26-dev-qa-environments` no existe en el remoto; se usa la rama asignada por el entorno).

## Hecho
- Instalación reproducible: `pnpm install --frozen-lockfile` OK.
- Build: `pnpm --filter @jm/web build` OK.
- Tests (vitest, `pnpm --filter @jm/web test`): webhook Wompi (firma, monto, idempotencia, anti-secuestro), endpoint de firma de integridad, productUtils.

## Pendiente (prioridad)
1. Tests de cartStore/checkout (Zustand) y de flujos auth.
2. Verificar migraciones Supabase en local (requiere Docker/supabase CLI — no probado).
3. Tests RLS (SQL) y E2E con Playwright contra preview.
4. GitHub Actions: CI (install, build, test).
5. Vercel Preview: requiere credenciales/proyecto vinculado (BLOQUEO externo: token Vercel y variables Wompi Sandbox/Supabase QA).
6. Code-splitting del bundle (index 511 kB).

## Bloqueos reales
- Vercel Preview y Supabase QA requieren credenciales del propietario; no disponibles en esta sesión.

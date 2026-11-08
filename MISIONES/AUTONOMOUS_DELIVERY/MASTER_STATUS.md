# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-08 (ejecución 1)

## Rama
- Rama autorizada por la misión: `mission/m26-dev-qa-environments` (no existe en el remoto).
- Rama asignada por el entorno de ejecución: `claude/gracious-pasteur-2ouyqw` (se trabaja aquí). Ver DECISIONS.md D-001.

## Estado por prioridad
| # | Área | Estado |
|---|------|--------|
| 1 | Build local reproducible | HECHO: `pnpm install --frozen-lockfile && pnpm build` OK (Node 22, pnpm 11) |
| 8 | Pruebas | PARCIAL: `pnpm test` = checkout invariants 10/10 + webhook security 12/12. Sin E2E ni pruebas RLS |
| 10 | CI | Workflow `.github/workflows/ci.yml` creado (sin ejecutar aún en GitHub) |
| 2-7 | Funcionalidades | Código existente (catálogo, PDP, carrito, checkout, Wompi, admin). NO verificado en ejecución real |
| 9-10 | QA / Vercel Preview | PENDIENTE: requiere credenciales Vercel/Supabase QA (acción del propietario) |

## Pendiente próximo (orden)
1. Verificar flujo UI con Playwright contra mock (catálogo -> carrito -> checkout) — sin Supabase real.
2. Revisar migraciones Supabase (`supabase/migrations`) y escribir pruebas de RLS/permisos.
3. Revisar flujo de variantes/stock en `cartStore`/`productService`.
4. Verificar CI en GitHub Actions.
5. Bloqueo humano: credenciales Vercel + Supabase QA + llaves Wompi Sandbox para el Preview.

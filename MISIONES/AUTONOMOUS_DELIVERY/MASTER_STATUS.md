# MASTER STATUS — J&M Autonomous Delivery
Actualizado: 2026-11-07 (ejecución 1)

## Rama
La rama `mission/m26-dev-qa-environments` no existe en el remoto; el entorno asigna `claude/gracious-pasteur-bon1eq`. Se trabaja ahí (ver DECISIONS.md D-001).

## Estado verificado
- [x] `pnpm install --frozen-lockfile` + `pnpm build` reproducibles localmente (OK).
- [x] `pnpm test`: 18 tests pasan (12 Wompi signature/webhook, 6 utils).
- [x] CI GitHub Actions (`.github/workflows/ci.yml`): install, test, build (aún sin ejecutar en GitHub).
- [x] Webhook Wompi: firma, monto, idempotencia, anti-secuestro (cubierto con tests unitarios con Supabase mockeado).
- [ ] Sin verificar: flujo auth, carrito/checkout, admin, RLS (no hay tests; requiere Supabase QA).
- [ ] Vercel Preview: no desplegado; requiere credenciales/proyecto Vercel (bloqueo humano probable).

## Hallazgos pendientes
- `signature.js`: devuelve HTTP 444 si la orden no existe (usar 404); CORS `*`; fallback a anon key si falta service key.
- Bundle principal 511 kB (>500 kB): code-splitting de vendor.
- Sin tests E2E ni de componentes.

## Siguiente tarea
1. Corregir hallazgos de `signature.js` (444→404, quitar fallback anon) con tests.
2. Tests de stores Zustand (carrito, variantes/stock) con vitest + jsdom.
3. Revisar RLS en migraciones con script de verificación estático.
4. Playwright E2E del catálogo→carrito con build local.

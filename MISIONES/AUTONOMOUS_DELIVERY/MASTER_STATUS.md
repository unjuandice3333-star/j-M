# MASTER STATUS — J&M Autonomous Delivery
Última actualización: 2026-11-09 (ejecución #1)

Rama de trabajo efectiva: `claude/gracious-pasteur-5o8sgz` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; ver DECISIONS.md D-001).

## Hecho (verificado)
- [x] Build local reproducible: `pnpm install --frozen-lockfile && pnpm build` OK (Node 22, pnpm 11).
- [x] Harness de pruebas vitest en `apps/web/tests` — 16 tests pasan (webhook Wompi: firma, monto, idempotencia, anti-hijack; cartStore; productUtils).
- [x] Workflow CI `.github/workflows/ci.yml` (test + build). No ejecutado aún en GitHub.
- Previo (commits existentes): hardening webhook Wompi, auth admin, RLS legacy, checkout conserva carrito hasta confirmar pago.

## Pendiente (orden de prioridad)
1. Probar `api/wompi/signature.js` (tests unitarios) y revisar: usa `VITE_SUPABASE_ANON_KEY` como fallback de service key; CORS `*`; no valida que la orden esté pendiente.
2. Tests de RLS / migraciones Supabase (`supabase/`) — requiere instancia local o QA; verificar si hay CLI/Docker.
3. E2E Playwright (catálogo → carrito → checkout) contra mocks.
4. Revisar flujo auth cliente (registro/login/logout) y AccountPage.
5. Panel admin: inventario/pedidos/cupones (verificar completitud).
6. Entorno QA + Vercel Preview (requiere credenciales Vercel/Supabase QA/Wompi sandbox → bloqueo humano probable).

## Bloqueos
- Sin credenciales Vercel/Supabase QA/Wompi sandbox en este entorno: deploy Preview y pruebas de integración reales no ejecutables aún.

# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-08

## Verificado (ejecutado)
- `pnpm install --frozen-lockfile` OK; `pnpm build` OK (Vite 5, postbuild OK).
- `pnpm --filter @jm/web test` (vitest): 10/10 — cartStore (totales, IVA 19%, descuentos) y API Wompi (firma servidor, webhook: checksum, propiedades, monto).
- CI GitHub Actions añadido (`.github/workflows/ci.yml`): test + build. No ejecutado aún en GitHub.

## Existe en el código (no re-verificado en esta ejecución)
Catálogo, producto, carrito, checkout, cuenta, wishlist, admin (páginas en `apps/web/src/pages/admin`), api/wompi (signature, webhook), migraciones Supabase hasta 20261001.

## Pendiente (prioridad)
1. Tests de integración con Supabase local (RLS, RPC de pedidos/stock) — requiere Docker/supabase CLI.
2. Tests E2E Playwright (catálogo → carrito → checkout) contra build.
3. Revisar flujo variantes/stock en ProductDetailPage/CartPage.
4. Sandbox Wompi real: requiere credenciales (BLOQUEO humano).
5. Vercel Preview: requiere token/proyecto vinculado (BLOQUEO humano). Nunca Production.
6. Chunk principal 511 kB: code-splitting de vendors.

## Bloqueos reales
- Credenciales Wompi sandbox, Supabase QA y Vercel no disponibles en el entorno.
- Rama: la tarea nombra `mission/m26-dev-qa-environments` (no existe en remoto); la sesión restringe el push a `claude/gracious-pasteur-h3116k`. Se trabaja ahí.

## Siguiente tarea
Playwright E2E smoke con datos mock + tests de componentes del checkout.

# MASTER STATUS — J&M Autonomous Delivery
Actualizado: 2026-11-07

## Estado verificado
- `pnpm install --frozen-lockfile` + `pnpm build`: OK (Node 22, pnpm 11.0.8).
- `pnpm --filter @jm/web test` (vitest): 11/11 OK — webhook Wompi (firma, monto, moneda, anti-secuestro, fail-closed) y endpoint de firma de integridad.
- CI en GitHub Actions: `.github/workflows/ci.yml` creado (aún no ejecutado en remoto).
- Carrito de tienda persistente: `eCommerceStore` usa zustand `persist`; `cartStore.js` es legado POS.

## Pendiente (prioridad)
1. Ejecutar pruebas de `packages/utils` (index.test.ts existe, sin runner configurado).
2. Reconstrucción local de BD (supabase CLI/Postgres local aplicando migraciones) — no verificado.
3. Pruebas de flujo checkout/carrito/auth (unit + E2E Playwright).
4. Verificación RLS con Postgres local.
5. Wompi Sandbox end-to-end y Vercel Preview (requieren credenciales del propietario).

## Bloqueos reales
- Vercel Preview / Supabase QA / Wompi Sandbox: requieren credenciales; no disponibles en este entorno.

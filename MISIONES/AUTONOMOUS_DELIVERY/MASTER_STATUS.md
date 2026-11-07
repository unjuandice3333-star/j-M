# MASTER STATUS — J&M Autonomous Delivery

Rama de trabajo efectiva: `claude/gracious-pasteur-3ow4st` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; la sesión restringe el push a la rama claude/*).

## Verificado (ejecutado)
- `pnpm install --frozen-lockfile` OK; `pnpm build` OK (Vite 5, postbuild OK).
- `pnpm --filter @jm/web test`: checkout invariants 10/10, webhook security 12/12.

## Pendiente (por prioridad)
1. Lint (`pnpm lint`) y test unitario de packages/utils (no ejecutados).
2. Revisar flujos: auth cliente, carrito persistente, variantes/stock.
3. Panel admin (inventario, pedidos, cupones) - verificar contra Supabase.
4. E2E con Playwright (no existe aún).
5. GitHub Actions CI (build + test) — no existe `.github`.
6. Vercel Preview: requiere credenciales/autorización del propietario (bloqueo externo).
7. Wompi Sandbox end-to-end: requiere llaves sandbox del propietario.

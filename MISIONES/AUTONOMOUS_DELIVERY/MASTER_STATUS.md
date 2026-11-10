# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-10 (ejecución 1)

## Rama
La rama `mission/m26-dev-qa-environments` NO existe en el repo; la sesión programada trabaja en `claude/gracious-pasteur-sqyyq5` (ver DECISIONS.md D-001).

## Estado verificado (ejecutado)
- `pnpm install --frozen-lockfile`: OK
- `pnpm --filter @jm/web build`: OK (bundle principal 511 kB, warning de tamaño)
- `pnpm --filter @jm/web test` (vitest): 9/9 tests del webhook Wompi OK

## Estado NO verificado (no probado)
- Vercel Preview, Wompi Sandbox real, RLS contra DB real, E2E, panel admin, auth flows.
- No hay CI (`.github/` no existe).

## Observaciones
- `apps/web/src/store/cartStore.js` no es importado por ninguna página (código legacy POS); carrito de tienda vive en otro lado (verificar persistencia).

## Backlog priorizado
1. Revisar carrito de la tienda (persistencia, stock, variantes) y añadir tests.
2. Tests de `api/wompi/signature.js`.
3. GitHub Actions: install + build + test.
4. Revisión de RLS por migraciones (script/tests SQL).
5. Tests E2E con Playwright (catálogo → carrito → checkout con mocks).
6. Code-splitting del bundle (511 kB).
7. Vercel Preview (requiere credenciales del propietario).

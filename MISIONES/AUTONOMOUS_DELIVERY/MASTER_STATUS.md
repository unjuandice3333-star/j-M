# MASTER STATUS — J&M Autonomous Delivery
Updated: 2026-11-08

| Área | Estado | Evidencia |
|---|---|---|
| Build local reproducible | OK | `pnpm install --frozen-lockfile && pnpm build` (verificado) |
| Tests unitarios Wompi (webhook + firma) | OK, 12 tests | `pnpm --filter @jm/web test` |
| Carrito persistente (eCommerceStore, zustand persist) | Presente, sin test | — |
| Checkout / preservar carrito hasta pago | Implementado (commit 2661f2a) | sin E2E |
| Webhook Wompi hardened | Implementado, test de firma OK; ramas DB sin test | — |
| Admin (productos, inventario, pedidos, descuentos) | Páginas existen; sin verificar | — |
| RLS / seguridad | Hardening previo (2f25fdc); no verificado contra DB | — |
| E2E (Playwright) | PENDIENTE | — |
| Vercel Preview | PENDIENTE (requiere credenciales/proyecto) | — |

## Bloqueos reales
- No hay credenciales Supabase QA / Wompi sandbox / Vercel en este entorno.
- Rama `mission/m26-dev-qa-environments` no existe en remoto; el entorno restringe push a `claude/gracious-pasteur-kv0bwc`. Se trabaja ahí.

## Siguiente tarea
1. Tests del flujo de webhook con DB mockeada (APPROVED/DECLINED, idempotencia, monto distinto -> 422).
2. Tests de eCommerceStore (persistencia, variantes, stock).
3. Playwright smoke E2E contra `vite preview` con datos mock.
4. Workflow GitHub Actions: install + test + build.

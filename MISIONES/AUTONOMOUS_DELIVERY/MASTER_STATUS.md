# MASTER STATUS — J&M Autonomous Delivery
Última actualización: 2026-11-08

## Rama
Sesión programada fijada a `claude/gracious-pasteur-vwsjge` (la misión menciona `mission/m26-dev-qa-environments`, que no existe en el remoto; ver DECISIONS.md D-01).

## Estado por área
| Área | Estado | Evidencia |
|---|---|---|
| Build local reproducible | ✅ `pnpm install --frozen-lockfile && pnpm build` OK (Node 22, pnpm 11.0.8) | 2026-11-08 |
| Tests automatizados | ✅ 22 tests (Wompi signature 5, webhook 11, utils 6) con `pnpm test` | 2026-11-08 |
| CI GitHub Actions | 🟡 `.github/workflows/ci.yml` creado, aún no ejecutado en remoto | — |
| Catálogo/producto/carrito/checkout | 🟡 código existe; sin pruebas E2E ni verificación contra Supabase real | pendiente |
| Wompi Sandbox | 🟡 lógica de firma/webhook probada unitariamente (mock); sandbox real NO probado | pendiente credenciales |
| Admin | 🟡 código existe, no verificado | pendiente |
| RLS/seguridad | 🟡 migraciones de hardening existen; no verificadas contra DB | pendiente |
| Vercel Preview | ❌ no desplegado | requiere credenciales Vercel |

## Siguiente tarea
1. Tests unitarios de `cartStore` y `eCommerceStore` (variantes/stock/totales) con vitest + jsdom.
2. Ejecutar migraciones en Postgres local (si disponible) y probar RLS.
3. E2E Playwright del flujo catálogo→carrito→checkout con Supabase mockeado.
4. Revisar `apps/web/src/data/mockData.js` y fallback de catálogo.

## Bloqueos reales
- Credenciales Supabase QA, Wompi Sandbox y Vercel no disponibles en el entorno (no se verificó).

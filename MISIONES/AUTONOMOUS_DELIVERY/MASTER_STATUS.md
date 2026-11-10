# MASTER STATUS — J&M Autonomous Delivery

Última actualización: 2026-11-10

## Rama
La sesión programada opera en `claude/gracious-pasteur-q1u2gu` (la rama `mission/m26-dev-qa-environments` no existe en el remoto; ver DECISIONS.md D-001).

## Estado
| Área | Estado |
|---|---|
| Build local reproducible (`pnpm install --frozen-lockfile && pnpm --filter @jm/web build`) | OK (verificado) |
| Tests unitarios web (vitest, 12 tests: carrito + webhook Wompi) | OK (verificado) |
| CI GitHub Actions (test + build) | Creado, aún sin ejecutar en remoto |
| Webhook Wompi: firma, monto, idempotencia | Cubierto por tests con Supabase mockeado |
| Bug corregido: `addItem` mutaba items persistidos | Corregido |
| Tests de integración contra Supabase real / RLS | PENDIENTE (requiere proyecto QA/credenciales) |
| E2E (Playwright) | PENDIENTE |
| Admin (productos/inventario/pedidos/cupones) | Existe código; sin pruebas |
| Vercel Preview | PENDIENTE (requiere credenciales/token Vercel) |
| Wompi Sandbox end-to-end real | PENDIENTE (requiere llaves sandbox) |

## Siguiente tarea
1. Tests unitarios de `signature.js` (firma de integridad) y `productService`.
2. E2E Playwright con Supabase mockeado (catálogo → carrito → checkout).
3. Revisar flujo de checkout/cupones y admin.
4. Verificar resultado de CI en GitHub.

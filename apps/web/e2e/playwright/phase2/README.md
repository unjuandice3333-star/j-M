# Fase 2 de Playwright — recorridos preparados (sin implementar)

Orden sugerido y qué necesita cada uno. Los marcados «mutan» escriben en la BD: solo contra backend sintético, Supabase local o QA con cuentas de prueba dedicadas (nunca Production, nunca pagos reales).

| # | Recorrido | Muta datos | Requisitos |
|---|---|---|---|
| 1 | Registro y login/logout | Sí (usuario de prueba) | QA: correo de prueba y confirmación de correo desactivada o buzón de prueba; localmente ya cubierto por `e2e_synthetic.cjs` (recorrido 8) |
| 2 | Cuenta de cliente (datos, direcciones, favoritos) | Sí | usuario del punto 1; referencia: `e2e_wishlist.cjs` |
| 3 | Historial de pedidos | No | usuario con pedidos (seed de QA) |
| 4 | Checkout (crear pedido, **sin pagar**) | Sí (pedido + reserva de stock) | QA con limpieza; el pago queda «no disponible» o Wompi Sandbox |
| 5 | Wompi Sandbox (tarjeta de prueba aprobada/rechazada) | Sí | credenciales sandbox del propietario; `apps/web/e2e/wompi_sandbox.cjs` es la base. **Sin pagos reales** |
| 6 | Panel administrativo (acceso, dashboard) | No | usuario admin de QA creado por el propietario |
| 7 | Inventario (ajuste con motivo) | Sí | admin de QA + variante de prueba; revertir el ajuste al terminar |
| 8 | Gestión de pedidos (procesando → enviado con guía) | Sí | pedido de prueba pagado en QA |

Reutilizar `fixtures.js` (consola/red/errores) y `playwright.config.js`. Para los que mutan, añadir etiquetas `@mutating` y excluirlas del destino `preview` por defecto (`--grep-invert @mutating`).

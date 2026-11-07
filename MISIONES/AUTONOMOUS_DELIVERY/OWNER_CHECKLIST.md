# Flujos que debe comprobar el propietario en el Preview (no automatizados contra servicios reales)

Prerrequisitos: `OWNER_STEPS.md` completado (Supabase QA con la migración baseline, variables del Preview, Wompi Sandbox).
Referencia detallada de configuración: `MISION_26/08_T8_GUIA_QA.md`.

1. Abrir el Preview: portada y catálogo cargan productos de QA (no datos de ejemplo).
2. Producto: elegir color y talla; una combinación agotada no se puede añadir.
3. Carrito: cambiar cantidad (tope = stock), cambiar talla/color, recargar la página (se conserva).
4. Cupón: aplicar uno válido y uno inválido; ver total y envío gratis sobre $200.000.
5. Checkout como invitado y como cliente registrado: crear pedido; ver confirmación.
6. Pago con **tarjeta de prueba de Wompi Sandbox**: aprobada (pedido → pagado, carrito vacío), rechazada (el pedido sigue pendiente y se puede reintentar).
7. Verificar en Supabase QA que el webhook llegó (evento registrado una sola vez) y el stock bajó.
8. Cuenta: registro, cierre y nuevo inicio de sesión, historial de pedidos, recuperar contraseña (correo real).
9. Admin (usuario con rol admin creado por el propietario): panel, productos, ajuste de inventario con motivo, pedido pagado → procesando → enviado con guía.
10. Un usuario cliente NO puede abrir `/admin`.
11. Móvil (teléfono real): catálogo, producto, carrito y checkout legibles.
12. Confirmar que Production no cambió (ningún despliegue ni variable tocada).

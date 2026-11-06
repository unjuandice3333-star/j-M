# M30 — 05. Plan de pruebas comerciales en QA (12 recorridos M27/M28)

Se ejecuta **después** de la reconstrucción (03) y la configuración (04), contra QA, en navegador real (Chromium) con
`pnpm preview:qa` / `dev:qa` o la URL de Preview autorizada. Wompi solo en **Sandbox**.

## Datos de prueba (seeds de M24 tras el reset; sintéticos)
| Dato | Valor |
|---|---|
| Productos activos | 6; `polo-pique-ultima-unidad` con 1 unidad (concurrencia); `chaqueta-bomber` sin stock (agotado); 1 borrador y 1 archivado no visibles |
| Cupones | `QA10` (10 %), `QAFIJO20K` (mín. 100.000), `QAENVIO` (envío gratis, mín. 150.000), `QAEXPIRADO`, `QAFUTURO`, `QAAGOTADO`, `QAUNICO` (1 por correo) |
| Envío | estándar 15.000; gratis desde 200.000 (subtotal con descuento) |
| Cuentas | `admin@qa.jm.test` (admin), `cliente1@qa.jm.test` (con historial), `cliente2@qa.jm.test`; contraseñas fijadas por el propietario y pasadas a los scripts por variables de entorno |
| Cliente nuevo | `e2e.<sello>@qa.jm.test` (sello `E2E-<fecha>` en nombres de productos y cupones de prueba) |
| Pago | Tarjetas sandbox: aprobada `4242 4242 4242 4242`, rechazada `4111 1111 1111 1111`; Nequi aprobada `3991111111` (confirmar en los datos de prueba del panel sandbox) |

Limpieza al final: productos de prueba **archivados** y cupones desactivados desde el panel; nunca se borran pedidos.

## Adaptación de los scripts a QA (prerequisito, 2–3 h)
Los scripts de `apps/web/e2e/` están escritos para el stack local (`lib_local.cjs` aborta fuera de 127.0.0.1, fija
contraseñas con la API admin de GoTrue y consulta con `psql`). Variante `lib_target.cjs`:
- destino QA explícito (`yomgxdjgfjnrjaqiarvw`) con bloqueo de la referencia de Production;
- contraseñas desde variables de entorno del propietario (nunca se cambian por API);
- comprobaciones de BD con la API de solo lectura (`inventory.mjs`/consultas `SELECT`) en lugar de `psql`;
- pagos con `wompi_sandbox.cjs` y el widget real, no con eventos firmados localmente;
- `e2e_cart_variant.cjs` sin el precio especial temporal por SQL (se crea un producto de prueba con precios distintos por talla desde el panel).

## Recorridos
| # | Recorrido | Pasos | Resultado esperado | PASS si | FAIL si |
|---|---|---|---|---|---|
| 1 | Catálogo | Anónimo abre `/`, `/ropa`, filtros por categoría/ocasión, búsqueda | Solo los 6 activos; agotado marcado; imágenes de los seeds (URLs externas) y de `product-images` para los productos creados por el admin | Lista = productos activos en BD; 0 errores de consola | Aparece un borrador/archivado o un dato simulado |
| 2 | Detalle de producto | Abre una ficha, otra inexistente y la del borrador | Tallas y colores reales; reseñas aprobadas; «no encontrado» para inexistente/borrador | Datos = BD | Muestra otro producto como respaldo |
| 3 | Variantes y tallas | Cambia color y talla; talla agotada | Talla sin stock deshabilitada; cantidad máxima = disponible | No se puede añadir lo agotado | Se añade una variante sin stock |
| 4 | Carrito | Añade 2 productos, cambia cantidades, recarga, elimina | Totales de `quote_cart`; persistencia tras recargar | Total = cotización de la BD | Total local distinto de la BD |
| 5 | Cambio de variante | En el carrito cambia talla/color; caso sin stock; fusión de líneas | Cambio atómico; error sin tocar el carrito; fusión limitada al stock | Cantidades y precio correctos | Línea perdida o cantidad > stock |
| 6 | Cupones | `QA10`, `NOEXISTE`, `QAEXPIRADO`, `QAFUTURO`, `QAAGOTADO`, `QAFIJO20K` bajo el mínimo, `QAENVIO` | Mensajes de la BD; descuento y envío gratis correctos | 7/7 respuestas correctas | Cupón inválido aceptado |
| 7 | Registro e inicio de sesión | Registro (correo de confirmación por SMTP de QA), confirmación, login, logout, contraseña errónea, recuperación de contraseña, sesión vencida | Correos recibidos; mensajes en español; sesión persistente | Todo el ciclo completo | Correo no llega o redirección a `localhost` |
| 8 | Wishlist y sincronización | Favoritos sin sesión → login (fusión) → segundo navegador → quitar/añadir → logout | `wishlist_items` sin duplicados; otro cliente no ve la lista | Igual en ambos dispositivos | Duplicados o fuga entre cuentas |
| 9 | Checkout y pedido | Cliente nuevo con `QA10` (subtotal ≥ 200.000) y recurrente sin cupón; doble clic; sesión vencida en el checkout | 1 pedido por clic; pedido ligado a la cuenta; stock reservado | Pedido en «Pago pendiente» con totales de la BD | Pedido duplicado o huérfano |
| 10 | Pago Wompi Sandbox | Widget real: tarjeta aprobada; rechazada + reintento; Nequi; `wompi_sandbox.cjs CASE=approved/declined/nequi` | Firma de integridad aceptada por Wompi; transacción sandbox creada | Wompi acepta la firma; estados correctos | Firma rechazada o llave no sandbox |
| 11 | Confirmación y webhook | Esperar el evento de Wompi en la Edge Function; consultar `/checkout/confirmacion` | «Pago confirmado» solo tras el webhook; rechazado → pendiente con «Pagar ahora»; duplicado idempotente | Estado de la BD = Wompi; carrito vacío tras pagar | «Pagado» sin evento, o evento rechazado por firma |
| 12 | Administración | Admin: dashboard; crear producto con imagen (Storage) y tallas; ajustar inventario con motivo; pedidos preparación → enviado (guía) → entregado; clientes; cupón; cambio de portada (`site_content`); cliente intenta entrar al panel y llamar RPC admin | Cambios visibles para el cliente y otro navegador; cliente → 403 `JM_FORBIDDEN` | Todo reflejado en la BD y la tienda | Un cliente modifica algo de admin |

## Criterio global
QA queda **listo para pruebas comerciales** cuando los 12 recorridos están en PASS, sin errores de consola ni
peticiones fallidas propias, en escritorio y móvil (360 px). Cualquier FAIL se corrige en local, se vuelve a probar en
local y después en QA. El informe registra PASS/FAIL/BLOCKED/NOT TESTED por recorrido, con los pedidos de prueba
(números `JM-…`) y las transacciones sandbox (ids de Wompi) como evidencia.

# M27 — Ecommerce funcional de extremo a extremo: seguimiento y aceptación

**Estado:** desarrollo y pruebas LOCALES (stack Supabase local con la línea base M24 + navegador Chromium/Playwright).
Sin push, PR, merge ni despliegue. Sin acceso a Supabase QA/Production ni a Vercel. Sin migraciones nuevas: el esquema
M24 ya cubría el ecommerce; lo incompatible era el frontend. Cambios **sin commit** (base `e42ecae` + R1.1 pendiente).

## 1. Matriz de integración frontend ↔ backend (antes → ahora)
| Operación | Frontend | Antes (roto) | Ahora (contrato M24) | Estado |
|---|---|---|---|---|
| Listar catálogo | `productService.getProducts` | `products.deleted_at`, `variants→colors` (HTTP 400) y respaldo silencioso a productos simulados | `products` + `product_colors→colors` + `product_images` + `variants→sizes` + `v_variant_availability` + `v_product_rating` | PASS |
| Ficha de producto | `ProductDetailPage` | mostraba `products[0]` si no encontraba; tallas/colores por SKU; reseñas simuladas | slug exacto, variantes por color/talla con stock real, `product_reviews` aprobadas | PASS |
| Carrito | `eCommerceStore` | tablas `carts`/`cart_items` inexistentes; variante "aproximada" | carrito local persistente con `variant_id` real; reconciliación con el catálogo | PASS |
| Cupones | `applyCoupon` | códigos fijos en el código (`JM10OFF`) | `validate_coupon` / `quote_cart` | PASS |
| Totales | `getTotals` | cálculo local con reglas fijas | `quote_cart` (precios, descuento, envío y stock de la BD) | PASS |
| Crear pedido | `createOrder` | `create_online_order_validated_idempotent` (no existe) | `create_order` con clave de idempotencia por carrito | PASS |
| Consultar pedido | `OrderConfirmationPage` | `get_order_status` (no existe) | `get_order_public(número, token)` + consulta periódica | PASS |
| Cancelar pedido | Confirmación | — | `cancel_my_order` | PASS |
| Preparar pago | `/api/wompi/signature` | firmaba `order_number` sin crear intento ni validar token | `create_payment_attempt(id, token)` → referencia `JM-…-n`, monto de la BD | PASS (local) |
| Webhook de pago | `/api/wompi/webhook` y Edge | escribía columnas inexistentes | firma verificada + `apply_payment_event` (transaccional, idempotente) | PASS (local) |
| Mis pedidos | `AccountPage` | columnas inexistentes (`size`, `color`, `total`) | `online_orders` (RLS) + enlace con token | PASS |
| Dashboard admin | `AdminDashboardPage` | `get_commercial_dashboard_metrics` (no existe) + cifras inventadas | `admin_dashboard_metrics` | PASS |
| Crear/editar producto | `AdminProductFormPage` | colores libres, imágenes base64, sin referencia/slug | `admin_upsert_product` + Storage `product-images` + `admin_set_product_status` | PASS |
| Inventario | `AdminInventoryPage` | `adjust_inventory_stock` (no existe); sedes ficticias | `admin_adjust_inventory` con motivo | PASS |
| Pedidos admin | `AdminOrdersPage` | `update_order_status` (no existe); columnas inexistentes | `admin_transition_order` (transiciones de la BD, nota, guía) | PASS |
| Clientes | `AdminCustomersPage` | 0 compras para todos | `profiles` + `online_orders` + `customer_addresses` | PASS |
| Cupones admin | `AdminDiscountsPage` | 3 cupones simulados en memoria | tabla `coupons` (RLS admin) | PASS |
| Reseñas admin | `AdminReviewsPage` | reseñas simuladas | `product_reviews` (moderación) | PASS |
| Recuperar contraseña | `AccountPage` + `/cuenta/restablecer` | no existía | `resetPasswordForEmail` + `updateUser` | PASS |

## 2. Informe de aceptación (probado en navegador real salvo indicación)
| Funcionalidad | Estado | Evidencia |
|---|---|---|
| Catálogo conectado a datos reales (sin respaldo simulado) | PASS | 6 productos activos de la BD; sin red → aviso + "Reintentar", 0 productos simulados |
| Ficha: tallas, colores, stock, agotados, inexistente/borrador | PASS | `pdp.cjs`, `e2e_negative.cjs` |
| Búsqueda, filtros, orden, categorías | PASS (parcial) | filtros por categoría/ocasión con datos de la BD; búsqueda `/buscar?q=` sin errores. Sin prueba exhaustiva de cada combinación |
| Registro, login, logout, sesión persistente, contraseña incorrecta | PASS | `e2e_auth.cjs` |
| Recuperación de contraseña (correo + nueva contraseña) | PASS (local) | Mailpit local; en QA requiere configurar la URL de redirección en Supabase Auth |
| Carrito: añadir, cantidades, eliminar, persistencia, stock | PASS | `e2e_checkout.cjs`, `e2e_negative.cjs`, recorrido 2 |
| Cambiar variante dentro del carrito | NOT TESTED | acción `changeVariant` en el store; la interfaz del carrito no la expone |
| Cupones (válido, inválido, vencido, futuro, agotado, mínimo) | PASS | `e2e_negative.cjs` |
| Envío (tarifa y gratis desde el umbral de la BD) | PASS | totales de `quote_cart` en carrito y checkout |
| Checkout: validación, dirección, resumen, pedido | PASS | `e2e_checkout.cjs` |
| Pedido duplicado (doble clic) | PASS | 1 solo pedido creado |
| Stock insuficiente y concurrencia (última unidad) | PASS | el 2.º comprador recibe "Stock insuficiente" |
| Pago Wompi: intento, referencia, firma | PASS (local) | `test-payment-flow.mjs` 13/13 contra la BD local |
| Pago aprobado / rechazado / pendiente / reintento / idempotencia | PASS (local, eventos firmados localmente) | `test-payment-flow.mjs`; la confirmación solo muestra "pagado" cuando la BD lo marca |
| Wompi Sandbox real (widget, cobro sandbox, webhook enviado por Wompi) | **BLOCKED** | faltan llaves sandbox y acceso de red a Wompi en este entorno |
| Historial y detalle de pedidos del cliente; cancelación | PASS | `e2e_auth.cjs`, recorrido 2 |
| Panel: dashboard con datos reales | PASS | `e2e_admin.cjs` |
| Productos: crear, editar precio, imagen (Storage), tallas, stock inicial, publicar, archivar | PASS | `e2e_admin.cjs`, `cleanup_e2e.cjs` |
| Inventario con motivo y trazabilidad | PASS | `e2e_admin.cjs` |
| Pedidos: estados permitidos, guía, visible para el cliente | PASS | `e2e_orders_security.cjs` |
| Clientes: listado, búsqueda, detalle, historial | PASS (visual) | pantallas sin errores; búsqueda no automatizada |
| Cupones admin: crear, editar, activar/desactivar, uso en checkout | PASS | `e2e_admin.cjs` + `e2e_negative.cjs` |
| Seguridad: cliente no entra al panel ni ejecuta RPC admin; RLS | PASS | `e2e_orders_security.cjs` (403 JM_FORBIDDEN, filas ocultas, precio intacto) |
| Responsive (móvil y escritorio, tienda y panel) | PASS | `e2e_quality.cjs`: 0 desbordes; panel con menú ☰ en móvil |
| Errores de consola / peticiones fallidas | PASS | 0 en las rutas revisadas (las imágenes externas no cargan en este entorno: limitación de red) |
| Imágenes de portada editables (Imágenes Home) | FAIL (pendiente) | se guardan solo en el navegador del admin (localStorage), no en `site_content` |
| Lista de deseos | PASS (local) / pendiente sincronizar | se guarda en el navegador; la tabla `wishlist_items` no se usa todavía |
| Colecciones / looks | PASS (vacío) | se leen de `collections`; no hay looks cargados (no se muestra nada simulado) |
| Sesión vencida | NOT TESTED | supabase-js renueva el token; no se simuló la expiración |
| POS | Fuera de alcance | `create_sale_atomic` no existe en M24; no se confunde con el ecommerce |

## 3. Pruebas automatizadas
| Suite | Resultado |
|---|---|
| `test-webhook-security.mjs` (reescrita: contrato real) | 13/13 (mutación: firma desactivada → 2 fallos) |
| `test-edge-security.ts` (reescrita) + `test-edge-config.ts` | 10/10 · 30/30 |
| `test-payment-flow.mjs` (nueva, integración con BD local, en CI etapa 31) | 13/13 |
| Recorridos E2E (`apps/web/e2e/`, Playwright, manuales) | ver §2 |
| CI completa con etapas de BD (árbol con los cambios, sin commit) | **18/18 PASS** (31: pgTAP 290, HTTP 44/44, pedido y pago 13/13, determinismo 7/7) |
| Autoprueba de la compuerta | **90/90** |
| `test:env` · `test:qa-build` | 141/141 · 23/23 |

## 4. Pendientes y bloqueos
1. **Wompi Sandbox real:** el propietario debe aportar la llave pública y los secretos sandbox (integridad y eventos) y
   configurar el webhook sandbox; la fábrica no tiene red hacia Wompi. El flujo de nuestro lado está probado con eventos
   firmados localmente.
2. **QA remoto:** no configurado en esta sesión (lista de permitidos vacía y sin credenciales). Todo se probó en local.
3. **Imágenes Home y lista de deseos:** persistencia en el navegador; migrar a `site_content` y `wishlist_items`.
4. **Galería móvil de la ficha:** las miniaturas verticales ocupan ancho; mejora visual pendiente.
5. **R1.1 / R1.2:** la separación Preview/Production (sin commit) tiene hallazgos H1/H2/H5 pendientes de corrección.

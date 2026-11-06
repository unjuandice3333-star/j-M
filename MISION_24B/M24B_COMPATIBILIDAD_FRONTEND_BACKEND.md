# M24B — INCOMPATIBILIDADES CON EL FRONTEND Y BACKEND ACTUALES

**Alcance:** identificar los cambios necesarios. **No se modificó** `apps/web` ni `supabase/functions`.
**Conclusión:** el frontend y el backend actuales **no funcionan** sobre la nueva base. Es lo esperado: la base corrige contratos que eran incorrectos.

**No se debe aplicar la línea base a ningún entorno que sirva la aplicación actual** hasta completar la adaptación. Por eso la base vive en la rama `db/baseline-m24b` y se recomienda un QA-v2 nuevo.

---

## 1. Resumen por severidad

| Severidad | Nº | Significado |
|---|---|---|
| **Bloqueante** | 13 | Rompe compra, pago, catálogo o admin |
| **Alta** | 7 | Funcionalidad visible degradada o incorrecta |
| **Media** | 8 | Datos inventados, módulos simulados o limpieza necesaria |
| Compatible | 4 | Sin cambios o con ajustes menores (F9, F14, F15, A6) |

## 2. Backend (servidor)

| # | Archivo | Uso actual | Nuevo contrato | Severidad | Cambio requerido |
|---|---|---|---|---|---|
| B1 | `apps/web/api/wompi/signature.js` | Lee `online_orders(id, order_number, total)` y firma `order_number` + `total*100` | `create_payment_attempt(order_id, public_token)` devuelve `reference` (`JM-001234-N`) y `amount_in_cents` | **Bloqueante** | Llamar la RPC con `service_role` y firmar `reference + amount_in_cents + 'COP' + WOMPI_INTEGRITY_SECRET`. Recibir `order_id` + `public_token` del cliente. Eliminar el *fallback* a la anon key y el código HTTP 444 |
| B2 | `apps/web/api/wompi/webhook.js` | Busca pedido por `order_number`, hace UPSERT en `payment_transactions(transaction_reference, wompi_transaction_id, raw_response)` y UPDATE de `online_orders.status` | Columnas renombradas (`reference`, `provider_transaction_id`, `raw_last_event`). Escritura directa revocada. Lógica en `apply_payment_event(event, checksum)` | **Bloqueante** | Conservar solo la verificación de firma (que ya pasó 12/12 pruebas). Después llamar `apply_payment_event(payload, signature.checksum)` y mapear `result`: `applied` / `ignored` / `duplicate` → 200; `rejected` → 200 con registro, para que Wompi no reintente indefinidamente; excepción → 500 |
| B3 | `supabase/functions/wompi-webhook/index.ts` | Copia del webhook | Decisión M24B: **un solo webhook en Vercel** | Alta | Retirar o desactivar la Edge Function y su despliegue. Actualizar la URL de eventos en Wompi (acción humana, fuera de esta misión) |
| B4 | Programación de vencimientos | No existía | `expire_pending_orders()` vía pg_cron | Media | Si el proyecto no tiene pg_cron, usar Vercel Cron que llame la RPC con `service_role` cada 5 min |
| B5 | Variables de entorno | `VITE_SUPABASE_URL` reutilizada en el servidor | — | Media | Definir `SUPABASE_URL` (servidor) separada de `VITE_*`. Sin cambios de valores en esta misión |

## 3. Frontend — compra

| # | Archivo | Uso actual | Nuevo contrato | Severidad | Cambio requerido |
|---|---|---|---|---|---|
| F1 | `store/eCommerceStore.js` `createOrder` | `rpc('create_online_order_validated_idempotent', 13 params incl. p_user_id, items con name/price/size/color)` | `rpc('create_order', {p_customer, p_shipping, p_items:[{variant_id, quantity}], p_coupon_code, p_shipping_method, p_idempotency_key})` | **Bloqueante** | Reescribir la llamada. Guardar `order_id`, `order_number` y **`public_token`**. Mapear `error.hint` (`JM_*`) a mensajes de UI |
| F2 | `store/eCommerceStore.js` `getTotals` / `applyCoupon` | Totales en cliente; cupones fijos `JM10OFF` y `BIENVENIDO2026` | `quote_cart` y `validate_coupon` | **Bloqueante** (el total mostrado ≠ total cobrado) | Totales desde `quote_cart`. Eliminar la lista local de cupones |
| F3 | `CheckoutPage.jsx` | Opciones "Envío Expreso 24h" y "Contraentrega" | `express` inactivo; sin contraentrega | Alta | Ocultar ambas opciones. Leer métodos desde `shipping_methods` (solo activos) |
| F4 | `services/wompi.js` | Envía `reference` y `order_id` a `/api/wompi/signature`; `redirectUrl` con `orderId` | El intento devuelve la referencia | **Bloqueante** | Enviar `order_id` y `public_token`. `redirectUrl` = `/checkout/confirmacion?order=JM-001234&token=<public_token>`. Quitar la llave pública *hardcodeada* de respaldo |
| F5 | `OrderConfirmationPage.jsx` | SELECT a `online_orders` (+ `online_order_items`, `order_events`); `rpc('get_order_status')` inexistente; estados `preparing`, `declined`, `voided` | `get_order_public(order_number, public_token)`; anon sin acceso a tablas de pedidos | **Bloqueante** | Usar la RPC y las etiquetas de `get_order_status_catalog`. Sondeo hasta un estado ≠ `payment_pending`. Mostrar `expired` |
| F6 | `eCommerceStore.finalizePaidOrder` | Vacía el carrito al detectar `paid` | Igual, a partir de `get_order_public` | Alta | Adaptar la fuente de datos |
| F7 | `store/eCommerceStore.js` `syncCartWithServer` | Escribe en `carts` / `cart_items` | **Tablas eliminadas** (carrito local en v1) | **Bloqueante** (errores en cada cambio de carrito) | Eliminar la sincronización hasta la fase de carrito para registrados |
| F8 | `store/eCommerceStore.js` `addItem` | Resuelve la variante por coincidencia aproximada de color y SKU (`BEI/BLA/GRI/NEG`) | Variante exacta por `(product, color, size)`. SKU nuevo `REF-COLOR-TALLA` | Alta | Selección exacta por `color_id` + `size_id`. Eliminar la heurística por SKU |
| F9 | Regex UUID del cliente `[1-5]…[89ab]` | — | Todos los UUID de referencia y seeds son v4 válidos | Compatible | — |

## 4. Frontend — catálogo y cuenta

| # | Archivo | Uso actual | Nuevo contrato | Severidad | Cambio requerido |
|---|---|---|---|---|---|
| F10 | `services/productService.js` `getProducts` | `products(reference, name, description, base_price, base_cost, deleted_at, categories, brands, variants(sku, price_override, image_url, sizes(code), colors(name, hex_code)))` + `.is('deleted_at', null)` | Sin `deleted_at` (usar RLS por `status`). Sin `variants.image_url` (usar `product_images`). Nuevas: `slug`, `status`, `fit`, `details`, `compare_at_price`, `style_lines(slug)`, `product_colors`, `product_occasions`, `v_variant_availability`, `v_product_rating` | **Bloqueante** (la consulta falla por columnas inexistentes) | Nueva consulta y normalizador. **Eliminar el *fallback* a `mockData`** y los valores inventados (rating 4.9, tallas, colores, etc.) |
| F11 | `productService.getProductBySlug` | Si no encuentra el slug, devuelve el primer producto | `products.slug` único | Alta | Consultar por `slug` y mostrar 404 si no existe |
| F12 | `ProductDetailPage.jsx` | Imágenes globales del producto; reseñas mock; sin stock | `product_images` por color; `v_variant_availability`; `product_reviews` aprobadas | Alta | Galería que cambia con el color; tallas agotadas deshabilitadas; reseñas reales |
| F13 | `CatalogPage.jsx` filtros | Atributos inventados (`fit`, `occasion`, `isNew`, `isSale`) | `fit`, `product_occasions`, `is_featured_new`, `compare_at_price` en BD; categorías por `slug` | Alta | Filtrar con datos reales |
| F14 | `AccountPage.jsx` | SELECT de `online_orders` sin filtro (con RLS antigua mostraba todos) | RLS solo muestra los propios; ítems visibles | Compatible en lo esencial | Ajustar columnas (`size_code`, `color_name`, `line_total`); direcciones a `customer_addresses`; perfil a `profiles` |
| F15 | `store/authStore.js` | `profiles.select('*')`, `role` | `role` enum con los mismos valores | Compatible | — |
| F16 | Favoritos | `localStorage` con ids mock `prod-1`, `prod-3` | `wishlist_items` (registrados) | Media | Quitar los ids por defecto; sincronizar si hay sesión |

## 5. Frontend — administración

| # | Archivo | Uso actual | Nuevo contrato | Severidad | Cambio requerido |
|---|---|---|---|---|---|
| A1 | `AdminProductFormPage.jsx` + `productService.createProduct/updateProduct` | INSERT/UPDATE de `products` con `style_line_id` y UUID inválido de respaldo; sin variantes ni imágenes; `addProduct` sin `await` | `admin_upsert_product(jsonb)` con colores, imágenes por color, variantes y stock inicial; `admin_set_product_status` | **Bloqueante** | Rehacer el formulario (matriz color × talla, imágenes por color subidas al bucket `product-images`) |
| A2 | `AdminProductsPage.jsx` `deleteProduct` | `update({deleted_at})` | `admin_set_product_status(id, 'archived')` | **Bloqueante** | Archivar en lugar de borrar |
| A3 | `AdminInventoryPage.jsx` | `rpc('adjust_inventory_stock', {p_variant_id, p_quantity_change, p_movement_type, p_reason})` | `rpc('admin_adjust_inventory', {…, p_movement_type ∈ restock/adjustment/damage/return})` + columna `reserved` | **Bloqueante** | Cambiar el nombre de la RPC; mostrar reservado y disponible; quitar `alert()` |
| A4 | `AdminOrdersPage.jsx` | `rpc('update_order_status')` con estados `pending`, `preparing`; guía solo local | `admin_transition_order(id, to, note, {carrier, tracking_number, tracking_url})`; opciones desde `get_order_status_catalog` (transiciones `admin` del estado actual) | **Bloqueante** | Selector dinámico, nota obligatoria donde corresponda, guía persistida, detalle de ítems |
| A5 | `AdminDashboardPage.jsx` | `rpc('get_commercial_dashboard_metrics')` + `PRODUCTS` mock | `admin_dashboard_metrics(p_from, p_to)` | **Bloqueante** | Nueva RPC y forma de respuesta; quitar el mock |
| A6 | `AdminCustomersPage.jsx` | `profiles.select('*')` leyendo `email` | `profiles.email` **ahora existe** | Compatible | Agregados de pedidos con una vista o RPC admin (pendiente) |
| A7 | `AdminDiscountsPage.jsx` | Simulado (estado local) | CRUD en `coupons` (RLS admin) | Media | Conectar a la tabla |
| A8 | `AdminReviewsPage.jsx` | Simulado | `product_reviews` (moderación por RLS admin) | Media | Conectar |
| A9 | `AdminEditorialImagesPage.jsx` | `localStorage` | `site_content` + bucket `site-content` | Media | Conectar |
| A10 | `AdminCollectionsPage.jsx` | Mock `OCCASIONS` | `collections`, `collection_products`, `occasions` | Media | Conectar |
| A11 | Gestión de roles | Inexistente | `admin_set_user_role` (super_admin) | Media | Nueva pantalla (opcional v1) |

## 6. Código legado que debe eliminarse en la adaptación
- `store/syncStore.js`: llama `create_sale_atomic`, que ya no existe.
- `store/cartStore.js`, `layouts/DashboardLayout.jsx`, `pages/Dashboard.jsx`, `pages/Inventory.jsx`, `pages/Customers.jsx`, `hooks/useProducts.js` (consulta `deleted_at`), `hooks/useBarcodeScanner.js`.
- `packages/shared` (roles y métodos de pago POS).

## 7. Orden recomendado de adaptación (siguiente misión)
1. Validar la base con **Supabase CLI + Docker** (`supabase db reset && supabase test db`).
2. Generar tipos (`supabase gen types typescript`) para usarlos como contrato y verificarlos en CI.
3. Backend: B1, B2 y B3 (firma, webhook y retiro de la Edge Function), con pruebas sobre BD local.
4. Compra: F1, F2, F3, F4, F5, F6, F7 y F8.
5. Catálogo: F10, F11, F12, F13 y F16.
6. Administración: A1 a A5, después A7 a A11.
7. E2E Playwright contra QA-v2 + Wompi Sandbox.

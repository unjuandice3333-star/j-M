# M24A — MATRIZ DE COMPATIBILIDAD · J&M FASHION STORE

**Fuentes:** 16 migraciones (`supabase/migrations/`), inventario extraído de la BD reconstruida localmente (`anexos/inventario_actual_*.txt`), y lectura de todas las referencias al esquema en `apps/web/src`, `apps/web/api` y `supabase/functions`.

**Leyenda de "Estado actual en migraciones":**
- **OK**: se crea al reconstruir desde cero y es coherente.
- **ROTO**: se crea pero falla en ejecución o es incoherente.
- **AUSENTE**: ningún archivo lo crea, aunque el código lo usa.
- **FALLA-MIG**: lo crea o modifica una migración que no aplica desde cero.
- **LEGADO**: objeto POS.

**Acciones:**
- **CONSERVAR**: se mantiene tal cual.
- **REDISEÑAR**: se mantiene, con cambios estructurales.
- **CREAR**: no existe y debe crearse.
- **ELIMINAR**: desaparece del esquema.
- **SUSTITUIR**: lo reemplaza otro objeto.

---

## 1. Referencias del código al esquema (inventario)

### 1.1 Frontend (`apps/web/src`)
| Archivo | Objeto | Operación | Columnas / parámetros usados |
|---|---|---|---|
| `services/productService.js` | `products` + `categories`, `brands`, `variants(sizes, colors)` | SELECT | `id, reference, name, description, base_price, base_cost, deleted_at`; `variants.id, sku, price_override, image_url`; `sizes.code`; `colors.name, hex_code`. El normalizador lee además `slug, images, style_lines.slug, original_price, discount_percent, is_new, is_bestseller, is_sale, rating, review_count, fit, occasion, details, fit_description, status, category` |
| `services/productService.js` | `style_lines` | SELECT | `id` por `slug` |
| `services/productService.js` | `categories` | SELECT | `id` por `name ILIKE` |
| `services/productService.js` | `products` | INSERT/UPDATE | `reference, name, description, category_id, brand_id, style_line_id, base_price, base_cost, updated_at, deleted_at` |
| `store/eCommerceStore.js` | `carts`, `cart_items` | SELECT/INSERT/UPSERT | `carts.id, user_id, session_id, status`; `cart_items.cart_id, variant_id, quantity, unit_price`; header `x-session-id` |
| `store/eCommerceStore.js` | RPC `create_online_order_validated_idempotent` | EXECUTE | 13 parámetros; `p_items[] = {variant_id, quantity, name, price, size, color}`; `p_user_id` |
| `store/authStore.js` | `profiles` | SELECT `*` | `role` |
| `pages/AccountPage.jsx` | `online_orders` + `online_order_items` | SELECT | `id, order_number, total, status, created_at`; ítems `id, product_name, size, color, unit_price, quantity, total` (**sin filtro por usuario**) |
| `pages/OrderConfirmationPage.jsx` | `online_orders` + ítems, `order_events`, RPC `get_order_status` | SELECT / EXECUTE | `id, order_number, customer_name, customer_email, shipping_address, shipping_city, total, status, created_at`; eventos `event_type, previous_status, new_status, created_at`; estados `preparing`, `declined`, `voided` |
| `pages/admin/AdminOrdersPage.jsx` | `online_orders` + ítems; RPC `update_order_status` | SELECT / EXECUTE | 18 columnas de cabecera + ítems con `sku`; estados ofrecidos: `pending, payment_pending, paid, preparing, shipped, delivered, cancelled` |
| `pages/admin/AdminDashboardPage.jsx` | RPC `get_commercial_dashboard_metrics`; `online_orders` | EXECUTE / SELECT | `id, order_number, customer_name, shipping_city, total, status, created_at` |
| `pages/admin/AdminInventoryPage.jsx` | `inventories` → `variants(sizes, colors, products)`; RPC `adjust_inventory_stock` | SELECT / EXECUTE | `stock, min_stock, location_shelf, variant_id, branch_id`; `p_movement_type` ∈ `restock`, `adjustment` |
| `pages/admin/AdminCustomersPage.jsx` | `profiles` | SELECT `*` | `full_name, email, phone, created_at` (**`email` no existe en `profiles`**) |
| `pages/admin/AdminDiscountsPage.jsx`, `AdminReviewsPage.jsx`, `AdminAnalyticsPage.jsx`, `AdminCollectionsPage.jsx`, `AdminEditorialImagesPage.jsx` | — | — | Sin BD (simuladas / `localStorage`) |
| `store/syncStore.js` | RPC `create_sale_atomic` | EXECUTE | Legado POS |
| `hooks/useProducts.js` | `products`, `variants` | SELECT `*` | Sin uso |
| `data/mockData.js` | — | — | Define la forma de datos que espera la UI: `CATEGORIES(slug, image, count)`, `STYLE_LINES(slug, tagline, badge, image)`, `OCCASIONS`, `LOOKS`, `REVIEWS`, `SIZE_CHART`, `FITS_INFO`; tallas `S–XXL`, `30–36`, `38–43` |

### 1.2 Backend (servidor)
| Archivo | Objeto | Operación | Columnas |
|---|---|---|---|
| `apps/web/api/wompi/signature.js` | `online_orders` | SELECT | `id, order_number, total` (búsqueda por `id` u `order_number`) |
| `apps/web/api/wompi/webhook.js` y `supabase/functions/wompi-webhook/index.ts` | `online_orders` | SELECT / UPDATE | `id, order_number, status, total`; `status, updated_at` |
| ídem | `payment_transactions` | SELECT / UPSERT (`onConflict: transaction_reference`) | `id, order_id, status, wompi_transaction_id, transaction_reference, amount_in_cents, currency, provider, payment_method_type, raw_response, updated_at` |
| ídem | `order_events` | INSERT | `order_id, event_type, previous_status, new_status, metadata` |
| Trigger `trg_auto_inventory_on_paid` (BD) | `process_online_order_inventory` | implícito en UPDATE | `online_orders.branch_id`, `inventory_movements.inventory_id/notes` |

---

## 2. Matriz principal

### 2.1 Catálogo
| Objeto | Estado actual en migraciones | Uso frontend/backend | Problema encontrado | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `products` (tabla) | OK (columnas POS) | Catálogo, admin CRUD | Faltan `slug`, `status`, `fit`, `details`, `compare_at_price`, `style_line_id`, flags; `brand_id` NOT NULL; `gender` POS | Ver ESQUEMA §3 | REDISEÑAR | `categories`, `style_lines` |
| `products.slug` | AUSENTE | Rutas `/producto/:slug`, `getProductBySlug` | Se deriva del nombre en cliente ⇒ colisiones; fallback a otro producto | `text UNIQUE NOT NULL` | CREAR | — |
| `products.style_line_id` | AUSENTE | `createProduct`, `updateProduct` | INSERT falla en BD limpia | FK a `style_lines` | CREAR | `style_lines` |
| `products.images` | AUSENTE | normalizador | Galería sin modelo | Sustituido por `product_images` | SUSTITUIR | `product_images` |
| `products.status` / `is_new` / `is_bestseller` / `is_sale` / `original_price` / `fit` / `occasion` / `details` / `fit_description` | AUSENTE | Filtros, tarjetas, ficha, formulario admin | UI usa valores inventados | `status` enum, `is_featured_new`, `is_bestseller`, `compare_at_price`, `fit` enum, `product_occasions`, `details[]`, `fit_description` | CREAR | enums |
| `products.rating` / `review_count` | AUSENTE | Tarjeta, JSON-LD | 4.9/12 inventados | Vista `v_product_rating` | CREAR (vista) | `product_reviews` |
| `products.gender`, `collection_id`, `season_id`, `base_cost` NOT NULL | OK | No usados (salvo `base_cost` en formulario) | Restos POS / ERP | Eliminar `gender`, `season_id`; colecciones N:M; `base_cost` opcional | REDISEÑAR | DP-6 |
| `categories` | OK | Filtros, admin | Sin `slug`; seeds "Superior (Camisas…)" no casan con slugs de UI (`camisetas`, `jeans`…); sin `calzado`/`accesorios` | `slug`, `size_group`, `image_url`, `sort_order`, seeds alineados a la UI | REDISEÑAR | `size_group` |
| `style_lines` | OK (sin seeds) | Admin y catálogo por `slug` | Tabla vacía; sin `tagline/badge/image` | Seeds `urbana/elegante/casual` + campos UI | REDISEÑAR | — |
| `occasions` | AUSENTE | `CatalogPage` filtro, `HomePage` | Solo en mock | Tabla + N:M | CREAR | — |
| `brands` | OK | `productService` | Obligatoria con una sola marca | Opcional | CONSERVAR (ajustada) | — |
| `collections` | OK (sin uso, sin RLS) | Admin colecciones (mock), `LOOKS` mock | No modela productos ni looks | `collections` + `collection_products` | REDISEÑAR | DP-16 |
| `seasons` | OK (sin uso, sin RLS) | — | Sin uso | — | ELIMINAR | — |
| `sizes` | OK; `code` único global | Normalizador, inventario admin | No soporta sistemas de talla distintos; RLS solo en migración que falla | `size_group` + `UNIQUE(size_group, code)` | REDISEÑAR | — |
| `colors` | OK | Selector de color | Sin `slug`; normalizador deduce color del SKU (`BEI/BLA/GRI/NEG`) | `slug`, `hex` validado | REDISEÑAR | — |
| `product_colors` | AUSENTE | Selector de color de la ficha | Colores derivados de variantes, sin orden ni color por defecto | Tabla nueva (ancla de galería y variantes) | CREAR | `colors` |
| `product_images` | AUSENTE | Ficha, tarjeta, admin | **Galería por color inexistente** | Tabla con FK compuesta `(product_id,color_id)` | CREAR | `product_colors`, Storage |
| `variants` | OK | Carrito, checkout, inventario | `image_url` mezcla colores; `barcode` NOT NULL (no siempre existe); sin `UNIQUE(product,color,size)` ⇒ variantes duplicadas posibles; `cost_override` POS | Ver ESQUEMA §3 | REDISEÑAR | `product_colors`, `sizes` |
| `get_available_stock()` | OK (EXECUTE revocado en remoto por `…0929…`, *inferencia*) | No usada | — | Vista `v_variant_availability` | SUSTITUIR | `inventories` |

### 2.2 Inventario
| Objeto | Estado actual | Uso | Problema | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `branches` | OK (+columnas POS) | `inventories.branch_id`, UUID fijo en código | UUID seed `b1000000-…` no pasa la regex del frontend; políticas POS (`branch_select_policy`) | `code`, `is_default` único; UUID v4 válido | REDISEÑAR | — |
| `inventories` | OK | Admin inventario, checkout | Sin `reserved`; 5 políticas superpuestas (POS + `public_read` + `admin_write`), lectura anónima total | `reserved`, `CHECK reserved<=stock`, sin lectura anónima directa | REDISEÑAR | `branches`, `variants` |
| `inventory_movements` | OK, pero las funciones usan columnas **AUSENTES** (`inventory_id`, `notes`) y tipos fuera del CHECK (`ONLINE_SALE`, `RETURN_CANCEL`) | Funciones de pago/OMS | T4 falla | `inventory_id` NOT NULL, enum de tipos, aritmética con CHECK, idempotencia por índice | REDISEÑAR | `inventories` |
| `inventory_reservations` | AUSENTE | — | Sobreventa posible (cobro sin stock) | Tabla nueva | CREAR | DP-1 |
| `adjust_inventory_stock()` | OK local; sin GRANT en remoto (*inferencia*) | Admin inventario | Bodega por UUID fijo; tipos libres | `admin_adjust_inventory()` | SUSTITUIR | enum de movimientos |
| `process_online_order_inventory()` | ROTO (`branch_id`) | Trigger al pasar a `paid` | El webhook no puede marcar el pedido como pagado | Efecto de `transition_order` | SUSTITUIR | `inventory_reservations` |
| `restore_online_order_inventory()` | ROTO | Sin llamada efectiva | Columnas inexistentes | Efecto de `transition_order` | SUSTITUIR | — |
| `trg_auto_inventory_on_paid` | ROTO | Disparado por el webhook | Lógica oculta en un UPDATE | Eliminar trigger | ELIMINAR | `apply_payment_event` |

### 2.3 Pedidos
| Objeto | Estado actual | Uso | Problema | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `online_orders` | OK + columnas añadidas | Checkout, cuenta, confirmación, admin, webhook | `branch_id` **AUSENTE** (usado por funciones); `idempotency_key` nullable; `numeric(12,2)`; número de pedido aleatorio | Ver ESQUEMA §5.1 | REDISEÑAR | `shipping_methods`, `branches` |
| `online_orders.branch_id` | AUSENTE (la migración `…0930…`, que falla, solo le pone DEFAULT) | Funciones de inventario | T4 | NOT NULL FK | CREAR | `branches` |
| `online_orders.public_token` | AUSENTE | Confirmación de invitado | El invitado no puede ver su pedido | `uuid UNIQUE` | CREAR | — |
| `online_orders.shipping_method` (texto libre) | OK | Checkout | "Expreso" no cambia el costo | FK `shipping_methods.code` | REDISEÑAR | `shipping_methods` |
| `shipping_methods` | AUSENTE | Checkout (valores fijos) | $15.000 y umbral $200.000 escritos en SQL y en JS | Tabla | CREAR | DP-3 |
| `online_order_items` | OK | Confirmación, cuenta, admin | Precio/nombre/talla/color **del cliente** (T1, T12); `variant_id` nullable; `product_id` nunca se llena; sin política SELECT (T14) | Snapshot desde BD, NOT NULL, CHECK de total | REDISEÑAR | `create_order` |
| `order_events` | OK (sin `description`, que `…0929…` usa) | Línea de tiempo, webhook | `previous/new_status` texto libre; sin actor tipado | Enum + `actor` | REDISEÑAR | enum `order_status` |
| `order_status` enum | OK (`online_order_status`) | UI y SQL | Faltan `expired`; UI usa `preparing`; SQL usa `packed`; `pending` sin uso | Ver ESQUEMA §6 | REDISEÑAR | — |
| `order_status_transitions` | AUSENTE | — | Reglas dispersas en 2 funciones (una rota) | Tabla de transiciones | CREAR | enum |
| `update_order_status()` | OK (saltos libres) | Admin pedidos | Sin efectos (stock, guía, fechas); GRANT revocado en remoto (*inferencia*) | `transition_order()` | SUSTITUIR | tabla de transiciones |
| `update_order_status_oms()` | ROTO (`packed`) | — | Falla siempre (T5b) | `transition_order()` | SUSTITUIR | — |
| `create_online_order_validated()` | OK (versión antigua) | — | Duplicada | — | ELIMINAR | — |
| `create_online_order_validated_idempotent()` | OK con defectos | Checkout | Ver M23 B5 | `create_order()` | SUSTITUIR | reservas, cupones, envío |
| `get_order_status()` | AUSENTE | Confirmación (2 llamadas) | Error en cada consulta (T7) | `get_order_public()` | CREAR | `public_token` |
| `carts`, `cart_items` | OK | Sincronización de solo escritura | RLS por header `x-session-id`; nunca se lee; precio del cliente | Fuera del núcleo; reintroducir solo para autenticados | ELIMINAR del núcleo (DP-10) | — |
| `customer_addresses` | OK | No usada (direcciones en `localStorage`) | — | Conservar + índice de predeterminada | CONSERVAR | — |
| `order_refunds` | OK | No usada | Sin vínculo a pago | Vínculo a `payment_transactions`, `restock` | REDISEÑAR | pagos |

### 2.4 Pagos y cupones
| Objeto | Estado actual | Uso | Problema | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `payment_transactions` | OK | Webhooks | Una fila por pedido (`transaction_reference` = número de pedido) ⇒ no permite reintentos con referencia nueva; CASCADE desde pedido; política `FOR ALL authenticated` (T16) | Un intento por fila, `reference` única por intento, 1 APPROVED por pedido, RESTRICT, sin escritura de clientes | REDISEÑAR | `online_orders` |
| `webhook_events` | AUSENTE | — | Sin bandeja de entrada ni registro de eventos rechazados | Tabla nueva | CREAR | — |
| enum `online_payment_status` | OK | Webhooks | — | Renombrar `payment_status` (mismos valores) | CONSERVAR (renombrar) | — |
| `apply_payment_event()` | AUSENTE | — | Lógica de pago en 2 copias JS no transaccionales | RPC única transaccional | CREAR | `transition_order`, `webhook_events` |
| `create_payment_attempt()` | AUSENTE | `signature.js` lee el pedido directamente | Firma pedidos no pagables | RPC | CREAR | `payment_transactions` |
| `coupons` | OK | Checkout (RPC), admin (mock), cliente (lista fija) | `free_shipping` no aplicado; `min_purchase` no validado; enumerables por anon (T13); `used_count` al crear | Ver ESQUEMA §5.4 | REDISEÑAR | — |
| `coupon_redemptions` | AUSENTE | — | Sin trazabilidad de uso | Tabla nueva | CREAR | `coupons`, pedidos |
| `validate_coupon()`, `quote_cart()` | AUSENTE | Carrito calcula en cliente | Total mostrado ≠ total cobrado | RPC | CREAR | cupones, envío |

### 2.5 Identidad y permisos
| Objeto | Estado actual | Uso | Problema | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `profiles` | OK | Auth, guardas, admin clientes | Falta `email` (admin lo lee); `role` texto con CHECK; `preferred_size/fit` en `localStorage` | `email`, `role app_role`, preferencias | REDISEÑAR | `auth.users` |
| `handle_new_user_profile()` + trigger | OK (4 versiones; 1 con email fijo) | Alta de usuarios | Asignación de super_admin por email en migraciones | `handle_new_user()` sin emails fijos; super_admin por script controlado | REDISEÑAR | — |
| `is_admin()` | OK (EXECUTE revocado y restaurado) | Todas las políticas admin | Políticas de `…0929…` usan `role='admin'` (excluye super_admin) | `is_admin()` en todas las políticas | CONSERVAR (reescrita) | — |
| Políticas `online_orders` (`order_public_insert`, `order_restricted_read`) | OK | Checkout, cuenta | INSERT anónimo (T11); cualquier autenticado ve todos los pedidos (T10) | Solo lectura propia; escritura solo por RPC | REDISEÑAR | RPC |
| Política `online_order_items.order_item_public_insert` | OK | — | INSERT anónimo; sin SELECT | Solo SELECT propio/admin | REDISEÑAR | — |
| Política `payment_transactions_admin_policy` | OK | Webhooks (service_role, no afectado) | Clientes modifican pagos (T16) | Solo admin SELECT | REDISEÑAR | — |
| `REVOKE ALL ON ALL FUNCTIONS` | FALLA-MIG (`…0929…`) | — | En remoto (si se aplicó) dejó RPC admin sin EXECUTE | GRANT explícito por función en la base | SUSTITUIR | — |
| `wishlist_items` | AUSENTE | Favoritos (`localStorage` con ids mock) | — | Tabla para autenticados | CREAR | — |

### 2.6 Contenido, auditoría y legado
| Objeto | Estado actual | Uso | Problema | Estado objetivo | Acción | Dependencias |
|---|---|---|---|---|---|---|
| `product_reviews` | OK (sin uso) | Ficha y admin usan mock | Por defecto `approved` y `verified=TRUE` | Pendiente por defecto, verificado si hay línea de pedido | REDISEÑAR | pedidos |
| `site_content` | AUSENTE | Imágenes editoriales en `localStorage` | Cambios invisibles para clientes | Tabla + bucket | CREAR | Storage |
| `audit_logs` + `process_audit_log*` | OK / ROTO en `…0929…` (`performed_by`) | — | 3 versiones de la función | Una función, columnas coherentes | REDISEÑAR | — |
| `update_modified_column()` + triggers | OK parcial | — | Faltan en pedidos, pagos, cupones, perfiles | `set_updated_at()` en todas | REDISEÑAR | — |
| `get_commercial_dashboard_metrics()` | ROTO (`packed`) | Dashboard admin | Falla siempre | `admin_dashboard_metrics()` | SUSTITUIR | enum |
| `mv_daily_sales`, `mv_monthly_sales`, `mv_top_products`, `refresh_analytics_views()` | LEGADO | — | Bloquean la limpieza de `…0929…` | — | ELIMINAR | — |
| `employees`, `shifts`, `sales`, `sale_items`, `transfers`, `transfer_items`, `customers`, `role_permissions` | LEGADO (OK desde cero; FALLA-MIG al eliminarlos) | `syncStore.js` | — | — | ELIMINAR | Limpieza del frontend (M34) |
| Enums POS (`user_role`, `shift_status`, `payment_method_type`, `sale_status_type`, `transfer_status_type`, `gender_type`) | LEGADO | `@jm/shared` | — | — | ELIMINAR | — |
| Funciones POS (`create_sale_atomic`, `deduct_inventory_on_sale*`, `validate_*`, `has_permission`, `current_employee_*`) | LEGADO | `syncStore.js` | — | — | ELIMINAR | — |
| Extensión `uuid-ossp` | OK | — | Innecesaria (`gen_random_uuid()` es nativa) | — | ELIMINAR | — |

---

## 3. Impacto en el frontend y el backend (cambios necesarios, **no implementados**)

| Módulo | Cambio requerido para compatibilidad |
|---|---|
| `productService.js` | Leer de `products` activos + `product_colors` + `product_images` + `variants` + `v_variant_availability` + `v_product_rating`; quitar fallback a mock, deducciones desde SKU y valores inventados; `getProductBySlug` devuelve `null` → 404 |
| `AdminProductFormPage.jsx` / `productService.create/update` | Llamar `admin_upsert_product` con colores, imágenes por color (subida a Storage), tallas y stock inicial; `await` y manejo de errores |
| `eCommerceStore.addItem` | Resolver la variante **exacta** por `color_id` + `size_id` (sin coincidencias aproximadas) |
| `eCommerceStore.getTotals` / `applyCoupon` | Usar `quote_cart` / `validate_coupon` |
| `eCommerceStore.createOrder` / `CheckoutPage.jsx` | Llamar `create_order` con `{variant_id, quantity}`; método de envío por código; guardar `public_token` |
| `services/wompi.js` + `api/wompi/signature.js` | Pedir intento (`create_payment_attempt`) y firmar la referencia del intento |
| `api/wompi/webhook.js` | Verificar firma → `apply_payment_event` → responder; eliminar la Edge Function duplicada |
| `OrderConfirmationPage.jsx` | `get_order_public(order_number, token)`; estados y etiquetas desde `get_order_status_catalog` |
| `AccountPage.jsx` | Pedidos propios (RLS por `user_id`), direcciones en `customer_addresses`, perfil en `profiles` |
| `AdminOrdersPage.jsx` | Selector desde la tabla de transiciones; `transition_order` con guía; detalle de ítems |
| `AdminInventoryPage.jsx` | `admin_adjust_inventory`; mostrar `reserved` y disponible |
| `AdminDashboardPage.jsx` | `admin_dashboard_metrics`; quitar `PRODUCTS` mock |
| `AdminCustomersPage.jsx` | `profiles.email` + agregados de pedidos (vista/RPC admin) |
| Descuentos, reseñas, colecciones, imágenes editoriales | Conectar a `coupons`, `product_reviews`, `collections`, `site_content` |
| Tipos | `supabase gen types typescript` como contrato; CI falla si el frontend usa columnas inexistentes |

---

## 4. Resumen cuantitativo

| Acción | Nº de objetos (aprox.) |
|---|---|
| CONSERVAR (con ajustes menores) | 5 |
| REDISEÑAR | 28 |
| CREAR | 22 |
| SUSTITUIR | 13 |
| ELIMINAR (POS y duplicados) | 30+ (incluye 8 tablas, 6 enums, 11 funciones, 3 vistas materializadas, triggers y políticas asociados) |

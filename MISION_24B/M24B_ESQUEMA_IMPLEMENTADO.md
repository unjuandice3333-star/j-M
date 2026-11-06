# M24B — ESQUEMA IMPLEMENTADO · J&M FASHION STORE

**Rama local:** `db/baseline-m24b` (creada desde `main` @ `2661f2a`). **No integrada a `main`, sin push.**
**Entorno:** PostgreSQL 16 local y efímero. No hubo conexión a Supabase QA ni Production, ni operaciones remotas.
**Estrategia:** C' (híbrida), definida en M24A.

---

## 1. Archivos entregados

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20261106120000_baseline_ecommerce.sql` | **Línea base consolidada** (2.175 líneas): esquema, funciones, triggers, RLS, privilegios, storage, datos de referencia, pg_cron y autoverificación |
| `supabase/migrations_legacy/*.sql` (16) + `README.md` | Migraciones históricas **archivadas intactas** con `git mv`: mismo contenido, fuera de la carpeta activa |
| `supabase/seeds/00_qa_users.sql`, `10_qa_catalog.sql`, `20_qa_orders.sql` | Seeds deterministas de QA |
| `supabase/tests/database/*.test.sql` (11) + `_helpers.psql` | Pruebas automatizadas pgTAP (290 aserciones) |
| `supabase/tests/run_local.sh` | Ejecutor reproducible: crea un clúster efímero, reconstruye, ejecuta las pruebas y verifica concurrencia y determinismo |
| `supabase/tests/local_shim/supabase_shim.sql` | Compatibilidad mínima con Supabase para PostgreSQL sin Docker. **No aplicar en Supabase** |
| `supabase/config.toml` | Configuración de Supabase CLI local, con seeds solo para local/QA |
| `MISION_24B/*.md` + `MISION_24B/evidencias/` | Informes y evidencias de ejecución |

Sin cambios en el frontend (`apps/web/src`), el backend (`apps/web/api`), la Edge Function, Vercel, Wompi ni las credenciales.

## 2. Inventario de objetos creados (medido en la BD reconstruida)

| Tipo | Cantidad |
|---|---|
| Tablas `public` (todas con RLS) | 34 |
| Vistas | 2 (`v_variant_availability`, `v_product_rating`) |
| Enums | 14 |
| Funciones `public` (RPC) | 17 |
| Funciones `private` (no expuestas por PostgREST) | 15 |
| Políticas RLS (`public` + `storage`) | 53 + 4 |
| Triggers | 26 |
| Restricciones CHECK / claves foráneas / índices | 77 / 49 / 98 |
| Buckets de storage | 2 (`product-images`, `site-content`) |
| Job pg_cron | `jm-expire-pending-orders` cada 5 minutos |

**Sin objetos POS.** La prueba `01_structure` verifica que no existen `employees`, `shifts`, `sales`, `sale_items`, `transfers`, `transfer_items`, `customers`, `role_permissions` ni `carts`.

## 3. Modelo por dominio

### 3.1 Catálogo (productos, variantes, tallas, colores, imágenes por color)
- **`categories`**: `slug` validado y `size_group` por defecto (camisetas, camisas, polos, chaquetas → `alpha`; jeans, pantalones, bermudas → `numeric_pants`; calzado → `footwear`; accesorios → `one_size`).
- **`sizes`**: `UNIQUE(size_group, code)`. Incluye XS–XXL, 28–40, 37–44 y UNICA.
- **`colors`**: 10 colores base, `slug` y `hex_code` validado.
- **`products`**:
  - `reference` en mayúsculas, `slug` en minúsculas, `details text[]`, `fit` enum, `fit_description`, `style_line_id`;
  - `base_price` / `compare_at_price` / `base_cost` en `bigint` COP;
  - `status` (`draft` / `active` / `archived`), `published_at` obligatorio si está activo, `is_featured_new`, `is_bestseller`.
- **`product_colors`**: colores que ofrece cada producto, con orden y **un** color por defecto (índice único parcial).
- **`product_images`**: galería **por color** mediante la FK compuesta `(product_id, color_id)` → `product_colors`.
  - `color_id NULL` = imagen general.
  - `storage_path` (bucket) **o** `external_url` (`https://`, para la transición).
- **`variants`**: `UNIQUE(product_id, color_id, size_id)`; FK compuesta al color declarado; `sku` único validado; `barcode` opcional; `price_override`; `is_active`. Las variantes nunca se borran, solo se desactivan.
- **`occasions`** + **`product_occasions`** (N:M), **`style_lines`**, **`collections`** + **`collection_products`**, **`brands`**.

### 3.2 Inventario
- **`branches`**: semántica de bodega; exactamente **una** `is_default`.
- **`inventories`**:
  - `stock` (físico) y `reserved` (comprometido);
  - `CHECK reserved <= stock`, `stock >= 0`;
  - `UNIQUE(branch_id, variant_id)`.
- **`inventory_reservations`**: una por pedido y fila de inventario; estados `active` / `consumed` / `released` / `expired`; `expires_at`.
- **`inventory_movements`**: *append-only* (trigger).
  - `CHECK quantity_after = quantity_before + quantity_change`;
  - `movement_type` enum;
  - índice único parcial que impide registrar dos ventas o dos reingresos de la misma variante en el mismo pedido;
  - `created_at = clock_timestamp()`, que conserva el orden dentro de una transacción.

### 3.3 Pedidos
- **`online_orders`**:
  - `order_number` por secuencia (`JM-001000…`); `public_token` para invitados; `idempotency_key` obligatoria y única;
  - `user_id` (solo desde `auth.uid()`); `branch_id` NOT NULL; `shipping_method_code` FK; `payment_method` (`wompi`);
  - importes `bigint` con `CHECK total = subtotal − discount_total + shipping_cost`;
  - `coupon_id` + `coupon_code` coherentes; `payment_expires_at`;
  - fechas de ciclo de vida; guía (`carrier`, `tracking_number`, `tracking_url`); `needs_attention`.
- **`online_order_items`**:
  - snapshot **desde BD**: nombre, SKU, talla, color, imagen y precio;
  - `line_discount` prorrateado; `CHECK line_total = unit_price × quantity − line_discount`;
  - `UNIQUE(order_id, variant_id)`; FKs `RESTRICT`.
- **`order_status_catalog`** (etiquetas en español) y **`order_status_transitions`** (13 transiciones con actor y nota obligatoria).
- **`order_events`**: *append-only*; estados tipados, actor, usuario, nota y metadatos.
- **`order_refunds`**: ligado al pago aprobado, con bandera `restock`.

### 3.4 Pagos
- **`payment_transactions`**: **un registro por intento**.
  - `reference = NÚMERO-intento`, única;
  - `provider_transaction_id` único; `amount_in_cents`; `status`;
  - `requires_refund`;
  - índice único parcial: **un solo pago aprobado válido por pedido**.
- **`webhook_events`**: bandeja de entrada idempotente con `UNIQUE(provider, event_checksum)` y resultado `applied` / `ignored` / `rejected`.

### 3.5 Comercial, identidad y contenido
- **`shipping_methods`**:
  - `standard`: $15.000, gratis desde $200.000, activo;
  - `express`: **inactivo**; el `CHECK` impide activarlo sin una tarifa mayor que 0.
- **`coupons`** (`percent` 1–90 %, `fixed`, `free_shipping`, mínimo, usos totales y por correo, vigencia) + **`coupon_redemptions`** (`reserved` → `confirmed` | `released`).
- **`profiles`**: `email`, `role` enum, preferencias. El usuario solo puede actualizar sus columnas no sensibles. El rol solo cambia con `admin_set_user_role`.
- **`customer_addresses`**: una dirección predeterminada por usuario.
- **`wishlist_items`**, **`product_reviews`** (`is_verified_buyer` calculado; pendiente por defecto), **`site_content`**, **`audit_logs`** (*append-only*).

## 4. Decisiones de negocio y dónde se implementan

| Decisión (M24B) | Implementación | Verificación |
|---|---|---|
| Reserva de inventario 30 minutos | `private.reservation_ttl()` = 30 min; `payment_expires_at`; `expire_pending_orders()` + pg_cron cada 5 min | `20_checkout` (ventana), `30_reservations` |
| Sin pago contraentrega | Enum `payment_method` solo admite `wompi` | Estructura |
| Catálogo masculino | Sin columna `gender`; seeds y categorías masculinas | Estructura |
| Carrito local (servidor después) | Sin tablas `carts` / `cart_items`; `quote_cart` para totales autoritativos | `01_structure`, `20_checkout` |
| Un solo webhook en Vercel | Toda la lógica en `apply_payment_event` (solo `service_role`) | `40_payments`, `95_concurrency` |
| COP en pesos enteros | Todos los importes `bigint`; `amount_in_cents = total × 100` | `40_payments` |
| Envío estándar $15.000, gratis desde $200.000 | Tabla `shipping_methods`; umbral sobre subtotal **neto de descuento** | `20_checkout`, `60_coupons` |
| Express desactivado | Fila `express` con `is_active = false` | `01_structure`, `20_checkout` |

## 5. Diferencias respecto al diseño M24A (justificadas)

| Diseño M24A | Implementado | Motivo |
|---|---|---|
| `products.deleted_at` | Eliminado; se usa `status = 'archived'` | Un solo mecanismo de visibilidad; las variantes usan `is_active` |
| `payment_method` con `cash_on_delivery` | Solo `wompi` | Decisión de negocio M24B; se puede agregar con `ALTER TYPE … ADD VALUE` |
| Funciones internas en `public` | Esquema `private` | PostgREST solo expone `public`; las internas no son invocables desde la API |
| — | `needs_attention` en pedidos, `requires_refund` en pagos | Señales operativas para pagos tardíos sin stock, dobles aprobaciones y anulaciones |
| — | `order_status_catalog` | Etiquetas y estados consumibles por el frontend desde la BD |
| `carts` en el núcleo (opcional) | No incluido | Decisión M24B: carrito local en la primera versión |

## 6. Compatibilidad con Supabase (lo que se asume)
- Se usan `auth.users`, `auth.uid()`, `auth.role()` y `storage.buckets` / `storage.objects`, con las mismas definiciones que Supabase (reproducidas en el shim local).
- `pgcrypto` en el esquema `extensions`; `pg_cron` opcional (si no está disponible, la migración emite WARNING y la expiración debe programarse externamente).
- Supabase concede por defecto privilegios amplios a `anon` / `authenticated` en `public`. El shim reproduce ese comportamiento y la línea base los **revoca explícitamente**; `01_structure` lo verifica.
- **No verificado en esta misión** por falta de Docker: ejecución con Supabase CLI (`supabase db reset`) y comportamiento real de GoTrue y Storage. Queda como primera tarea de la siguiente misión.

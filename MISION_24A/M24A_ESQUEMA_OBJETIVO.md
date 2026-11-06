# M24A — ESQUEMA OBJETIVO · J&M FASHION STORE

**Misión:** 24A — Diseño del esquema objetivo y plan de reconstrucción (análisis y diseño, sin implementación)
**Base:** repositorio `unjuandice3333-star/j-m`, `main` @ `2661f2a`; auditoría M23 (docs 24, 26, 29, 30).
**Supuesto explícito:** **no** se asume que el esquema remoto (QA/Production) sea correcto ni que el repositorio contenga todo lo que existe allí.

> **Validación del diseño.** El DDL de núcleo de este documento (`anexos/BORRADOR_ddl_esquema_objetivo.sql`) **se compiló sin errores** en un PostgreSQL 16 local y efímero (con el mismo *shim* de Supabase de M23) y se ejecutaron 12 comprobaciones de restricciones (`anexos/BORRADOR_checks_restricciones.sql` → `anexos/salida_checks_restricciones.txt`): las 10 que debían fallar fallaron por la restricción esperada y las 2 positivas devolvieron lo esperado. **No es una migración**; es un borrador de diseño. Las funciones RPC y las políticas RLS se especifican en este documento, pero **no** se prototiparon.

---

## 1. Principios del esquema objetivo

1. **Solo e-commerce.** Sin objetos POS (cajas, turnos, ventas presenciales, traslados, empleados, puntos).
2. **El servidor es la autoridad.** Precios, nombres, tallas, colores, totales, descuentos, envío y stock se leen de la BD; el cliente solo envía `variant_id` + `quantity`.
3. **Dinero en pesos enteros (`bigint`, COP, IVA incluido).** COP no usa centavos; `amount_in_cents = total * 100` sin redondeos. *(Decisión pendiente DP-13 en §11.)*
4. **Restricciones en la BD, no solo en código.** Totales con `CHECK`, color de variante e imagen obligatoriamente declarado en el producto (FK compuesta), un solo pago aprobado por pedido, movimientos aritméticamente consistentes.
5. **Tablas de hechos *append-only*:** `inventory_movements`, `order_events`, `webhook_events`, `audit_logs`.
6. **Escrituras sensibles solo por RPC** (`SECURITY DEFINER`, `search_path` fijo, `GRANT` explícito); lectura pública solo de catálogo activo.
7. **Un enum = una verdad.** Los valores de estado se definen en la BD y el frontend los consume (no se duplican a mano).
8. **UUIDs de seeds válidos v4** (`xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx`): el frontend valida con `/^…-[1-5]…-[89ab]…$/` y hoy rechaza UUIDs de seed como `b1000000-0000-0000-0000-000000000001`.

---

## 2. Mapa de dominios

```
IDENTIDAD        profiles · customer_addresses · wishlist_items
CATÁLOGO         categories · style_lines · occasions · brands · collections(+collection_products)
                 sizes · colors · products · product_occasions · product_colors · product_images · variants
INVENTARIO       branches(bodega) · inventories · inventory_reservations · inventory_movements
COMERCIAL        shipping_methods · coupons · coupon_redemptions
PEDIDOS          online_orders · online_order_items · order_events · order_status_transitions · order_refunds
PAGOS            payment_transactions · webhook_events
CONTENIDO        product_reviews · site_content
TRANSVERSAL      audit_logs · vistas v_variant_availability, v_product_rating, v_product_card (lectura)
```

Diagrama de relaciones principales:

```
categories 1─N products N─1 style_lines           products N─M occasions (product_occasions)
products 1─N product_colors N─1 colors
product_colors 1─N product_images        (product_id,color_id) FK compuesta; color_id NULL = imagen general
product_colors 1─N variants N─1 sizes    (product_id,color_id) FK compuesta; UNIQUE(product,color,size)
variants 1─N inventories N─1 branches
inventories 1─N inventory_reservations N─1 online_orders
inventories 1─N inventory_movements
online_orders 1─N online_order_items N─1 variants
online_orders 1─N payment_transactions (intentos)   UNIQUE parcial: 1 APPROVED por pedido
online_orders 1─N order_events · 1─1 coupon_redemptions · 1─N order_refunds
```

---

## 3. Modelo de catálogo: productos, variantes, tallas, colores e imágenes por color

### 3.1 Tablas
| Tabla | Propósito | Claves y restricciones relevantes |
|---|---|---|
| `categories` | Camisetas, camisas, polos, jeans, pantalones, bermudas, chaquetas, calzado, accesorios | `slug` único (`^[a-z0-9-]+$`), `size_group` por defecto de la categoría, `parent_id` opcional |
| `style_lines` | Urbana, Elegante, Smart Casual | `slug` (`urbana`,`elegante`,`casual`), `tagline`, `badge`, `image_url` (lo que hoy está en `STYLE_LINES` mock) |
| `occasions` + `product_occasions` | Trabajo, cita, casual, fiesta, fin de semana, streetwear | N:M (un producto puede servir a varias ocasiones) |
| `brands` | Marca(s) | `products.brand_id` **opcional** (hoy NOT NULL con marca única) |
| `sizes` | Tallas por sistema | `size_group` ∈ `alpha` (S–XXL), `numeric_pants` (28–40), `footwear` (37–44), `one_size`; `UNIQUE(size_group, code)` (hoy `code` único global impide p. ej. "40" en pantalón y calzado) |
| `colors` | Paleta global | `slug`, `name` únicos, `hex_code` validado `#RRGGBB` |
| `products` | Ficha maestra | `slug` único, `reference` único, `details text[]`, `fit` enum, `fit_description`, `base_price`, `compare_at_price` (> precio), `status` (`draft/active/archived`), `published_at` obligatorio si `active`, flags `is_featured_new`, `is_bestseller`, borrado lógico |
| `product_colors` | **Colores que ofrece cada producto** | `UNIQUE(product_id,color_id)`, `position`, un `is_default` por producto |
| `product_images` | **Galería por color** | FK compuesta `(product_id,color_id)` → `product_colors`; `color_id NULL` = imagen general; `storage_path` (bucket) **o** `external_url` (transición), `position`, `alt_text` |
| `variants` | Talla × color vendible | FK compuesta `(product_id,color_id)` → `product_colors`; `UNIQUE(product_id,color_id,size_id)`; `sku` único; `barcode` único **opcional**; `price_override` opcional |

### 3.2 Reglas de negocio derivadas
- **Precio efectivo** = `COALESCE(variants.price_override, products.base_price)`.
- **Oferta** = `compare_at_price IS NOT NULL` (sustituye `isSale`); **% descuento** calculado (sustituye `discountPercent`).
- **Nuevo** = `is_featured_new` **o** `published_at > now() - interval '30 days'` (*DP-11*).
- **Rating y nº de reseñas** = vista `v_product_rating` sobre reseñas aprobadas (elimina 4.9/12 inventados).
- **Disponibilidad** = vista `v_variant_availability` = `Σ(stock − reserved)` por variante activa.
- **Galería del color seleccionado** = imágenes con `color_id = X` ordenadas por `position`, seguidas de las generales (`color_id IS NULL`). Verificado en el borrador (C11).
- Un producto solo es visible en tienda si `status='active' AND deleted_at IS NULL` y tiene ≥1 variante activa (regla en la vista `v_product_card` / RLS).

### 3.3 Qué desaparece
`variants.image_url` (una imagen por variante, mezcla colores) → migra a `product_images`. Columnas POS `cost_override`, `gender` (catálogo solo masculino; *DP-6*), `collection_id`/`season_id` en productos (colecciones pasan a N:M).

---

## 4. Modelo de inventario

| Tabla | Diseño |
|---|---|
| `branches` | Se conserva el nombre por compatibilidad, semántica **bodega**. `code` único, **una sola** bodega `is_default` (índice único parcial). |
| `inventories` | `stock` (físico), **`reserved`** (comprometido por pedidos en pago), `min_stock`, `CHECK reserved <= stock`, `UNIQUE(branch_id, variant_id)`. |
| `inventory_reservations` | Reserva por pedido y fila de inventario, `status` (`active/consumed/released/expired`), `expires_at`. |
| `inventory_movements` | *Append-only*; `movement_type` enum (`initial_load, restock, adjustment, sale, cancel_restore, return, damage`); `CHECK quantity_after = quantity_before + quantity_change`; **índice único parcial** `(reference_id, variant_id, movement_type) WHERE reference_type='order'` ⇒ una venta y una restauración por línea de pedido (idempotencia a nivel de BD). |

**Flujo de stock (con reserva — recomendado, *DP-1*):**
1. `create_order` → bloquea filas `inventories` (`FOR UPDATE`, orden determinista por `variant_id` para evitar *deadlocks*), valida `stock − reserved ≥ qty`, incrementa `reserved`, crea `inventory_reservations` con `expires_at = now() + TTL` (p. ej. 30 min).
2. Pago aprobado → `reserved −= qty`, `stock −= qty`, reserva `consumed`, movimiento `sale`.
3. Pago no concretado antes de `expires_at` → job `expire_pending_orders()` (pg_cron) ⇒ `reserved −= qty`, reserva `expired`, pedido `expired`.
4. Cancelación/reembolso con reingreso ⇒ movimiento `cancel_restore`/`return`.

Esto elimina el caso "cobro sin stock" detectado en M23 (B3) salvo pagos aprobados **después** de expirar la reserva; ese caso se trata en `apply_payment_event` (§7.3).

---

## 5. Modelo de pedidos, líneas, pagos, transacciones y movimientos

### 5.1 `online_orders` (cabecera)
- `order_number` desde **secuencia** (`JM-001000…`); los huecos por transacciones abortadas son aceptables.
- `public_token uuid` para que un **invitado** consulte su pedido (`get_order_public(order_number, token)`), en lugar de abrir RLS por email.
- `idempotency_key` **NOT NULL** y única.
- `user_id` **solo** desde `auth.uid()` (nunca parámetro).
- `branch_id` **NOT NULL** (bodega por defecto).
- `shipping_method_code` FK `shipping_methods`; `payment_method` enum (`wompi`, `cash_on_delivery` — *DP-2*).
- Importes `bigint`: `subtotal`, `discount_total`, `shipping_cost`, `total` con `CHECK total = subtotal − discount_total + shipping_cost` (verificado C5).
- `coupon_id` + `coupon_code` (snapshot).
- Marcas de tiempo de ciclo de vida: `payment_expires_at`, `paid_at`, `shipped_at`, `delivered_at`, `cancelled_at`, `cancel_reason`.
- Envío: `carrier`, `tracking_number`, `tracking_url`.
- `customer_document` opcional (*DP-4*: requerido para facturación electrónica DIAN).

### 5.2 `online_order_items` (líneas)
- `variant_id` y `product_id` **NOT NULL** (RESTRICT).
- Snapshot **tomado de la BD por la RPC**: `product_name`, `sku`, `size_code`, `color_name`, `image_url`, `unit_price`.
- `quantity` 1–20, `line_discount`, `CHECK line_total = unit_price*quantity − line_discount` (verificado C7), `UNIQUE(order_id, variant_id)`.
- Prorrateo del descuento de cupón en `line_discount` (necesario para reembolsos parciales y facturación).

### 5.3 Pagos
| Tabla | Diseño |
|---|---|
| `payment_transactions` | **Un registro por intento de pago.** `attempt_number`, `reference = order_number || '-' || attempt` **única** (Wompi exige referencia única por transacción → permite reintentar tras rechazo sin crear otro pedido), `provider_transaction_id` único, `amount_in_cents`, `status` (`PENDING/APPROVED/DECLINED/VOIDED/ERROR`), `raw_last_event`. **Índice único parcial: un solo `APPROVED` por pedido** (verificado C8). FK a pedido `RESTRICT` (hoy `CASCADE` borra evidencia financiera). |
| `webhook_events` | Bandeja de entrada: cada evento recibido se registra con `UNIQUE(provider, event_checksum)` antes de procesar; `result` (`applied/duplicate/ignored/rejected/error`). Da idempotencia y trazabilidad aunque el procesamiento falle. |
| `order_refunds` | Ligado al `payment_transaction` aprobado, `restock` boolean, estados `requested/approved/processed/rejected`, `provider_refund_id`. |

### 5.4 Cupones
`coupons` (código en mayúsculas validado, tipo enum `percent/fixed/free_shipping`, `min_subtotal`, `max_uses`, `max_uses_per_email`, ventana de vigencia) + `coupon_redemptions` (`reserved` al crear el pedido → `confirmed` al pagar → `released` al expirar/cancelar). `used_count` se incrementa **al confirmar**, no al crear.

### 5.5 Auditoría
- `order_events`: *append-only*, `from_status`/`to_status` tipados con el enum, `actor` (`system/customer/admin/webhook`), `metadata`.
- `audit_logs`: una sola función de auditoría (`actor_user_id`, `old_data`, `new_data`) aplicada a `products`, `variants`, `inventories`, `coupons`, `profiles.role`.

---

## 6. Máquina de estados de pedidos (BD ↔ frontend)

### 6.1 Enum `order_status`
| Valor | Etiqueta UI (es-CO) | Terminal | Sustituye |
|---|---|---|---|
| `payment_pending` | Pago pendiente | No | `pending` (eliminado), `payment_pending` |
| `paid` | Pago confirmado | No | — |
| `processing` | En preparación | No | `preparing` (UI), `packed` (SQL) |
| `shipped` | Enviado | No | — |
| `delivered` | Entregado | No (admite `refunded`) | — |
| `cancelled` | Cancelado | Sí | — |
| `expired` | Pago no completado | Sí | **nuevo** |
| `refunded` | Reembolsado | Sí | — |

> Los intentos de pago rechazados **no** cancelan el pedido: el pedido permanece en `payment_pending` hasta que haya un pago aprobado o venza `payment_expires_at`. Así funciona el reintento tras rechazo con una nueva referencia.

### 6.2 Transiciones permitidas (`order_status_transitions`)
| De | A | Actor | Efectos |
|---|---|---|---|
| `payment_pending` | `paid` | webhook | consumir reserva, movimiento `sale`, confirmar cupón, `paid_at` |
| `payment_pending` | `expired` | system | liberar reserva y cupón |
| `payment_pending` | `cancelled` | admin, customer | liberar reserva y cupón |
| `paid` | `processing` | admin | — |
| `paid` | `cancelled` | admin (nota obligatoria) | `cancel_restore`, crear `order_refunds` |
| `processing` | `shipped` | admin | requiere `carrier` + `tracking_number`, `shipped_at` |
| `processing` | `cancelled` | admin (nota obligatoria) | `cancel_restore`, reembolso |
| `shipped` | `delivered` | admin | `delivered_at` |
| `delivered` | `refunded` | admin (nota obligatoria) | reembolso; reingreso de stock opcional (`return`) |
| `paid` / `processing` | `refunded` | admin (nota obligatoria) | reembolso total; `cancel_restore` |
| `expired` | `paid` | webhook | **Excepción controlada**: pago aprobado tardío. Reintenta reservar/consumir; si no hay stock ⇒ queda `paid` con evento `PAID_WITHOUT_STOCK` y alerta para reembolso manual |

Toda otra transición se rechaza en `transition_order()`. Un evento `DECLINED/VOIDED` **nunca** degrada un pedido `paid` o posterior (corrige M23 B8.2).

### 6.3 Compatibilidad con el frontend
- La tabla de transiciones y las etiquetas se exponen con una RPC de solo lectura `get_order_status_catalog()` (o vista pública), para que `AdminOrdersPage` y `OrderConfirmationPage` construyan selectores y líneas de tiempo **desde la BD**.
- Los tipos TypeScript se generan con `supabase gen types typescript` (incluye los enums) y se usan en servicios del frontend.

---

## 7. RPC objetivo

Convenciones: `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC` y `GRANT EXECUTE` explícito por rol, errores con `ERRCODE` y código de negocio (`JM001…`) para que el frontend los traduzca.

### 7.1 Públicas / cliente
| Función | Rol | Descripción |
|---|---|---|
| `quote_cart(p_items jsonb, p_coupon_code text, p_shipping_method text)` | anon, authenticated | Totales autoritativos para mostrar en carrito y checkout (elimina el cálculo divergente del cliente). Sin efectos. |
| `validate_coupon(p_code text, p_subtotal bigint, p_email text)` | anon, authenticated | Vigencia, mínimo, usos; devuelve el descuento. |
| `create_order(p_customer jsonb, p_shipping jsonb, p_items jsonb, p_coupon_code text, p_shipping_method text, p_payment_method payment_method, p_idempotency_key text)` | anon, authenticated | Valida, reserva stock y cupón, crea cabecera y líneas desde BD; `user_id = auth.uid()`; devuelve `order_id`, `order_number`, `public_token`, totales. Idempotente. |
| `get_order_public(p_order_number text, p_public_token uuid)` | anon, authenticated | Estado, líneas, totales y línea de tiempo para invitados (sustituye a la `get_order_status` inexistente). |
| `cancel_my_order(p_order_id uuid)` | authenticated | Solo `payment_pending` y propietario. |
| `get_order_status_catalog()` | anon, authenticated | Estados, etiquetas y transiciones. |

### 7.2 Pagos (solo `service_role`, invocadas por la función de servidor)
| Función | Descripción |
|---|---|
| `create_payment_attempt(p_order_id uuid, p_public_token uuid)` | Verifica `payment_pending` y vigencia, crea `payment_transactions` (`attempt_number+1`, referencia única) y devuelve referencia + `amount_in_cents`. La firma SHA-256 la calcula la función de servidor con `WOMPI_INTEGRITY_SECRET` (el secreto no entra en la BD; *DP-12*). |
| `apply_payment_event(p_event jsonb, p_event_checksum text)` | **Una transacción**: registra en `webhook_events` (duplicado ⇒ `duplicate`), localiza el intento por `reference`, valida monto/moneda, actualiza el intento, aplica `transition_order` (consumo de reserva, movimiento `sale`, confirmación de cupón) o marca el intento rechazado sin tocar el pedido. El webhook HTTP queda en: verificar firma → llamar esta RPC → responder. |
| `expire_pending_orders()` | Job programado (pg_cron cada 5 min, *DP-1*). |

### 7.3 Administración (authenticated + `is_admin()` dentro de la función)
| Función | Descripción |
|---|---|
| `admin_upsert_product(p_product jsonb)` | Producto + colores + imágenes + variantes + stock inicial en **una transacción**; genera SKU (`REF-COLOR-TALLA`). |
| `admin_set_product_status(p_product_id, p_status)` | Publicar/archivar con validaciones (≥1 variante activa e imagen para publicar). |
| `admin_adjust_inventory(p_variant_id, p_branch_id, p_delta, p_type inventory_movement_type, p_reason)` | Ajuste con movimiento. |
| `transition_order(p_order_id, p_to order_status, p_actor event_actor, p_note text, p_tracking jsonb)` | Única puerta de cambio de estado; valida contra `order_status_transitions` y aplica efectos. Usada también internamente por `apply_payment_event` y `expire_pending_orders`. |
| `admin_request_refund(p_order_id, p_amount, p_reason, p_restock)` | Crea `order_refunds`; la ejecución en Wompi queda manual o futura (*DP-15*). |
| `admin_dashboard_metrics(p_from date, p_to date)` | Ventas, ticket medio, pedidos por estado, stock bajo — sin literales de estado inexistentes. |
| `admin_upsert_coupon`, `admin_moderate_review`, `admin_set_site_content`, `admin_set_user_role` (solo super_admin) | CRUD de módulos hoy simulados. |

### 7.4 Helpers
`is_admin()`, `is_super_admin()`, `current_app_role()`; `handle_new_user()` (crea perfil `customer`, copia `email`); `set_updated_at()`; `audit_row_change()`.

### 7.5 Funciones actuales y su destino
| Actual | Destino |
|---|---|
| `create_online_order_validated` | Eliminar |
| `create_online_order_validated_idempotent` | Sustituir por `create_order` *(opcional: envoltorio de compatibilidad temporal, ver estrategia)* |
| `process_online_order_inventory`, `restore_online_order_inventory`, `trg_fn_auto_inventory_on_paid` | Sustituir por efectos de `transition_order` (sin trigger oculto en `UPDATE`) |
| `update_order_status`, `update_order_status_oms` | Sustituir por `transition_order` |
| `adjust_inventory_stock` | Sustituir por `admin_adjust_inventory` |
| `get_commercial_dashboard_metrics` | Sustituir por `admin_dashboard_metrics` |
| `get_available_stock` | Sustituir por vista `v_variant_availability` |
| `is_admin`, `handle_new_user_profile`, `update_modified_column`, `process_audit_log_hardened` | Reescribir (`is_admin`, `handle_new_user`, `set_updated_at`, `audit_row_change`) |
| POS: `create_sale_atomic`, `deduct_inventory_on_sale*`, `validate_shift_*`, `validate_sale_shift_active`, `has_permission`, `current_employee_*`, `refresh_analytics_views`, `process_audit_log` | Eliminar |

---

## 8. Seguridad de acceso (RLS objetivo, nivel funcional)

| Tabla | anon | cliente (authenticated) | admin / super_admin | service_role |
|---|---|---|---|---|
| catálogo (`categories`, `style_lines`, `occasions`, `sizes`, `colors`, `brands`, `collections*`) | SELECT activos | SELECT activos | ALL | ALL |
| `products`, `product_colors`, `product_images`, `variants` | SELECT si producto `active` | igual | ALL vía RPC admin (SELECT directo) | ALL |
| `inventories` | — (usar vista de disponibilidad) | — | SELECT; escritura solo RPC | ALL |
| `inventory_movements`, `inventory_reservations` | — | — | SELECT | ALL |
| `online_orders` | — (usar `get_order_public`) | SELECT `user_id = auth.uid()` | SELECT | ALL |
| `online_order_items`, `order_events` | — | SELECT si el pedido es suyo | SELECT | ALL |
| `payment_transactions`, `webhook_events`, `order_refunds` | — | SELECT de sus pagos (opcional) | SELECT | ALL |
| `coupons` | — (usar `validate_coupon`) | — | ALL | ALL |
| `product_reviews` | SELECT `approved` | SELECT `approved` + INSERT si compró | ALL | ALL |
| `profiles` | — | SELECT/UPDATE propio (sin `role`) | SELECT; `role` solo super_admin vía RPC | ALL |
| `customer_addresses`, `wishlist_items` | — | ALL propio | SELECT | ALL |
| `site_content` | SELECT | SELECT | ALL vía RPC | ALL |
| `audit_logs` | — | — | SELECT (super_admin) | INSERT |

**Ninguna** tabla de pedidos/pagos acepta INSERT/UPDATE directo de anon o authenticated (corrige M23 C3/C4).
Storage: bucket `product-images` y `site-content` con lectura pública y escritura solo admin.

---

## 9. Seeds deterministas para pruebas

### 9.1 Separación
| Tipo | Ubicación | Entornos |
|---|---|---|
| **Datos de referencia** (necesarios en todo entorno): tallas por sistema, colores base, bodega por defecto, métodos de envío, catálogo de estados/transiciones, líneas de estilo, ocasiones, categorías | **Dentro de la migración base** con `INSERT … ON CONFLICT DO NOTHING` y UUID fijos | Local, CI, QA, Production |
| **Datos de prueba** | `supabase/seeds/*.sql` (referenciados desde `config.toml` `[db.seed]`) | Solo local, CI y QA. **Nunca** Production |

### 9.2 Contenido mínimo de los datos de prueba (`seed_qa`)
| Grupo | Datos | Caso que cubre |
|---|---|---|
| Usuarios (`auth.users` + `profiles`) | `superadmin@qa.jm.test`, `admin@qa.jm.test`, `cliente1@qa.jm.test`, `cliente2@qa.jm.test` (contraseñas solo QA) | Roles y RLS |
| Producto P1 camiseta | 3 colores × 5 tallas (alpha), 2–3 imágenes por color + 1 general, stock variado | Galería por color, tallas agotadas |
| Producto P2 jean | 2 colores × tallas numéricas 30–36 | `size_group` numérico |
| Producto P3 calzado | 1 color × tallas 38–43 | `size_group` footwear |
| Producto P4 "última unidad" | 1 variante con stock 1 | Concurrencia / sobreventa |
| Producto P5 agotado | stock 0 en todas | Estados sin stock |
| Producto P6 en oferta | `compare_at_price` | Oferta |
| P7 borrador, P8 archivado | — | Visibilidad |
| Cupones | `QA10` (10 %), `QAFIJO20K` (20.000), `QAENVIO` (envío gratis, mínimo 150.000), `QAEXPIRADO`, `QAAGOTADO` (max_uses alcanzado), `QAFUTURO` (no iniciado) | Validación de cupones |
| Pedidos | uno por cada estado del enum, incluidos `expired` y `refunded`, con eventos, intentos de pago (rechazado + aprobado) y movimientos coherentes | OMS, dashboard, línea de tiempo |
| Reseñas | aprobadas, pendientes, rechazadas | Moderación, rating |

UUID con patrón legible y v4 válido: `00000000-0000-4000-8000-0000000XXYYY` (XX = dominio, YYY = secuencia). Fechas relativas a `now()` solo donde la prueba lo requiera; en lo demás, fechas fijas para reproducibilidad.

---

## 10. Objetos POS heredados: inventario y destino

| Objeto | Tipo | Uso actual en código | Destino |
|---|---|---|---|
| `employees`, `shifts`, `sales`, `sale_items`, `transfers`, `transfer_items` | tablas | `syncStore.js` (RPC POS), páginas legado no enrutadas | No existen en el esquema objetivo |
| `customers` (cédula, puntos) | tabla | ninguno | Eliminar (*DP-8*: puntos de fidelidad) |
| `role_permissions`, enum `user_role` | tabla/enum | ninguno | Eliminar (roles en `profiles.role`) |
| `seasons` | tabla | ninguno | Eliminar (o reactivar como colección) |
| `mv_daily_sales`, `mv_monthly_sales`, `mv_top_products` | vistas materializadas | ninguno | Eliminar; métricas por RPC |
| enums `shift_status`, `payment_method_type`, `sale_status_type`, `transfer_status_type`, `gender_type` | enums | `@jm/shared` (constantes POS) | Eliminar |
| funciones POS (§7.5) | funciones | `syncStore.js` | Eliminar |
| triggers `sale_deduct_inventory`, `check_*`, `audit_sales_trigger`, `update_employees_modtime`, `update_transfers_modtime` | triggers | — | Eliminar |
| políticas `branch_select_policy`, `inventory_select_policy`, `audit_select_policy`, `employee_all_policy`, `variant_read_policy`, `customer_read_policy` | políticas | — | Eliminar |

El inventario completo del esquema que hoy reconstruye el repo (32 tablas, 8 enums, 35 funciones, 17 triggers, 47 políticas, 3 vistas materializadas) está en `anexos/inventario_actual_*.txt`.

---

## 11. Decisiones pendientes (requieren al propietario)

| ID | Decisión | Recomendación |
|---|---|---|
| DP-1 | ¿Reservar stock al crear pedido? TTL | **Sí**, 30 min (alineado con la sesión de pago) + job de expiración |
| DP-2 | ¿Pago contraentrega? | **No en el primer release**; el enum lo admite para activarlo después con su propio flujo |
| DP-3 | Métodos y tarifas de envío (estándar, expreso, umbral de envío gratis) | Tabla `shipping_methods`; el negocio define tarifas |
| DP-4 | ¿Pedir cédula/NIT? ¿Facturación electrónica DIAN? | Campo opcional ahora; obligatorio si se factura electrónicamente |
| DP-5 | Precios con IVA incluido y desglose fiscal | IVA incluido; añadir `tax_rate` por línea cuando se integre facturación |
| DP-6 | ¿Solo moda masculina? (`gender`) | Sí; se elimina `gender` |
| DP-7 | Consulta de pedido de invitado | `public_token` en la URL de retorno + correo |
| DP-8 | Programa de puntos | Fuera de alcance; eliminar `customers.points` |
| DP-9 | Ruta de Production: transformación in situ vs proyecto nuevo + ETL | Ver `M24A_ESTRATEGIA_MIGRACIONES.md` §5 |
| DP-10 | ¿Carrito en servidor? | Solo para usuarios autenticados (fase posterior); invitados en `localStorage`. Las tablas `carts/cart_items` **no** forman parte del núcleo inicial |
| DP-11 | Regla de "Nuevo" y "Más vendido" | Manual (flag) en el primer release; automática después |
| DP-12 | ¿Dónde vive el webhook y la firma? | Ambos en Vercel `/api/wompi/*`, Edge Function retirada; lógica en `apply_payment_event` |
| DP-13 | Dinero `bigint` pesos vs `numeric(12,2)` | `bigint` pesos |
| DP-14 | ¿Vincular pedidos de invitado a la cuenta al registrarse con el mismo correo? | Sí, con correo verificado |
| DP-15 | Reembolsos automáticos vía API Wompi | Manual en el primer release, registrado en `order_refunds` |
| DP-16 | "Looks" con precio de paquete | `collections.kind='look'` sin precio de paquete en el primer release |
| DP-17 | Tratamiento de pedidos históricos con datos no verificables (precio de línea del cliente, totales inconsistentes) | Copiarlos tal cual con bandera `legacy_unverified` (columna solo en entornos migrados); nunca recalcular historia |

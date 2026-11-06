# M24B — FUNCIONES RPC Y TRIGGERS · J&M FASHION STORE

Todas las funciones:
- son `SECURITY DEFINER` con `search_path` fijo (`''`), salvo los triggers simples;
- arrancan con `REVOKE ALL … FROM PUBLIC, anon, authenticated` y reciben `GRANT EXECUTE` explícito;
- las internas viven en el esquema **`private`**, que PostgREST no expone.

**Evidencia de ejecución:** la columna "Llamadas" proviene de `pg_stat_user_functions` (`track_functions = 'all'`) durante la ejecución completa de seeds y pruebas (`evidencias/llamadas_por_funcion.txt`). La columna "Pruebas" indica las suites pgTAP que verifican su comportamiento.

---

## 1. Errores de negocio (contrato con el frontend)

Las funciones lanzan `RAISE EXCEPTION` con mensaje en español y un **código estable en `HINT`**; PostgREST lo devuelve en `error.hint`. Los permisos usan `SQLSTATE 42501`.

| HINT | Significado |
|---|---|
| `JM_FORBIDDEN` | Rol insuficiente (42501) |
| `JM_EMPTY_CART`, `JM_TOO_MANY_ITEMS`, `JM_INVALID_ITEM`, `JM_INVALID_QUANTITY` | Carrito inválido (vacío, > 20 líneas, forma o cantidad 1–20) |
| `JM_VARIANT_UNAVAILABLE` | Variante inexistente, inactiva o de producto no publicado |
| `JM_OUT_OF_STOCK` | Stock disponible insuficiente; el mensaje detalla producto, talla, color, disponibles y solicitadas |
| `JM_INVALID_CUSTOMER`, `JM_INVALID_EMAIL`, `JM_INVALID_PHONE`, `JM_INVALID_SHIPPING` | Datos del cliente o del envío inválidos |
| `JM_IDEMPOTENCY_KEY` | Clave de idempotencia ausente o fuera de 8–150 caracteres |
| `JM_SHIPPING_UNAVAILABLE` | Método de envío inexistente o inactivo |
| `JM_COUPON_<RAZÓN>` | Cupón rechazado: `NOT_FOUND`, `EXPIRED`, `NOT_STARTED`, `MIN_SUBTOTAL`, `EXHAUSTED`, `EMAIL_LIMIT` |
| `JM_ORDER_NOT_FOUND`, `JM_ORDER_NOT_PAYABLE`, `JM_PAYMENT_WINDOW_EXPIRED`, `JM_TOO_MANY_ATTEMPTS` | Pagos |
| `JM_INVALID_TRANSITION`, `JM_NOTE_REQUIRED`, `JM_TRACKING_REQUIRED` | Máquina de estados |
| `JM_UNKNOWN_CATEGORY/STYLE_LINE/OCCASION/COLOR/SIZE`, `JM_COLORS_REQUIRED`, `JM_COLOR_NOT_DECLARED`, `JM_COLOR_IN_USE`, `JM_PUBLISH_NO_VARIANTS`, `JM_PUBLISH_NO_IMAGES`, `JM_PRODUCT_NOT_FOUND` | Catálogo |
| `JM_INVALID_MOVEMENT`, `JM_BELOW_RESERVED`, `JM_VARIANT_NOT_FOUND` | Inventario |
| `JM_LAST_SUPER_ADMIN`, `JM_USER_NOT_FOUND` | Roles |
| `JM_APPEND_ONLY`, `JM_CONFIG`, `JM_INVALID_EVENT` | Integridad / configuración |

---

## 2. RPC de tienda (`anon`, `authenticated`)

| Función | Qué hace | Llamadas | Pruebas |
|---|---|---|---|
| `quote_cart(p_items jsonb, p_coupon_code text = NULL, p_shipping_method text = 'standard', p_email text = NULL) → jsonb` | Cotización autoritativa **sin efectos**: líneas con precio de BD, disponibilidad e `in_stock`, subtotal, descuento, envío, total, estado del cupón y `can_checkout` | 5 | 20 |
| `validate_coupon(p_code, p_subtotal bigint, p_email = NULL) → jsonb` | `{code, valid, reason, discount_amount, free_shipping}`; insensible a mayúsculas y espacios | 10 | 60 |
| `create_order(p_customer jsonb, p_shipping jsonb, p_items jsonb, p_coupon_code = NULL, p_shipping_method = 'standard', p_idempotency_key) → jsonb` | Valida los datos. Toma precio, nombre, SKU, talla, color e imagen **de la BD** e ignora cualquier otro campo del cliente. Bloquea el inventario en orden determinista y **reserva 30 min**. Aplica y reserva el cupón (un cupón inválido es un **error**, no se ignora). Calcula el envío sobre el neto, prorratea el descuento en las líneas y registra `ORDER_CREATED`. `user_id = auth.uid()`. Idempotente por clave con bloqueo *advisory* | 38 | 20, 30, 40, 50, 60, 95 |
| `get_order_public(p_order_number, p_public_token uuid) → jsonb` | Estado, etiqueta, totales, envío, guía, líneas y línea de tiempo para **invitados**. Devuelve `NULL` si el token no coincide, sin confirmar si el número existe | 2 | 70 |
| `cancel_my_order(p_order_id, p_public_token = NULL, p_reason = NULL) → jsonb` | El propietario (por JWT) o el invitado (por token) cancela **solo** en `payment_pending`. Libera reservas y cupón | 5 | 50, 60 |
| `get_order_status_catalog() → jsonb` | `{statuses[8], transitions[13]}` con etiquetas en español, para la UI | 3 | 70 |

Forma de `p_customer`: `{"name", "email", "phone", "document"?}`.
Forma de `p_shipping`: `{"department", "city", "address", "neighborhood"?, "notes"?}`.
Forma de `p_items`: `[{"variant_id", "quantity"}]`.

## 3. RPC de pagos (solo `service_role`, desde la función de Vercel)

| Función | Qué hace | Llamadas | Pruebas |
|---|---|---|---|
| `create_payment_attempt(p_order_id, p_public_token) → jsonb` | Exige `payment_pending` y ventana vigente. Crea el intento N con referencia `NÚMERO-N` (máx. 10) y devuelve `reference`, `amount_in_cents` y correo. La firma SHA-256 la calcula Vercel con `WOMPI_INTEGRITY_SECRET`; el secreto no entra en la BD | 23 | 30, 40, 50, 60, 70, 80, 95 |
| `apply_payment_event(p_event jsonb, p_event_checksum text) → jsonb` | El evento llega **ya verificado criptográficamente** por Vercel. Todo ocurre en una transacción (detalle abajo) | 33 | 40, 50, 60, 70, 80, 95 |
| `expire_pending_orders() → int` | Vence los pedidos `payment_pending` con la ventana cumplida (`FOR UPDATE SKIP LOCKED`), libera reservas y cupones. Programada con pg_cron cada 5 min | 5 | 30, 40 |

Pasos de `apply_payment_event`:
1. Inserta el evento en `webhook_events`. Si el checksum ya existe, responde `duplicate` y no hace nada más.
2. Valida el tipo de evento (`transaction.updated`), la estructura, que la referencia exista, que el id de transacción no sea de otro intento ni se reutilice, y el monto y la moneda.
3. Aplica el estado al intento:
   - **APPROVED** → transición `paid`: consume la reserva (o descuenta stock si la reserva venció), movimiento `sale`, cupón confirmado y `used_count + 1`.
   - **APPROVED** sobre un pedido ya pagado, o cancelado → `requires_refund` + `needs_attention`, sin tocar el stock.
   - **DECLINED / ERROR / VOIDED** → el intento queda fallido y el **pedido sigue pendiente**, lo que permite reintentar.
   - **VOIDED** después de pagado → revisión manual.
4. Devuelve `{result, detail, order_status, attempt_status}`.

## 4. RPC de administración (`authenticated` + verificación interna de rol)

| Función | Qué hace | Llamadas | Pruebas |
|---|---|---|---|
| `admin_upsert_product(p jsonb) → jsonb` | Producto, ocasiones, colores (con color por defecto), imágenes por color e imágenes generales, variantes (SKU `REFERENCIA-COLOR-TALLA` automático) e inventario inicial con movimiento `initial_load`, en **una transacción**. Las variantes no listadas se desactivan; no se puede quitar un color con variantes. Valida categoría, línea, ocasión, color y talla según el sistema de tallas | 11 | 10 (y seeds) |
| `admin_set_product_status(p_product_id, p_status) → jsonb` | Publicar exige ≥1 variante activa y ≥1 imagen; asigna `published_at` | 8 | 10 |
| `admin_adjust_inventory(p_variant_id, p_quantity_change, p_movement_type, p_reason, p_branch_id = NULL) → jsonb` | Solo los tipos `restock` (+), `return` (+), `damage` (−) y `adjustment` (±), con motivo obligatorio. No deja el stock por debajo de lo reservado. Registra el movimiento | 2 | 10, 50 |
| `admin_transition_order(p_order_id, p_to, p_note = NULL, p_tracking jsonb = NULL) → jsonb` | Única puerta de cambio de estado para el admin; delega en `private.transition_order` | 20 | 50, 70 |
| `admin_dashboard_metrics(p_from = inicio de mes, p_to = now()) → jsonb` | Ventas brutas, pedidos pagados, ticket promedio, unidades, reembolsos solicitados, pedidos por estado (8), pedidos con atención pendiente, variantes con stock bajo y top 5 de productos | 2 | 80 |
| `admin_set_user_role(p_user_id, p_role) → jsonb` | Solo super_admin; impide retirar al último super_admin | 1 | 90 |

## 5. Funciones de permisos (usadas por RLS)
| Función | Llamadas | Pruebas |
|---|---|---|
| `is_admin(uuid = auth.uid()) → boolean` | 216 | 01, 10, 90 |
| `is_super_admin(uuid = auth.uid()) → boolean` | 314 | 90 |

## 6. Funciones internas (`private`)

| Función | Rol | Llamadas |
|---|---|---|
| `transition_order(order, to, actor, user, note, tracking, metadata)` | Valida contra `order_status_transitions` (actor y nota) y aplica los efectos: pagar (stock y cupón), vencer o cancelar pendiente (liberar), cancelar o reembolsar pagado (reingreso + `order_refunds`), entregado→reembolsado (sin reingreso), enviar (exige guía), entregar. Registra `STATUS_CHANGED` | 47 |
| `price_items(items, lock)` | Valida forma, agrupa duplicados, verifica variantes y productos activos, bloquea el inventario en orden y devuelve precios de BD | 49 |
| `evaluate_coupon(code, subtotal, email, lock)` | Vigencia, mínimo, usos (`used_count` + reservas vigentes) y límite por correo | 29 |
| `shipping_cost(method, net_subtotal, free)` | Tarifa del método o 0 si supera el umbral o hay cupón de envío | 42 |
| `release_reservations(order, status)` | `reserved −= qty` y estado de la reserva | 10 |
| `commit_stock_for_order(order, actor)` | Consume la reserva o descuenta stock; si falta stock, reporta faltantes sin dejar negativos | 18 |
| `restore_stock_for_order(order, actor)` | Reingresa lo efectivamente vendido según el libro de movimientos, una sola vez | 3 |
| `require_admin()`, `default_branch_id()`, `reservation_ttl()` | Utilidades | 62 / 127 / 10 |

## 7. Triggers

| Trigger | Tablas | Función | Llamadas | Pruebas |
|---|---|---|---|---|
| `trg_*_updated_at` | 14 tablas mutables | `private.set_updated_at` | 213 | indirectas |
| `trg_*_audit` | products, variants, product_colors, coupons, shipping_methods, branches, profiles | `private.audit_row_change` | 131 | 90 (super_admin ve auditoría) |
| `trg_*_append_only` | inventory_movements, order_events, audit_logs | `private.forbid_mutation` | 0 (\*) | 01 (UPDATE/DELETE rechazados con `P0001`) |
| `trg_profiles_guard_role` | profiles | `private.guard_profile_role` | 6 | 90 |
| `on_auth_user_created` | auth.users | `private.handle_new_user` | 4 | seeds (4 perfiles `customer` creados) |

(\*) `forbid_mutation` siempre termina en excepción y PostgreSQL no contabiliza en `pg_stat_user_functions` las llamadas abortadas. Su ejecución está demostrada por las aserciones `throws_ok` de `01_structure`, que reciben exactamente su error.

## 8. Funciones del sistema anterior que desaparecen
`create_online_order_validated`, `create_online_order_validated_idempotent`, `process_online_order_inventory`, `restore_online_order_inventory`, `trg_fn_auto_inventory_on_paid`, `update_order_status`, `update_order_status_oms`, `adjust_inventory_stock`, `get_commercial_dashboard_metrics`, `get_available_stock`, `handle_new_user_profile`, `update_modified_column`, `process_audit_log*` y todas las POS. Sus equivalentes están en `M24B_COMPATIBILIDAD_FRONTEND_BACKEND.md`.

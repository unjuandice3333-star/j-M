# 26 — AUDITORÍA DE BASES DE DATOS · J&M FASHION STORE

**Repositorio:** `unjuandice3333-star/j-m` · `main` · `2661f2a`
**Alcance:** 16 migraciones en `supabase/migrations/`. Sin acceso a Supabase QA/Production (por restricción). Se reconstruyó la BD **en un PostgreSQL 16 local y efímero** para obtener evidencia objetiva.

---

## 1. Método de verificación

1. `initdb` local en directorio temporal; puerto 54329; sin conexión a ningún servicio remoto.
2. *Shim* mínimo de Supabase (`evidencias/shim.sql`): roles `anon`, `authenticated`, `service_role` (BYPASSRLS), esquema `auth` con `users`, `auth.uid()` y `auth.role()` leyendo `request.jwt.claim.*`.
3. Cada migración aplicada en orden, **cada una en su propia transacción** (`psql --single-transaction -v ON_ERROR_STOP=1`), como hace Supabase CLI.
4. Luego, pruebas funcionales SQL (`evidencias/runtime_tests.sql`, `runtime_tests2.sql`) con salida en `evidencias/runtime_tests_output.txt`.

Limitación: el *shim* no reproduce todo Supabase (p. ej. extensiones, `storage`, `pg_net`). Los errores encontrados son de esquema/SQL puro y no dependen de esas diferencias.

---

## 2. Resultado de la reconstrucción desde cero

`evidencias/rebuild_run1.txt`:

| Migración | Resultado |
|---|---|
| 20260508000000_init_schema | OK |
| 20260508010000_security_hardening | OK |
| 20260927000000_ecommerce_expansion | OK |
| 20260927010000_security_wompi_hardening | OK |
| 20260927030000_auth_profiles_rls | OK |
| 20260927040000_carts_server_side | OK |
| 20260927050000_production_hardening_audit | OK |
| 20260927060000_oms_inventory_movements_refunds | OK |
| 20260927070000_phase8_analytics_tracking_metrics | OK |
| 20260927080000_admin_authorized_email_role | OK |
| 20260927090000_strict_customer_role_on_signup | OK |
| **20260929000000_cleanup_pos_architecture** | **FALLA** — `cannot drop table sale_items because other objects depend on it` |
| 20260929010000_fix_payment_inventory_atomicity | OK (pero crea funciones que fallan en ejecución) |
| **20260930010000_fix_sizes_colors_rls_and_order_branch** | **FALLA** — `column "branch_id" of relation "online_orders" does not exist` |
| 20261001000000_restore_is_admin_execute_grant | OK |
| 20261001010000_cleanup_legacy_has_permission_policies | OK |

**Veredicto: la base de datos NO se puede reconstruir desde el repositorio.** Estado: **PRESENTA ERRORES** · Prioridad **P0**.

Errores completos dentro de `20260929000000_cleanup_pos_architecture.sql` (ejecución sin detenerse):
- `DROP TABLE sale_items` ← depende `mv_top_products` (vista materializada).
- `DROP TABLE sales/shifts/employees` ← dependen FKs de las tablas anteriores (sin `CASCADE`).
- `DROP FUNCTION current_employee_branch()/current_employee_role()` ← dependen las políticas `branch_select_policy` (branches), `inventory_select_policy` (inventories), `audit_select_policy` (audit_logs), que nunca se eliminan (los `DROP POLICY` usan otros nombres).

**Consecuencia — *drift* de esquema (inferencia fuerte):** las migraciones `…0929…` y `…0930…` se escribieron para una BD que **sí tiene** `online_orders.branch_id`, `inventory_movements.inventory_id`, `inventory_movements.notes`, `audit_logs.performed_by`, `products.slug`, `products.style_line_id`, `products.images`. Ninguna migración crea esas columnas. La BD remota fue modificada **fuera del control de versiones** (SQL Editor u otro medio). El repositorio **no es fuente de verdad** del esquema.

---

## 3. Modelo de datos (según migraciones)

### Tablas e-commerce vigentes
`products`, `variants`, `sizes`, `colors`, `categories`, `brands`, `collections`, `seasons`, `style_lines`, `branches`, `inventories`, `inventory_movements`, `carts`, `cart_items`, `customers`, `customer_addresses`, `profiles`, `online_orders`, `online_order_items`, `order_events`, `order_refunds`, `payment_transactions`, `coupons`, `product_reviews`, `audit_logs`, `role_permissions`.

### Legado POS (debía eliminarse, sigue existiendo en una reconstrucción limpia)
`employees`, `shifts`, `sales`, `sale_items`, `transfers`, `transfer_items`, vistas `mv_daily_sales`, `mv_monthly_sales`, `mv_top_products`, funciones `create_sale_atomic`, `deduct_inventory_on_sale*`, `validate_shift_*`, `has_permission`, `current_employee_*`, enum `user_role` (POS).

### Relaciones clave
- `products 1─N variants` (`ON DELETE CASCADE`), `variants N─1 sizes/colors` (`RESTRICT`).
- `inventories (branch_id, variant_id)` UNIQUE, `stock >= 0`.
- `online_orders 1─N online_order_items` (CASCADE), `online_order_items.variant_id → variants` (RESTRICT, **nullable**).
- `payment_transactions.order_id → online_orders` (CASCADE — borrar un pedido borra el rastro de pagos: no recomendable).
- `online_orders.user_id → auth.users` (SET NULL).

---

## 4. Hallazgos por componente

### D1 — Tipos y columnas · PRESENTA ERRORES (P0)
| Problema | Evidencia |
|---|---|
| Columnas usadas por código y funciones que no existen en migraciones: `online_orders.branch_id`, `inventory_movements.inventory_id/notes`, `audit_logs.performed_by`, `order_events.description`, `products.slug/style_line_id/images` | T8; grep de `ADD COLUMN` |
| Enum `online_order_status` no contiene `packed` ni `preparing`, usados en funciones y UI | T5b, T6, métricas |
| `inventory_movements.movement_type` CHECK no admite `ONLINE_SALE`, `RETURN_CANCEL` usados por funciones | lectura de `…0929010000…` |
| Imágenes: solo `variants.image_url` (una por variante). **No hay modelo de galería por color** (`product_images` con orden y color) | `20260508000000_init_schema.sql:120` |
| Campos de catálogo que el frontend filtra (`fit`, `occasion`, `is_new`, `is_sale`, `original_price`, `details`) no existen | `productService.js:93-111` |

### D2 — Funciones y procedimientos · PRESENTA ERRORES (P0)
| Función | Estado | Evidencia |
|---|---|---|
| `create_online_order_validated_idempotent` | Funciona, pero guarda precio/nombre del cliente en líneas | T1, T12 |
| `process_online_order_inventory` | Falla en ejecución (`branch_id`) | T4 |
| `restore_online_order_inventory` | Mismo defecto (columnas inexistentes) | lectura |
| `update_order_status_oms` | Falla siempre (`'packed'`) | T5b |
| `update_order_status` | Funciona; transiciones débiles; sin restauración de stock | T6 |
| `get_commercial_dashboard_metrics` | Falla siempre (`'packed'`) | evidencias |
| `adjust_inventory_stock` | Funciona local; permiso EXECUTE revocado en remoto (inferencia) | `…0929000000…:369` |
| `get_order_status` | **No existe** pero lo llama `OrderConfirmationPage.jsx:96,152` | T7 |
| `refresh_analytics_views` | Sobre tablas POS; sin uso | lectura |

### D3 — Triggers · PARCIAL (P1)
- `update_*_modtime`: OK en tablas base; **faltan** en `online_orders`, `carts`, `cart_items`, `customer_addresses`, `profiles`, `coupons`, `payment_transactions`.
- `audit_*_trigger` → `process_audit_log_hardened()`: la versión de `…0929000000…` inserta `performed_by` (no existe). Si esa versión está en remoto, **cualquier INSERT/UPDATE de productos, variantes o inventario fallaría** salvo que exista la columna (otro indicio de *drift*).
- `trg_auto_inventory_on_paid`: correcto en intención; falla por D2.

### D4 — RLS y permisos · PRESENTA ERRORES (P0) — *hallazgos funcionales, no auditoría avanzada de seguridad*
| Problema | Evidencia |
|---|---|
| `order_restricted_read`: **cualquier usuario autenticado ve todos los pedidos** (nombre, email, teléfono, dirección de todos los clientes). `AccountPage.jsx` consulta `online_orders` sin filtro ⇒ un cliente vería pedidos ajenos | T10, T14 |
| `payment_transactions_admin_policy FOR ALL USING (auth.role()='authenticated')`: **un cliente autenticado puede modificar pagos** (`status='APPROVED'`) | T16 |
| `order_public_insert WITH CHECK (TRUE)`: anon inserta pedidos `paid` con total 0 sin RPC | T11 |
| `online_order_items` **sin política SELECT** ⇒ el cliente no ve sus ítems; el admin tampoco (salvo `service_role`) | T14 |
| Pedidos de invitados no legibles por anon ⇒ página de confirmación sin datos (y la RPC alternativa no existe) | T9, T7 |
| `REVOKE ALL ON ALL FUNCTIONS … FROM anon, authenticated` sin re-`GRANT` de funciones admin | `…0929000000…:369` |
| Políticas `inventory_admin_*` y `branch_admin_write` exigen `role='admin'` (excluye `super_admin`) | `…0929000000…:338-363` |
| Cupones activos enumerables por anon | T13 |

### D5 — Índices y restricciones · IMPLEMENTADO, PERO NO VERIFICADO (P2)
Índices presentes para FKs principales, SKU, barcode, `order_number`, `idempotency_key`, `user_id`. Índices redundantes (UNIQUE ya crea índice: `idx_products_reference`, `idx_variants_sku`, `idx_variants_barcode`, `idx_online_orders_number`, `idx_coupons_code`). Falta índice funcional `UPPER(code)` en cupones (la RPC busca por `UPPER(code)`). Sin pruebas de rendimiento.

### D6 — Integridad referencial · PARCIAL (P1)
- `online_order_items.variant_id` nullable y `product_id` nunca se rellena.
- `payment_transactions ON DELETE CASCADE` desde pedidos (pérdida de evidencia financiera).
- `products.brand_id NOT NULL` en un modelo de marca única.

### D7 — Migraciones y dependencias · PRESENTA ERRORES (P0)
- Orden de dependencias roto (sección 2).
- Migraciones que modifican datos de usuarios por email fijo (`…080000…`, `…090000…`).
- Hueco de numeración (`20260927020000` no existe) — no es error, pero indica migraciones eliminadas o aplicadas a mano.
- No existe `supabase/config.toml` ni `supabase/seed.sql`: **no se puede ejecutar `supabase start`/`db reset`** localmente tal como está.

### D8 — Datos necesarios por módulo · PARCIAL (P1)
Seeds: 4 tallas, 4 colores, 1 bodega, 2 categorías, 1 marca. **No hay productos, variantes ni inventario semilla** ⇒ en una BD limpia el catálogo queda vacío (el frontend solo cae al mock cuando la consulta da error; con 0 filas muestra catálogo vacío). Faltan seeds de `style_lines` (el admin las consulta), cupones de prueba y un admin de QA.

### D9 — Compatibilidad frontend ↔ backend ↔ BD · PRESENTA ERRORES (P0)
| Frontend espera | BD (repo) |
|---|---|
| RPC `get_order_status` | no existe |
| Estado `preparing` | no existe (`processing`) |
| `products.style_line_id`, `slug`, `images` | no existen |
| Cupones `JM10OFF`, `BIENVENIDO2026` locales | tabla `coupons` vacía en seeds |
| Ítems del pedido visibles al cliente | sin política SELECT |
| Galería por color | sin modelo |

---

## 5. Criterios para considerar la BD terminada
1. `supabase db reset` (o equivalente) aplica **todas** las migraciones desde cero sin errores, en CI, en cada PR.
2. Esquema del repo == esquema de QA (diff vacío con `supabase db diff`).
3. Suite pgTAP (o SQL equivalente) que cubra: checkout, idempotencia, pago→inventario, cancelación→restauración, concurrencia de stock, cupones, transiciones OMS, RLS por rol (anon, cliente, admin, super_admin, service_role).
4. Sin tablas/funciones POS legado.
5. Seeds de QA deterministas (catálogo mínimo con variantes, stock, cupones, usuarios de prueba).
6. Modelo de imágenes por color y atributos de catálogo usados por la UI.

## 6. Recomendación de estrategia
**Migración base nueva ("squash")** generada a partir del esquema objetivo (no del remoto con *drift*), validada localmente, más un script de transición para QA. Production solo se migra por decisión humana, fuera del alcance de los agentes.

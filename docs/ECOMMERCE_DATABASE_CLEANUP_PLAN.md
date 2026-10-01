# PLAN DE MIGRACIÓN Y LIMPIEZA DE ARQUITECTURA BASE DE DATOS (E-COMMERCE)
**Proyecto:** J&M FASHION STORE Colombia  
**Documento:** `/docs/ECOMMERCE_DATABASE_CLEANUP_PLAN.md`  
**Estatus:** PLANIFICACIÓN Y AUDITORÍA COMPLETA (Sin modificaciones destructivas aún).

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO ARQUITECTÓNICO

El presente documento define la estrategia para refactorizar y especializar la base de datos PostgreSQL en Supabase para **J&M FASHION STORE**, eliminando toda la infraestructura legacy heredada de punto de venta físico (POS), turnos de caja y transferencias presenciales, para consolidar una arquitectura **100% orientada al comercio electrónico**.

### Flujo de Datos Autoritativo E-Commerce:
```
[CLIENTE / INVITADO]
       │
       ▼
[CATÁLOGO & VARIANTES] (products, variants, sizes, colors)
       │
       ▼
[INVENTARIO EN BODEGA] (inventories, location_shelf, stock >= 0)
       │
       ▼
[CARRITO DE COMPRA] (carts, cart_items)
       │
       ▼
[CHECKOUT AUTORITATIVO] (create_online_order_validated_idempotent)
       │  ├── Validar stock real (FOR UPDATE)
       │  ├── Precios server-side desde DB (ignora precios del cliente)
       │  ├── Aplicar cupones y calcular envío
       │  └── Prevenir duplicados (idempotency_key)
       ▼
[PEDIDO ONLINE & ITEMS] (online_orders, online_order_items - status: 'pending')
       │
       ▼
[PASARELA DE PAGO WOMPI] (payment_transactions - status: PENDING -> APPROVED)
       │
       ▼
[CONFIRMACIÓN DE PAGO WEBHOOK] (signature SHA-256 + Idempotencia)
       │  ├── online_orders.status = 'paid'
       │  └── process_online_order_inventory() (Descuento atómico de stock)
       ▼
[DESPACHO Y SEGUIMIENTO OMS] (processing -> shipped -> delivered)
```

---

## 2. TABLAS DEL SISTEMA

### A. Tablas Core E-Commerce (A CONSERVAR INTACTAS - 26 Tablas)
No sufrirán eliminación ni alteración de registros comerciales, precios, SKU o stock:
1. `products` (Catálogo maestro)
2. `variants` (Variantes por talla, color, SKU, precio override)
3. `sizes` (Maestro de tallas)
4. `colors` (Maestro de colores)
5. `brands` (Marcas)
6. `categories` (Categorías de prendas)
7. `collections` (Colecciones de moda)
8. `seasons` (Temporadas)
9. `style_lines` (Líneas de estilo: Urbano, Elegante, Smart Casual)
10. `inventories` (Stock por variante y ubicación)
11. `inventory_movements` (Historial de movimientos: PURCHASE, SALE, ONLINE_ORDER, RETURN, ADJUSTMENT, RESTOCK)
12. `branches` (Bodega principal de distribución E-Commerce)
13. `carts` (Carritos activos)
14. `cart_items` (Ítems de carrito)
15. `customers` (Clientes E-Commerce)
16. `customer_addresses` (Direcciones de envío en Colombia)
17. `profiles` (Perfiles y roles de administración `super_admin`, `admin`, `customer`)
18. `online_orders` (Encabezados de pedidos con `idempotency_key`)
19. `online_order_items` (Snapshots históricos de compra: nombre, talla, color, SKU, precio unitario al comprar)
20. `order_events` (Timeline de auditoría de estados del pedido)
21. `order_refunds` (Devoluciones y reembolsos)
22. `payment_transactions` (Transacciones de pasarela Wompi)
23. `coupons` (Cupones de descuento)
24. `product_reviews` (Reseñas de productos por clientes)
25. `audit_logs` (Auditoría general del sistema)
26. `role_permissions` (Matriz de permisos administrativos)

### B. Tablas POS Legacy (A ELIMINAR - 6 Tablas)
Se retirarán una vez desarticuladas todas sus dependencias:
1. `employees` (Personal de caja física)
2. `shifts` (Turnos y arqueos de caja física)
3. `sales` (Ventas presenciales)
4. `sale_items` (Detalle de ventas presenciales)
5. `transfers` (Traslados de inventario entre tiendas presenciales)
6. `transfer_items` (Detalle de traslados presenciales)

---

## 3. FUNCIONES PL/pgSQL A CONSERVAR VS ELIMINAR

### A. Funciones Core E-Commerce (A CONSERVAR & OPTIMIZAR)
* `create_online_order_validated_idempotent`: Función principal de Checkout con validación server-side de precios (`GREATEST`), stock, cupones e idempotencia.
* `process_online_order_inventory`: Descuento atómico de stock al confirmarse el pago por el webhook de Wompi.
* `adjust_inventory_stock`: Ajustes de inventario desde el Dashboard Admin E-Commerce.
* `get_available_stock`: Consulta de stock disponible por variante.
* `update_order_status` & `update_order_status_oms`: Transiciones oficiales de estado del pedido (`pending` -> `payment_pending` -> `paid` -> `processing` -> `shipped` -> `delivered` -> `cancelled` / `refunded`).
* `handle_new_user_profile`: Auto-creación de perfil al registrarse en `auth.users`.
* `is_admin`: Verificación de rol administrativo en `public.profiles`.
* `has_permission`: Verificación de permisos de administración (actualizada para usar `profiles`).
* `process_audit_log_hardened`: Auditoría de cambios en catálogo e inventario.
* `update_modified_column`: Actualización automática de `updated_at`.
* `get_commercial_dashboard_metrics`: Cálculo de kpis del E-Commerce (ventas online, ticket promedio, pedidos).

### B. Funciones POS Legacy (A ELIMINAR)
* `create_sale_atomic` (Creación de venta física)
* `current_employee_branch` (Obtención de sucursal del empleado de caja)
* `current_employee_role` (Obtención de rol del empleado de caja)
* `deduct_inventory_on_sale` & `deduct_inventory_on_sale_secured` (Descuento de stock POS)
* `validate_sale_shift_active` (Exigencia de turno abierto para vender)
* `validate_shift_closing` & `validate_shift_opening` (Apertura y cierre de turnos)
* `create_online_order_validated` (Versión antigua redundante sustituida por la versión idempotente)

---

## 4. TRIGGERS Y VISTAS MATERIALIZADAS

### A. Triggers a Conservar (E-Commerce & Auditoría)
* `update_branches_modtime`, `update_categories_modtime`, `update_products_modtime`, `update_variants_modtime`, `update_customers_modtime`
* `audit_products_trigger`, `audit_variants_trigger`, `audit_inventories_trigger`
* `on_auth_user_created` en `auth.users`

### B. Triggers POS a Eliminar
* `sale_deduct_inventory` en `sale_items`
* `audit_sales_trigger` en `sales`
* `check_sale_shift_active` en `sales`
* `check_double_shift` en `shifts`
* `check_double_close` en `shifts`
* `update_employees_modtime` en `employees`
* `update_transfers_modtime` en `transfers`

### C. Vistas Materializadas de Analytics (Reconstrucción)
* `mv_daily_sales`: Se elimina la versión sobre `sales` y se reconstruye consultando `online_orders` donde `status = 'paid'`.
* `mv_monthly_sales`: Se elimina la versión sobre `sales` y se reconstruye consultando `online_orders` donde `status = 'paid'`.
* `mv_top_products`: Se elimina la versión sobre `sale_items` y se reconstruye consultando `online_order_items` de órdenes pagadas.

---

## 5. POLÍTICAS RLS Y SEGURIDAD

### Eliminación y Reemplazo de Políticas POS
Las siguientes políticas RLS dependen de las funciones POS `current_employee_branch()` y `current_employee_role()` y serán eliminadas/reemplazadas antes de eliminar las tablas:
1. `branch_select_policy` en `branches` $\rightarrow$ Reemplazada por `branch_read_policy` (lectura pública) y `branch_admin_policy` (`is_admin()`).
2. `inventory_select_policy` en `inventories` $\rightarrow$ Reemplazada por `inventory_read_policy` (lectura pública) e `inventory_admin_policy` (`is_admin()`).
3. `audit_select_policy` en `audit_logs` $\rightarrow$ Reemplazada por `audit_admin_policy` (`is_admin()`).
4. Políticas en `sales`, `sale_items`, `shifts`, `employees`, `transfers` $\rightarrow$ Eliminadas con las tablas POS.

---

## 6. ORDEN CRONOLÓGICO DE MIGRACIÓN (SCRIPT SPLIT)

Para garantizar ejecuciones seguras y sin bloqueos de dependencias, la migración se dividirá en **9 scripts SQL transaccionales**:

1. `001_cleanup_pos_dependencies.sql`: Elimina políticas RLS obsoletas y crea las políticas de E-Commerce sobre `branches`, `inventories` y `audit_logs`.
2. `002_cleanup_pos_functions.sql`: Elimina las 8 funciones exclusivas del POS y actualiza `has_permission()`.
3. `003_cleanup_pos_triggers.sql`: Elimina los triggers vinculados a ventas y turnos de caja física.
4. `004_refactor_inventory.sql`: Consolida la tabla `inventories` con la bodega principal E-Commerce.
5. `005_refactor_online_orders.sql`: Asegura los estados, la restricción `UNIQUE(idempotency_key)` y los snapshots históricos en `online_order_items`.
6. `006_refactor_payment_flow.sql`: Consolida la tabla `payment_transactions` y su integración con Wompi.
7. `007_refactor_rls.sql`: Audita e impone seguridad RLS estricta en todas las tablas del E-Commerce.
8. `008_cleanup_analytics.sql`: Reconstruye las Vistas Materializadas `mv_daily_sales`, `mv_monthly_sales` y `mv_top_products` sobre `online_orders`.
9. `009_final_integrity_checks.sql`: Ejecuta validaciones automatizadas confirmando que no existen referencias rotas.

---

## 7. MATRIZ DE RIESGOS Y MITIGACIÓN

| Riesgo | Impacto | Estrategia de Mitigación |
| :--- | :---: | :--- |
| **Error de dependencias por `DROP TABLE` prematuro** | ALTO | Se desacoplan primero las políticas RLS y vistas antes de eliminar cualquier tabla. |
| **Doble descuento de inventario** | ALTO | Se elimina el trigger `sale_deduct_inventory`. El descuento de stock se consolida únicamente en `process_online_order_inventory` ejecutado tras la aprobación de Wompi. |
| **Alteración de precios por clientes en frontend** | ALTO | `create_online_order_validated_idempotent` valida precios reales en DB (`variants` + `products`) e ignora precios pasados en la petición HTTP. |
| **Pérdida de datos históricos** | MEDIO | No se elimina ninguna tabla del E-Commerce ni registros de transacciones Wompi o prendas de catálogo. |

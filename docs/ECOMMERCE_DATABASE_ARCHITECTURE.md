# ARQUITECTURA TÉCNICA DE BASE DE DATOS Y FLUJOS E-COMMERCE
**Proyecto:** J&M FASHION STORE Colombia  
**Documento:** `/docs/ECOMMERCE_DATABASE_ARCHITECTURE.md`  
**Estatus:** ARQUITECTURA E-COMMERCE CONSOLIDADA Y VERIFICADA.

---

## 1. DIAGRAMA DE ARQUITECTURA TÉCNICA Y FLUJO AUTORITATIVO

```
[CLIENTE / INVITADO (Navegador)]
              │
              ▼
    [1. SELECCIÓN DE PRENDA] ────► products / variants / sizes / colors / inventories
              │
              ▼
    [2. CARRITO PERSISTENTE] ────► carts / cart_items
              │
              ▼
    [3. CHECKOUT AUTORITATIVO] ───► RPC create_online_order_validated_idempotent()
              │                    ├── Precios reales en DB (FOR UPDATE)
              │                    ├── Validación de Stock
              │                    ├── Cupones & Envío (Cálculo con GREATEST)
              │                    └── idempotency_key UNIQUE
              ▼
    [4. PEDIDO PROVISIONAL] ─────► online_orders (status: 'pending')
              │                    online_order_items (Snapshots Históricos)
              ▼
    [5. PASARELA DE PAGO] ───────► Wompi Colombia (Checkout Widget con Firma SHA-256)
              │
              ▼
    [6. WEBHOOK DE CONFIRMACIÓN] ─► API /api/wompi/webhook
              │                    ├── Validación Criptográfica signature.checksum
              │                    ├── Control de Idempotencia por transaction_reference
              │                    ├── online_orders.status = 'paid'
              │                    ├── payment_transactions (status: 'APPROVED')
              │                    └── process_online_order_inventory() (Descuento atómico de stock)
              ▼
    [7. SEGUIMIENTO & OMS] ──────► order_events (pending -> paid -> processing -> shipped -> delivered)
```

---

## 2. DICCIONARIO Y RELACIONES DE ENTIDADES (E-COMMERCE MAESTRO)

### A. Catálogo y Variantes
* **`products`**: Tabla principal de productos (`id`, `name`, `slug`, `base_price`, `description`, `images`, `category_id`, `brand_id`, `season_id`, `collection_id`, `style_line_id`).
* **`variants`**: Variantes de inventario por prenda (`id`, `product_id`, `size_id`, `color_id`, `sku`, `price_override`, `cost_override`).

### B. Inventario y Bodega E-Commerce
* **`branches`**: Bodega de despacho principal E-Commerce.
* **`inventories`**: Control de existencias por variante y bodega (`id`, `branch_id`, `variant_id`, `stock >= 0`, `min_stock >= 0`, `location_shelf`, `UNIQUE(branch_id, variant_id)`).
* **`inventory_movements`**: Historial de movimientos (`variant_id`, `branch_id`, `quantity_before`, `quantity_after`, `movement_type`: `ONLINE_ORDER`, `PURCHASE`, `RETURN`, `ADJUSTMENT`, `RESTOCK`).

### C. Carrito y Clientes
* **`carts` & `cart_items`**: Carritos activos persistidos por `user_id` o `session_id`.
* **`customers` & `customer_addresses`**: Perfiles de clientes y sus direcciones registradas en Colombia.
* **`profiles`**: Perfiles vinculados a `auth.users` con rol (`super_admin`, `admin`, `customer`).

### D. Pedidos, Pasarela y OMS
* **`online_orders`**: Encabezados de pedidos con `order_number`, `idempotency_key`, `shipping_cost`, `subtotal`, `discount`, `total`, `status`.
* **`online_order_items`**: Ítems de la compra conservando el **snapshot histórico** (`product_name`, `size`, `color`, `sku`, `unit_price`, `quantity`, `total`).
* **`payment_transactions`**: Registro autoritativo de transacciones de Wompi (`wompi_transaction_id`, `transaction_reference`, `amount_in_cents`, `currency`, `payment_method_type`, `status`: `PENDING`, `APPROVED`, `DECLINED`, `VOIDED`, `ERROR`).
* **`order_events`**: Auditoría de la línea de tiempo del pedido.
* **`order_refunds`**: Registro de devoluciones y reembolsos.

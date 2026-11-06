# 24 — AUDITORÍA BACKEND · J&M FASHION STORE

**Misión:** 23 — Auditoría integral (solo diagnóstico)
**Repositorio:** `unjuandice3333-star/j-m` · rama `main` · commit `2661f2a` (2026-10-13)
**Fecha de auditoría:** 2026-11-06
**Alcance:** lógica de servidor = funciones PL/pgSQL en Supabase (`supabase/migrations/*.sql`), Vercel Serverless Functions (`apps/web/api/wompi/*.js`), Supabase Edge Function (`supabase/functions/wompi-webhook/index.ts`) y la capa de servicios del cliente que actúa como "backend" (`apps/web/src/services/*`, `apps/web/src/store/eCommerceStore.js`).

> **Cómo se obtuvo la evidencia.** No se accedió a Supabase QA ni Production. Las migraciones se reprodujeron en un **PostgreSQL 16 local y temporal** (con un *shim* mínimo de Supabase: roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()`, `auth.role()`), y las funciones se ejecutaron allí. Los scripts y salidas están en `evidencias/`. Las conclusiones sobre el **estado remoto** (Production/QA) se marcan como *inferencia* cuando no pueden comprobarse.

---

## 1. Arquitectura real del backend

No existe un servidor de aplicación propio. El "backend" está repartido en:

| Pieza | Ubicación | Rol |
|---|---|---|
| PostgreSQL + RLS (Supabase) | `supabase/migrations/` (16 archivos) | Reglas de negocio en funciones RPC y triggers |
| Firma de integridad Wompi | `apps/web/api/wompi/signature.js` | Vercel Function, calcula SHA-256 con `WOMPI_INTEGRITY_SECRET` |
| Webhook Wompi (versión A) | `apps/web/api/wompi/webhook.js` | Vercel Function |
| Webhook Wompi (versión B) | `supabase/functions/wompi-webhook/index.ts` | Supabase Edge Function (Deno), **lógica duplicada** de la versión A |
| Acceso directo a tablas desde el navegador | `apps/web/src/services/productService.js`, páginas admin | CRUD con `anon key` + RLS |

**Hallazgo estructural:** la mayor parte de la lógica administrativa (crear productos, listar pedidos, clientes, inventario) se ejecuta **desde el navegador directamente contra las tablas**, dependiendo 100 % de RLS. No hay capa de API intermedia ni validación de esquema de entrada (zod, etc.).

---

## 2. Clasificación por módulo

| # | Módulo | Estado | Prioridad |
|---|---|---|---|
| B1 | Autenticación y gestión de usuarios | IMPLEMENTADO, PERO NO VERIFICADO | P1 |
| B2 | Productos y variantes (CRUD) | PRESENTA ERRORES | P0 |
| B3 | Inventario y movimientos de existencias | PRESENTA ERRORES | P0 |
| B4 | Carrito en servidor | PARCIALMENTE IMPLEMENTADO | P2 |
| B5 | Proceso de compra (RPC de creación de pedido) | PRESENTA ERRORES | P0 |
| B6 | Administración de pedidos / OMS | PRESENTA ERRORES | P0 |
| B7 | Wompi — firma de integridad | IMPLEMENTADO, PERO NO VERIFICADO | P1 |
| B8 | Wompi — webhook y confirmación de pago | Lógica: IMPLEMENTADO Y VERIFICADO (con mocks) · Integración con BD: PRESENTA ERRORES | P0 |
| B9 | Cupones y descuentos | PARCIALMENTE IMPLEMENTADO | P1 |
| B10 | Reseñas | SIMULADO O MOCK (tabla sin uso) | P2 |
| B11 | Analítica (métricas de dashboard) | PRESENTA ERRORES | P1 |
| B12 | Reembolsos / devoluciones | NO IMPLEMENTADO (solo tabla) | P2 |
| B13 | Notificaciones (email/WhatsApp transaccional) | NO IMPLEMENTADO | P2 |
| B14 | Envíos / guías de transporte | PARCIALMENTE IMPLEMENTADO | P2 |
| B15 | Manejo de errores y validaciones | PARCIALMENTE IMPLEMENTADO | P1 |
| B16 | Código duplicado / legado POS | REQUIERE REVISIÓN | P1 |

---

## 3. Hallazgos detallados

### B1 — Autenticación y usuarios · IMPLEMENTADO, PERO NO VERIFICADO
- **Implementado:** Supabase Auth (email/contraseña + Google OAuth) en `apps/web/src/store/authStore.js`; tabla `profiles` + trigger `on_auth_user_created` → `handle_new_user_profile()` (`20260927030000_auth_profiles_rls.sql`, endurecida en `20260927090000_strict_customer_role_on_signup.sql`); `is_admin()` SECURITY DEFINER con `search_path` fijo.
- **Evidencia local:** el alta de un usuario en `auth.users` crea su perfil `customer`; un cliente que intenta `UPDATE profiles SET role='admin'` es rechazado por RLS (prueba T15, `evidencias/runtime_tests_output.txt`).
- **Problemas:**
  - El super-admin se asigna por **email fijo en una migración** (`20260927080000_admin_authorized_email_role.sql` y `…090000…`, correo `unjuandice3333@gmail.com`). No existe flujo de gestión de roles.
  - `AdminPasswordSetup.jsx` existe pero **no tiene ruta** en `AppRoutes.jsx` (código huérfano).
  - `index.html` carga el SDK de Google Identity (`accounts.google.com/gsi/client`) que no se usa (OAuth va por Supabase).
  - Google OAuth no se pudo verificar (requiere configuración del proveedor en Supabase).
- **Terminado cuando:** login email + Google probados E2E en QA; gestión de roles admin desde el panel o script controlado; ruta de recuperación de contraseña funcional; perfil se crea en el 100 % de altas.

### B2 — Productos y variantes · PRESENTA ERRORES
- **Archivos:** `apps/web/src/services/productService.js`, `apps/web/src/pages/admin/AdminProductFormPage.jsx`.
- **Problemas (con evidencia):**
  1. `createProduct()` inserta `style_line_id` (línea 280) y `updateProduct()` también; **esa columna no existe en ninguna migración** (prueba T8: `products` no tiene `style_line_id`, `slug` ni `images`). En una BD reconstruida desde el repo, crear producto **falla**. Si funciona en Production, hay *drift* de esquema no versionado.
  2. Fallback `styleLineId = 's1000000-…'` (línea 248): **UUID inválido** (`s` no es hexadecimal).
  3. El formulario envía `colors`, `sizes`, `images`, `originalPrice`, `fit`, `occasion`, `isNew`, `status`… pero `createProduct` **solo inserta la fila maestra**: **no crea variantes, ni inventario, ni imágenes**. Un producto creado desde el admin **no se puede comprar** (el checkout exige `variant_id` válido).
  4. `AdminProductFormPage.jsx:127` llama `addProduct()` **sin `await`**; luego navega a `/producto/${createdProduct.slug}` → `slug` de una Promise = `undefined`; los errores de Supabase quedan sin manejar.
  5. `getProductBySlug()` devuelve `products[0]` si el slug no existe (verificado en navegador: `/producto/x-no-existe` muestra "Camiseta Heavyweight Oversize Essential").
  6. `getProducts()` ante **cualquier** error devuelve el catálogo `PRODUCTS` de `mockData.js` (verificado: con Supabase inalcanzable el catálogo muestra 18 productos ficticios). El sitio puede "funcionar" en apariencia mostrando datos falsos sin que nadie lo note.
  7. `rating` 4.9 y `reviewCount` 12 por defecto (líneas 99-100): datos inventados en la ficha.
- **Terminado cuando:** CRUD completo producto → variantes (talla×color, SKU, barcode) → inventario inicial → imágenes por color, todo en una transacción (RPC); sin fallback a mock en producción; 404 real para slug inexistente; esquema y código alineados.

### B3 — Inventario y movimientos · PRESENTA ERRORES
- **Archivos:** `20260927060000_oms_inventory_movements_refunds.sql`, `20260929000000_cleanup_pos_architecture.sql`, `20260929010000_fix_payment_inventory_atomicity.sql`, `20260930010000_fix_sizes_colors_rls_and_order_branch.sql`.
- **Diseño actual:** el stock **no se reserva** al crear el pedido; se descuenta cuando el pedido pasa a `paid` mediante el trigger `trg_auto_inventory_on_paid` → `process_online_order_inventory()`.
- **Problemas verificados:**
  1. `process_online_order_inventory()` usa `online_orders.branch_id`, **columna que ninguna migración crea**. Prueba T4: al marcar un pedido `paid` como `service_role` (lo que hace el webhook) ⇒ `ERROR: record "v_order" has no field "branch_id"` ⇒ **la actualización a `paid` se revierte** y el webhook respondería 500.
  2. La misma función inserta en `inventory_movements` las columnas `inventory_id` y `notes`, que **no existen** (la tabla tiene `reason`, `reference_type`, sin `inventory_id`), y usa `movement_type` `'ONLINE_SALE'` / `'RETURN_CANCEL'`, que **violan el CHECK** (`purchase, sale, adjustment, return, damage, restock`).
  3. Sin reserva de stock: dos clientes pueden pagar la última unidad; el segundo webhook fallará al descontar (stock insuficiente) **después de haber cobrado** → no hay compensación ni reembolso automático.
  4. `update_order_status_oms()` (restaura stock al cancelar) **falla siempre** (ver B6). `update_order_status()` (la que usa el admin) **no restaura** stock al cancelar un pedido pagado.
  5. `adjust_inventory_stock()` funciona en la BD local, pero tras `REVOKE ALL ON ALL FUNCTIONS … FROM authenticated` (`20260929000000…:369`) **no se vuelve a otorgar EXECUTE** a `authenticated`. *Inferencia:* si esa migración se aplicó en remoto, el ajuste de inventario desde el admin devuelve "permission denied".
  6. Política `inventory_admin_select` (si se aplicó la limpieza) solo admite `role = 'admin'`, **excluye `super_admin`**.
- **Terminado cuando:** reserva o validación definitiva de stock con estrategia de sobreventa definida; deducción idempotente al pagar probada contra BD real reconstruida; movimientos con esquema único; restauración al cancelar/reembolsar; pruebas de concurrencia (2 compradores, 1 unidad).

### B4 — Carrito en servidor · PARCIALMENTE IMPLEMENTADO
- **Archivos:** `20260927040000_carts_server_side.sql`, `eCommerceStore.js` `syncCartWithServer()` (líneas 131-200).
- **Problemas:** el carrito real vive en `localStorage` (Zustand `persist`). La sincronización con `carts/cart_items` es **solo escritura**: nunca se lee el carrito del servidor, nunca se eliminan ítems borrados (solo `upsert`), y el precio enviado (`unit_price`) es el del cliente. El acceso de invitados depende del header `x-session-id` (`setHeader`), que requiere revisión de compatibilidad con la versión de `supabase-js`. No hay fusión carrito invitado → usuario al iniciar sesión.
- **Terminado cuando:** decisión explícita (carrito solo local **o** servidor como fuente de verdad); si es servidor: lectura, borrado, fusión y expiración probados.

### B5 — Proceso de compra (RPC) · PRESENTA ERRORES
- **Función vigente:** `create_online_order_validated_idempotent()` (última versión en `20260930010000…`; la versión que realmente queda en una reconstrucción limpia es la de `20260929010000…` porque `…0930…` falla).
- **Correcto (verificado T1):** recalcula subtotal con precio de BD, ignora el precio del cliente para el **total**, aplica envío ($15.000 bajo $200.000), idempotencia por `idempotency_key`, bloqueo `FOR UPDATE`.
- **Problemas verificados:**
  1. **Las líneas del pedido guardan el precio enviado por el cliente.** T1 con `price: 1` ⇒ `online_orders.total = 200000` pero `online_order_items.unit_price = 1.00`, `total = 2.00`. Si no se envía precio ⇒ se guarda `129900` fijo (T12: subtotal 100000 vs suma de ítems 129900). El "snapshot histórico" es falso.
  2. Nombre/talla/color de la línea también vienen del cliente (`COALESCE(v_item->>'name', …)`), con valores por defecto inventados (`'Negro Azabache'`, `'M'`).
  3. `p_user_id` es un parámetro libre ejecutable por `anon`: cualquiera puede asociar un pedido al `user_id` de otro usuario si conoce su UUID (bloqueado solo por FK si el UUID no existe — T2).
  4. Cupón inexistente o inválido se **ignora en silencio** (T3); el frontend muestra un descuento que el servidor no aplica (ver B9).
  5. `shipping_method` "Envío Expreso 24h" se registra, pero el servidor **no cobra** diferencia.
  6. Pago **contraentrega**: se crea el pedido en `payment_pending` y no hay ningún flujo que lo avance; quedará pendiente para siempre.
  7. Política `order_public_insert … WITH CHECK (TRUE)` (`20260927010000…`): `anon` puede **insertar pedidos directamente** sin pasar por la RPC, incluso con `status='paid'` y total 0 (verificado T11).
  8. `order_number` = epoch + 3 dígitos aleatorios: posibilidad de colisión bajo concurrencia (UNIQUE fallará con error genérico).
- **Terminado cuando:** líneas con precio/nombre/talla/color desde BD; `user_id` tomado de `auth.uid()`; cupón inválido ⇒ error explícito; costos de envío por método; contraentrega con estado propio; INSERT directo a `online_orders` prohibido; número de pedido con secuencia.

### B6 — Administración de pedidos / OMS · PRESENTA ERRORES
- **Problemas verificados:**
  1. `update_order_status_oms()` compara con el literal `'packed'`, que **no existe** en el enum `online_order_status` ⇒ **falla en todas las llamadas** (T5b: `invalid input value for enum online_order_status: "packed"`).
  2. El panel `AdminOrdersPage.jsx:320` ofrece el estado `preparing`, que **no existe** en el enum (T6: error). Falta `processing` y `refunded` en el selector.
  3. El número de guía (`modalTracking`) se guarda solo en el estado local de React; **no se persiste** en `online_orders.tracking_number`.
  4. Máquina de estados débil: `update_order_status()` permite saltos como `payment_pending → delivered`.
  5. *Inferencia:* `update_order_status` y `get_commercial_dashboard_metrics` también quedaron sin `EXECUTE` para `authenticated` tras el `REVOKE` global.
- **Terminado cuando:** una sola función de transición con tabla de transiciones válidas, enum alineado UI/BD, guía persistida, eventos en `order_events`, pruebas por transición.

### B7 — Firma de integridad Wompi · IMPLEMENTADO, PERO NO VERIFICADO
- **Archivo:** `apps/web/api/wompi/signature.js`. Fórmula correcta (`reference + amount_in_cents + currency + secret`) y monto tomado de BD.
- **Problemas:** si falta `SUPABASE_SERVICE_ROLE_KEY` usa la `anon key` (línea 29), con la cual RLS impide leer el pedido ⇒ respuesta **HTTP 444** (código no estándar). No valida que el pedido esté en `payment_pending` (puede firmar pedidos pagados/cancelados). No hay prueba automatizada ni prueba en sandbox documentada con evidencia.
- **Terminado cuando:** prueba en Wompi Sandbox con evidencia (referencia, monto, estado); rechazo de pedidos no pagables; código 404/409 estándar; sin fallback a anon.

### B8 — Webhook Wompi · lógica VERIFICADA con mocks / integración PRESENTA ERRORES
- **Archivos:** `apps/web/api/wompi/webhook.js` (Vercel) y `supabase/functions/wompi-webhook/index.ts` (Edge) — **mismo código duplicado**.
- **Verificado:** suite Edge 12/12 PASS ejecutada con Deno 2.9.6; suite Vercel 12/12 PASS tras adaptar en copia temporal la API de *mock* a Node 22 (ver doc 28). Cubre firma, propiedades firmadas, monto/moneda, idempotencia, secuestro de transacción.
- **Problemas:**
  1. Al hacer `UPDATE online_orders SET status='paid'` se dispara la deducción de inventario, que **falla** (B3) ⇒ webhook 500 ⇒ Wompi reintenta indefinidamente; el cliente pagó y el pedido no queda pagado.
  2. Un evento `DECLINED/VOIDED` tardío sobre un pedido en `processing`/`shipped` lo pasa a `cancelled` (solo protege `paid`).
  3. No valida `event === 'transaction.updated'` ni antigüedad del `timestamp` (reproducción).
  4. `.or(...)` construido por interpolación de cadenas con datos del payload.
  5. Dos endpoints activos posibles: **no está documentado cuál está registrado en Wompi**. `ARCHITECTURE.md` dice Edge Function; `docs/ECOMMERCE_DATABASE_ARCHITECTURE.md` dice `/api/wompi/webhook`.
- **Terminado cuando:** un único webhook; prueba de integración contra BD reconstruida (no mocks); prueba en Wompi Sandbox con evento real; política de reintentos y alerta.

### B9 — Cupones · PARCIALMENTE IMPLEMENTADO
- **Servidor:** tabla `coupons` y validación en la RPC (`percent`, `fixed`; `free_shipping` **no se aplica** aunque es un tipo permitido; `min_purchase_amount` **no se valida**).
- **Cliente:** `eCommerceStore.applyCoupon()` **acepta solo dos códigos fijos en el código** (`JM10OFF`, `BIENVENIDO2026`) sin consultar la BD.
- **Admin:** `AdminDiscountsPage.jsx` es **simulado** (estado local con 3 cupones inventados).
- `coupon_public_read` permite a cualquiera **listar todos los cupones activos** (T13).
- **Terminado cuando:** RPC `validate_coupon` usada por el carrito; CRUD admin real; `min_purchase` y `free_shipping` aplicados; cupones no enumerables.

### B10 — Reseñas · SIMULADO O MOCK
Tabla `product_reviews` existe; **ningún código la usa**. La ficha muestra `REVIEWS` de `mockData.js`; el admin modera datos mock. Estado por defecto `approved` e `is_verified_buyer = TRUE` en la tabla (incorrecto para reseñas reales).

### B11 — Analítica · PRESENTA ERRORES
`get_commercial_dashboard_metrics()` usa el literal `'packed'` ⇒ **falla siempre** (verificado). Las vistas materializadas `mv_*` se basan en tablas POS (`sales`) y son las que bloquean la migración de limpieza.

### B12–B14 — Reembolsos, notificaciones, envíos
- `order_refunds`: tabla y RLS, **sin flujo** ni integración con API de reembolsos de Wompi.
- No existe envío de correos/WhatsApp transaccional (confirmación, envío, entrega).
- Columnas `carrier`, `tracking_number`, `tracking_url` existen; la UI no las escribe.

### B15 — Manejo de errores y validaciones · PARCIAL
- Errores de BD se muestran crudos al usuario (`rpcError.message`), en español pero con detalles internos.
- No hay validación de formato de email/teléfono/dirección en servidor; la RPC acepta cualquier texto.
- `alert()` en admin (`AdminInventoryPage.jsx:93`).
- No hay logging estructurado ni observabilidad (Sentry o similar).

### B16 — Código duplicado y legado
- Webhook duplicado (Vercel + Edge).
- Tres versiones de `create_online_order_validated_idempotent` y cuatro de `process_online_order_inventory` en migraciones sucesivas.
- Legado POS vivo: `store/cartStore.js` (IVA 19 %, no usado), `store/syncStore.js` (llama `create_sale_atomic`, registra listeners globales `online/offline`), `layouts/DashboardLayout.jsx`, `pages/Dashboard.jsx`, `pages/Inventory.jsx`, `pages/Customers.jsx`, `hooks/useProducts.js`, `hooks/useBarcodeScanner.js`, `packages/shared` (roles POS), `packages/types`.

---

## 4. Dependencias

`B5` depende de esquema consistente (doc 26). `B8` depende de `B3`. `B2` depende de definir el modelo de imágenes por color (doc 25/26). `B9`, `B11` dependen de permisos (`GRANT`) correctos. Todo depende de **reconstruir una BD limpia y reproducible** (Misión siguiente prioritaria).

## 5. Recomendaciones (orden)
1. Congelar el esquema real de Production con `supabase db dump --schema-only` (lectura) y compararlo con el repo para medir el *drift* — por una persona autorizada, no por agentes.
2. Crear una **migración base consolidada** que reconstruya desde cero y pase en CI.
3. Rehacer RPCs de checkout, pago→inventario y OMS con pruebas SQL (pgTAP) antes de tocar UI.
4. Unificar el webhook (recomendado: Edge Function o Vercel, uno solo) y probar en Wompi Sandbox.
5. Mover CRUD admin a RPCs transaccionales.
6. Eliminar legado POS y mocks de producción.

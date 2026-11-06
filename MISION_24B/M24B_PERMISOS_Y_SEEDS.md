# M24B — PERMISOS Y SEEDS · J&M FASHION STORE

## 1. Modelo de roles

| Rol | Cómo se obtiene | Uso |
|---|---|---|
| `anon` | Petición sin sesión (PostgREST) | Visitante / comprador invitado |
| `authenticated` + `profiles.role = 'customer'` | Registro público (trigger `handle_new_user`, siempre `customer`) | Cliente |
| `authenticated` + `profiles.role = 'admin'` | `admin_set_user_role` ejecutado por un super_admin | Operación de tienda |
| `authenticated` + `profiles.role = 'super_admin'` | Script controlado o `admin_set_user_role` | Dueño: roles, bodegas, auditoría |
| `service_role` | Solo el servidor (Vercel). **Nunca en el navegador** | Pagos y job de expiración (omite RLS) |

**Ya no hay asignación de super_admin por email dentro de las migraciones**, como ocurría en el historial anterior.

## 2. Tres capas de protección
1. **Privilegios de tabla y columna** (`REVOKE` explícitos, aunque Supabase concede todo por defecto):
   - anon no tiene ningún acceso a pedidos, pagos, inventario, cupones, perfiles, direcciones, favoritos ni auditoría;
   - nadie (anon ni authenticated) puede escribir directamente en inventario, movimientos, reservas, pedidos, líneas, eventos, pagos, webhooks, redenciones, reembolsos, auditoría ni en el catálogo de estados;
   - `TRUNCATE`, `REFERENCES` y `TRIGGER` revocados en todas las tablas;
   - en `profiles`, authenticated solo puede actualizar `full_name, phone, avatar_url, preferred_size, preferred_fit, marketing_opt_in`.
2. **RLS** activa en las 34 tablas (53 políticas en `public` + 4 en `storage`; listado completo en `evidencias/politicas_rls.txt`).
3. **Funciones**: `EXECUTE` solo donde corresponde (ver §4). Las RPC admin vuelven a verificar el rol por dentro.

## 3. Matriz de acceso (verificada en `90_rls`, `01_structure` y suites funcionales)

| Recurso | anon | cliente | admin | super_admin | service_role |
|---|---|---|---|---|---|
| Productos / variantes / imágenes / colores de producto | Lectura de **activos** | Lectura de activos | Lectura total + escritura | = admin | Total |
| Catálogos (categorías, líneas, ocasiones, tallas, colores, marcas, colecciones, envíos) | Lectura de activos | Lectura de activos | Total | = admin | Total |
| Disponibilidad (`v_variant_availability`) | Lectura | Lectura | Lectura | Lectura | Total |
| Inventario, movimientos, reservas | **Sin acceso** | 0 filas | Lectura (escritura solo por RPC) | = admin | Total |
| Pedidos, líneas, eventos, pagos, reembolsos | **Sin acceso** (usa `get_order_public`) | **Solo los propios** (lectura) | Lectura total (cambios solo por la máquina de estados) | = admin | Total |
| Webhooks | Sin acceso | 0 filas | Lectura | Lectura | Total |
| Cupones / redenciones | **Sin acceso** (usa `validate_coupon`) | 0 filas | Total / lectura | = admin | Total |
| Perfiles | Sin acceso | Lectura y edición del propio (sin rol) | Lectura total | Roles vía `admin_set_user_role` | Total |
| Direcciones / favoritos | Sin acceso | Los propios | Lectura de direcciones | = admin | Total |
| Reseñas | Aprobadas | Aprobadas | Total (moderación) | = admin | Total |
| Bodegas | Sin acceso | 0 filas | Lectura | Escritura | Total |
| Auditoría | Sin acceso | 0 filas | 0 filas | **Lectura** | Total |
| Storage `product-images`, `site-content` | Lectura | Lectura | Subir / editar / borrar | = admin | Total |

Regresiones de la auditoría M23, todas verificadas como **corregidas**:

| Prueba M23 | Antes | Ahora | Suite |
|---|---|---|---|
| T9 anon lee pedidos | 0 filas (confirmación rota) | Sin acceso + `get_order_public` con token | 90, 70 |
| T10 cliente ve todos los pedidos | Sí (PII expuesta) | Solo los propios | 90 |
| T11 anon inserta pedido "paid" | Aceptado | Rechazado (42501) | 90 |
| T13 anon enumera cupones | Sí | Rechazado (42501) | 60, 90 |
| T14 cliente ve sus ítems | 0 filas | Ve los suyos (y solo esos) | 90 |
| T15 cliente se asigna admin | Rechazado | Rechazado (privilegio de columna + trigger) | 01, 90 |
| T16 cliente modifica pagos | Aceptado | Rechazado (42501) | 90 |

## 4. EXECUTE por función (verificado en `01_structure`)

| Rol | Funciones ejecutables |
|---|---|
| anon | `is_admin`, `is_super_admin`, `get_order_status_catalog`, `validate_coupon`, `quote_cart`, `create_order`, `get_order_public`, `cancel_my_order` |
| authenticated | Las de anon + `admin_upsert_product`, `admin_set_product_status`, `admin_adjust_inventory`, `admin_transition_order`, `admin_dashboard_metrics`, `admin_set_user_role` (todas devuelven 42501 si el rol no corresponde) |
| service_role | `create_payment_attempt`, `apply_payment_event`, `expire_pending_orders` |
| nadie (API) | Todo el esquema `private` |

## 5. Seeds

### 5.1 Separación por entorno
| Tipo | Ubicación | Entornos |
|---|---|---|
| Datos de referencia: bodega, marca, 22 tallas, 10 colores, 9 categorías, 3 líneas de estilo, 6 ocasiones, métodos de envío, catálogo de estados y transiciones | Dentro de la **migración base** (`ON CONFLICT DO NOTHING`, UUID v4 fijos) | Todos (incluido Production) |
| Datos de prueba (usuarios, catálogo, cupones, pedidos, reseñas) | `supabase/seeds/*.sql` (`config.toml → [db.seed]`) | Solo local, CI y QA. **Nunca Production** |

### 5.2 Contenido de los seeds de QA
| Archivo | Datos |
|---|---|
| `00_qa_users.sql` | 4 usuarios con dominio reservado `.test`: `superadmin@qa.jm.test`, `admin@qa.jm.test`, `cliente1@qa.jm.test`, `cliente2@qa.jm.test`. Contraseña de QA local: `<contraseña retirada en M26-R1>` (no es una credencial real). 2 direcciones de prueba |
| `10_qa_catalog.sql` | 8 productos creados **con la RPC real `admin_upsert_product`**, detalle abajo. 7 cupones: `QA10`, `QAFIJO20K`, `QAENVIO`, `QAEXPIRADO`, `QAAGOTADO`, `QAFUTURO`, `QAUNICO`. 4 reseñas (aprobadas, pendiente, rechazada). 1 contenido editorial |
| `20_qa_orders.sql` | 8 pedidos creados y avanzados **con las RPC reales**, uno por cada estado (detalle abajo), con intentos de pago y eventos Wompi **sintéticos** |

Productos de `10_qa_catalog.sql`:

| Producto | Caso que cubre |
|---|---|
| P1 camiseta | 3 colores × 5 tallas, galería por color + imagen general, en oferta |
| P2 camisa | 2 colores |
| P3 jean | Tallas numéricas |
| P4 tenis | Calzado |
| P5 polo | **1 sola unidad** (concurrencia) |
| P6 chaqueta | Agotada |
| P7 bermuda | Borrador |
| P8 correa | Archivada |

Pedidos de `20_qa_orders.sql`:

| Pedido | Estado final |
|---|---|
| O1 | `delivered` |
| O2 | `processing` |
| O3 | `paid` (con cupón) |
| O4 | `payment_pending` |
| O5 | `expired`, con un intento rechazado |
| O6 | `cancelled` por admin, con reingreso de stock |
| O7 | `refunded` (posventa) |
| O8 | `cancelled` por el cliente |

### 5.3 Determinismo
- IDs de usuarios, productos, variantes (derivados de `md5` en formato UUID v4), cupones y reseñas: fijos.
- Fechas de publicación: fijas.
- Números de pedido: por secuencia, iguales en cada reconstrucción.
- **Varían entre reconstrucciones** (no afectan a la lógica): `online_orders.id`, `public_token`, marcas de tiempo de pedidos y eventos, y el hash bcrypt de la contraseña (sal aleatoria).
- Verificación: `run_local.sh` reconstruye dos bases independientes y compara una huella MD5 de productos, variantes, inventario, imágenes, cupones, perfiles, pedidos y líneas. Resultado: **idéntica** (`a6831f67264faae6df0dd55754a4add5`).

### 5.4 Reglas para no contaminar Production
- Los seeds solo se cargan con `supabase db reset` (local) o con una carga explícita en QA.
- **No usar `supabase db push --include-seed` contra Production.**
- Los correos `@qa.jm.test` y las referencias `JM-*-00X` permiten detectar y eliminar datos de prueba en cualquier entorno.
- Las imágenes de prueba son URLs públicas de demostración ya usadas por el frontend actual. En producción se usará el bucket `product-images`.

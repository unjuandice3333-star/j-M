# M29 — Inventario REAL de QA (`yomgxdjgfjnrjaqiarvw`) y comparación con M24

**Cómo se obtuvo:** API de gestión de Supabase con token personal inyectado por el proxy (nunca visible para el agente),
endpoint de consultas **de solo lectura**, proyecto validado antes de consultar (`jm-fashion-qa`, ca-central-1,
ACTIVE_HEALTHY). Ninguna escritura, migración ni cambio de configuración. Production no se consultó. El JSON del
inventario (sin secretos ni correos) está fuera del repositorio.

## 1. Diagnóstico
- **QA no tiene M24.** Tiene el esquema heredado anterior: las **16 migraciones archivadas** en `supabase/migrations_legacy`
  más **12 migraciones posteriores que no existen en el repositorio** (oct–nov 2026: `fix_inventory_triggers_and_order_rls`,
  `harden_get_order_status_security`, `fix_checkout_variant_price_resolution`, `update_order_tracking_rpc`,
  `harden_order_state_machine`, `editorial_banners_persistence`, `enable_admin_colors_sizes_management`,
  `fix_dashboard_metrics_enum`, …). Se aplicaron fuera del control de versiones.
- **PostgreSQL 17** en QA; M24 está probado en PG 15 (`config.toml`) y 16 (CI local). Hay que probar M24 en PG 17 antes.
- **El frontend de M27/M28 no funcionaría contra QA:** faltan las 13 RPC del contrato (todas salvo `is_admin`) y 11 de
  las 28 tablas/vistas que usa (catálogo de imágenes, colores por producto, envíos, portada, favoritos, reservas,
  disponibilidad, valoraciones, eventos de webhook, catálogo de estados).
- **Legado POS presente:** enums `shift_status`, `payment_method_type`, `sale_status_type`, `transfer_status_type`;
  funciones `create_sale_atomic`, `validate_shift_*`, `deduct_inventory_on_sale*`; tablas `customers`, `role_permissions`,
  `carts`, `cart_items`, `seasons`.
- **Roles distintos:** `profiles.role` es `text` (valores del enum `user_role`: super_admin, admin, supervisor, cashier,
  warehouse); no existe `app_role` ni el rol `customer`.

## 2. Datos existentes (recuentos)
| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| products | 23 | online_orders | 20 |
| variants | 87 | online_order_items | 20 |
| inventories | 69 | payment_transactions | 2 |
| inventory_movements | 75 | order_events | 6 |
| categories | 10 | audit_logs | 221 |
| colors | 9 | carts / cart_items | 8 / 10 |
| sizes | 4 | site_settings | 1 |
| brands | 1 | profiles | 1 |
| coupons, reviews, addresses, collections, customers | 0 | branches | 1 |

- **Usuarios:** 1 cuenta en `auth.users`, confirmada, de un dominio real (no `@qa.jm.test`), con rol `admin`, último
  acceso 2026-11-04. No hay cuentas seed (las contraseñas comprometidas de M24–M25 **no** afectan a QA).
- **Storage:** solo el bucket `editorial_images` (público, 8 MB, 1 objeto). No existen `product-images` ni `site-content`.

## 3. Configuración
| Elemento | QA | Requisito |
|---|---|---|
| Auth Site URL | `http://localhost:3000` | URL del frontend de QA |
| Auth Redirect URLs | ninguna | `/cuenta`, `/cuenta/restablecer`, `/checkout/confirmacion` (+ `/admin`) |
| Confirmación de correo | obligatoria (`mailer_autoconfirm=false`) | decidir: con confirmación hace falta SMTP |
| SMTP propio | no (límite de **2 correos/hora** del servicio por defecto) | SMTP propio para registro y recuperación en pruebas |
| Contraseña mínima | 6 | recomendado ≥ 8 |
| Edge Function `wompi-webhook` | ACTIVE, `verify_jwt=false`, versión 3 (código anterior a M24) | redesplegar el código actual |
| Secretos de la función | `WOMPI_EVENTS_SECRET` presente; **falta `APP_ENV`** | `APP_ENV=qa` (la función actual no arranca sin él) |

## 4. Matriz de preparación (generada por `compare_inventory.mjs`)
| Componente | Estado | Estado QA | Requisito | Acción necesaria |
|---|---|---|---|---|
| Migraciones | FAIL | 28 versiones (16 heredadas, 12 desconocidas) | solo 20261106120000 | A3: historial con versiones ajenas al repositorio (16 heredadas, 12 desconocidas) u objetos desconocidos → DETENERSE: ni push ni reset sin decisión escrita (Fase C). |
| PostgreSQL | FAIL | PG 17 | PG 15 (config.toml) | Detenerse: la línea base solo está probada en la versión de la CI |
| Esquema M24 | FAIL | faltan 15 relaciones, 21 con columnas distintas, 6 ajenas; funciones: 31 faltan, 1 distintas, 24 ajenas; enums distintos: 14 | 34 tablas + 2 vistas, funciones y enums idénticos a la línea base | Aplicar M24 según la decisión de migración |
| RPC y tablas del frontend | FAIL | RPC faltantes: quote_cart, validate_coupon, create_order, get_order_public, cancel_my_order, get_order_status_catalog, create_payment_attempt, apply_payment_event, admin_upsert_product, admin_set_product_status, admin_adjust_inventory, admin_transition_order, admin_dashboard_metrics; tablas/vistas faltantes: occasions, product_images, product_colors, shipping_methods, site_content, v_product_rating, v_variant_availability, wishlist_items, webhook_events, inventory_reservations, order_status_catalog | 14 RPC y 28 relaciones | Aplicar M24 |
| Productos | FAIL | faltan product_images | estructura M24 + datos de catálogo | Aplicar M24 |
| Inventario | FAIL | faltan inventory_reservations | estructura M24 + datos de stock | Aplicar M24 |
| Pedidos | FAIL | faltan order_status_catalog, order_status_transitions, shipping_methods | estructura M24 | Aplicar M24 |
| Pagos | FAIL | payment_transactions=2, webhook_events=— | tablas y RPC de pago idénticas a M24 (firma, idempotencia) | Aplicar M24 |
| Usuarios | PASS | 1 usuarios (0 @qa.jm.test, 1 de otros dominios), confirmados 1 | cuentas de prueba (cliente y admin) con contraseña conocida por el propietario | Hay cuentas de otros dominios: inventariar y conservar antes de cualquier reset |
| Roles | FAIL | {"admin":1} | app_role {customer, admin, super_admin} y ≥1 admin | Aplicar M24 y asignar admin con admin_set_user_role |
| RLS | FAIL | tablas sin RLS: 0; políticas: 55 faltan, 2 distintas, 50 ajenas | RLS en todas las tablas y las 57 políticas de M24 | Aplicar M24 |
| Storage | FAIL | editorial_images(público, 1 obj.) | product-images y site-content públicos, 5 MB, imágenes; escritura solo admin | falta product-images; falta site-content → aplicar M24 |
| Auth redirects | FAIL | site_url definida; 0 URLs permitidas; registro activado; SMTP propio no | Site URL del frontend QA y /cuenta, /cuenta/restablecer, /checkout/confirmacion | Añadir: /cuenta, /cuenta/restablecer, /checkout/confirmacion |
| Edge Functions | PASS | wompi-webhook ACTIVE, verify_jwt=false | wompi-webhook activa con verify_jwt=false | — |
| Secrets | FAIL | nombres: WOMPI_EVENTS_SECRET | WOMPI_EVENTS_SECRET (sandbox) y APP_ENV=qa | Configurar APP_ENV (requiere autorización) |

Notas sobre la matriz: «Usuarios PASS» solo significa que hay una cuenta; no hay cuentas de prueba de cliente. «Edge
Functions PASS» se refiere a la configuración (`verify_jwt`); el código desplegado es el anterior y espera el esquema
heredado.

## 5. Diferencias críticas y riesgos
| # | Riesgo | Gravedad | Detalle |
|---|---|---|---|
| R1 | M24 **no se puede aplicar encima** | Bloqueante | Crea tipos, tablas y funciones que ya existen con otra forma (`products`, `variants`, `online_orders`, `profiles`, …): `db push` fallaría a mitad o, peor, dejaría el esquema mezclado |
| R2 | Pérdida de datos al recrear | Alto | 23 productos, 87 variantes, 69 registros de inventario, 20 pedidos, 1 imagen editorial y la cuenta admin. Hay que decidir qué conservar antes de cualquier reset |
| R3 | PG 17 no probado con M24 | Medio | Probar la línea base en PG 17 local antes de tocar QA |
| R4 | 12 migraciones fuera del repositorio | Medio | Su SQL solo existe en QA (y quizá en Production). Conviene volcarlo (`db dump`) para el archivo histórico |
| R5 | La única cuenta es la del propietario | Medio | Hay que exportarla antes y comprobar después que sigue existiendo y conserva el rol admin (en M24 el rol pasa de `text` a `app_role` y se asigna con `admin_set_user_role`) |
| R6 | Auth de QA sin redirects ni SMTP | Medio | Registro y recuperación de contraseña fallarán o se limitarán a 2 correos/hora |
| R7 | Webhook antiguo activo | Medio | Si Wompi Sandbox ya apunta a QA, los eventos llegan a código que escribe en el esquema antiguo |
| R8 | Production probablemente tiene el mismo legado | Informativo | No se consultó (prohibido). La ruta de Production necesitará su propio inventario autorizado |

## 6. Estado de preparación para la migración
**No preparado: decisión A3 → detenerse.** No hay ruta incremental. Las opciones:

| Opción | Qué implica | Esfuerzo |
|---|---|---|
| **A3-R: recrear QA con M24** (recomendada si los datos son de prueba) | Copia completa (Fase A) → reset del esquema `public` → M24 + seeds sintéticos → reparar el historial (marcar las 28 versiones como revertidas) → buckets nuevos → Auth y función | Agente 1,5–2 h · propietario 30–45 min (copia y decisión escrita) |
| **A3-M: recrear y migrar el catálogo** | Lo anterior + script revisado que transforme los 23 productos/87 variantes/inventario al modelo M24 (slug, estado, imágenes, colores por producto, tallas por grupo) | +4–6 h |
| Ajustar M24 al legado | Migraciones de transición sobre el esquema actual | No recomendado: reabre el problema que M24 resolvió |

## 7. Siguiente paso recomendado
1. **Decidir si los datos actuales de QA son de prueba** (23 productos, 20 pedidos). Si lo son → A3-R; si no → A3-M.
2. Con autorización: **copia de seguridad** de QA (`db dump` de esquema, datos y roles a un directorio privado) — es una
   operación de lectura, pero requiere la contraseña de la BD o el CLI en su equipo.
3. En local (sin tocar QA): **probar M24 en PostgreSQL 17** (stack local con `major_version = 17`).
4. Plan de ejecución A3-R/A3-M detallado para su aprobación escrita, con la verificación posterior por
   `inventory.mjs` + `compare_inventory.mjs` (todo en PASS).
5. Revocar el token personal usado en este inventario cuando no se necesite más.

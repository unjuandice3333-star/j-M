# M24C — COMPATIBILIDAD CON LOS SERVICIOS DE SUPABASE

Validación por HTTP contra el stack local (Kong en `127.0.0.1:54321`) con `evidencias/scripts/services_check.py`.
- Las llaves se leyeron de `supabase status -o json` (llaves de demostración locales) y **no** se escribieron en ninguna evidencia.
- Resultado final: **39 / 39** (`evidencias/services_results_official.json`). Antes de la corrección H1: **23 / 39** (`services_results_before_auth_fix.json`).

## 1. PostgreSQL de Supabase (15.19.0.016)

| Aspecto | Resultado |
|---|---|
| Migración base | Aplicada sin errores ni advertencias. La autoverificación interna pasó |
| `pgcrypto` en `extensions` | OK (la imagen ya la trae; `CREATE EXTENSION IF NOT EXISTS` idempotente) |
| `pg_cron` 1.6.4 | Creada por la migración; job `jm-expire-pending-orders` activo cada 5 min |
| Esquema `private` | Creado por `postgres`; PostgREST no lo expone |
| Trigger sobre `auth.users` | Creado en el `auth.users` real de GoTrue (permitido al rol `postgres`) |
| Políticas en `storage.objects` | Creadas por la migración sin errores |
| Privilegios por defecto de Supabase | Los `REVOKE` explícitos de la base surten efecto: anon recibe 401 / 42501 donde corresponde |
| `postgres` no superusuario | Sin impacto en la base; sí en la prueba con dblink (H2) |

## 2. Auth (GoTrue v2.197.0)

| Prueba | Resultado |
|---|---|
| Login de los 4 usuarios seed | **HTTP 500 sin corrección** (H1); **200 con la corrección** |
| Contraseña incorrecta | 400 |
| Registro público (signup) | 200 |
| Trigger `on_auth_user_created` → perfil | **OK**: rol `customer`, email y `full_name` del metadata |
| Autoasignación de rol por API | 403 |
| JWT de GoTrue reconocidos por `auth.uid()` / `is_admin()` en la base | **OK**: admin → `true`, cliente → `false` |

**Causa de H1:** el `auth.users` real tiene columnas de token tipo texto que GoTrue lee sin admitir NULL. El seed solo rellenaba las columnas del shim. **Corrección validada:** `evidencias/auth_seed_fix.sql` (8 columnas a `''`).

## 3. PostgREST (v16.5) a través de Kong

| Prueba | Resultado |
|---|---|
| Catálogo público con embebidos (`products → product_colors → colors`, `product_images`) | 200, 6 productos activos |
| Vista `v_variant_availability` para anon | 200 |
| Inventario / cupones / pedidos como anon | 401 (`42501`) |
| Inventario como admin | 200 |
| Pedidos como cliente | 200, solo sus 3 pedidos |
| Escritura de pagos como cliente | 403 |
| `create_order` como anon con precio manipulado | 200, total 144.900 (precio de BD) |
| Idempotencia | 200, `is_duplicate = true`, mismo `order_id` |
| **Contrato de errores** | 400 con `hint = "JM_INVALID_QUANTITY"`: el frontend puede traducir los `JM_*` |
| RPC de pagos como anon / admin | 401 / 403. Solo `service_role` (lo que usará Vercel) |
| `create_payment_attempt` + `apply_payment_event` con `service_role` | 200: `applied` → `paid`; reentrega → `duplicate` |
| `get_order_public` (anon + token) | 200, `status_label = "Pago confirmado"` |
| `admin_upsert_product` / `admin_set_product_status` / `admin_transition_order` con JWT admin | 200. Transición inválida → 400 `JM_INVALID_TRANSITION`. Cancelación con reingreso → `lines_restocked = 1` |
| `admin_upsert_product` con JWT de cliente | 403 `JM_FORBIDDEN` |

## 4. Storage (v1.88.0)

| Prueba | Resultado |
|---|---|
| Admin sube PNG a `product-images` | 200 (`Key: product-images/m24c/negro-1.png`) |
| Anon sube | Rechazado (400 → 403 interno de RLS) |
| Cliente sube | Rechazado |
| Lectura pública del objeto | 200 `image/png` (bucket público) |
| PDF (MIME no permitido) | Rechazado: el bucket aplica `allowed_mime_types` definido en la migración |

## 5. pg_cron (disparo real)

| Momento (UTC) | Evento |
|---|---|
| 05:48:06 | `create_order` → `JM-001038` en `payment_pending`, 1 unidad reservada; ventana movida al pasado |
| 05:50:00 | El job `jm-expire-pending-orders` (`succeeded`) vence el pedido **sin invocación manual** |
| Resultado | Pedido `expired`; evento `STATUS_CHANGED payment_pending → expired`, actor `system`, nota "Ventana de pago vencida"; reserva `expired`; `inventories.reserved` = 0 |

Historial del job: 05:40, 05:45 y 05:50, todas `succeeded` (`evidencias/pg_cron_evidence.txt`).

## 6. Servicios no validados (excluidos o fuera de alcance)
| Servicio | Motivo |
|---|---|
| Realtime, Edge Runtime, Studio, Analytics, imgproxy, Mailpit, Supavisor | Excluidos con `-x`; la base no depende de ellos (la Edge Function `wompi-webhook` se retira por decisión M24B) |
| Correo de confirmación de GoTrue | `enable_confirmations = false` en local |
| Google OAuth | Requiere credenciales del proveedor; fuera de alcance |
| Wompi Sandbox | Eventos simulados; integración real en una misión posterior |
